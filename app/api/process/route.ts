import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

type Action = "summary" | "improve" | "tasks";
type RequestBody = { action?: unknown; text?: unknown };

const MAX_INPUT_LENGTH = 8000;
const MAX_REQUEST_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30000;

type RateLimiterBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type AppCloudflareEnv = CloudflareEnv & {
  AI_RATE_LIMITER?: RateLimiterBinding;
};

const prompts: Record<Action, string> = {
  summary:
    "入力された業務文章を、重要な要点がすぐ分かるように日本語で簡潔に要約してください。事実関係を変えず、箇条書きを中心にまとめてください。",
  improve:
    "入力された業務文章を、社内外の相手に伝わりやすい自然で丁寧な日本語に改善してください。内容を勝手に追加せず、改善後の文章だけを返してください。",
  tasks:
    "入力された業務文章から、実行すべきタスクを抽出してください。担当者・期限・具体的な行動が読み取れる場合は含め、読み取れない項目は推測しないでください。Markdownのチェックリスト形式で返してください。",
};

function isAction(value: unknown): value is Action {
  return value === "summary" || value === "improve" || value === "tasks";
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function parseRequestBody(
  request: Request,
): Promise<{ body?: RequestBody; error?: NextResponse }> {
  const reader = request.body?.getReader();

  if (!reader) {
    return { error: jsonError("リクエストの形式が正しくありません。", 400) };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return {
          error: jsonError(
            "リクエストが大きすぎます。文章を短くしてお試しください。",
            413,
          ),
        };
      }

      chunks.push(value);
    }
  } catch {
    return { error: jsonError("リクエストの形式が正しくありません。", 400) };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      body: JSON.parse(new TextDecoder().decode(bytes)) as RequestBody,
    };
  } catch {
    return { error: jsonError("リクエストの形式が正しくありません。", 400) };
  }
}

async function enforceRateLimit(request: Request): Promise<NextResponse | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const limiter = (env as AppCloudflareEnv).AI_RATE_LIMITER;

    if (!limiter) {
      if (process.env.NODE_ENV === "development") {
        return null;
      }
      return jsonError("レート制限の設定が利用できません。管理者に連絡してください。", 503);
    }

    const clientIp =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For")?.split(",", 1)[0]?.trim() ??
      "anonymous";
    const result = await limiter.limit({ key: clientIp });

    if (!result.success) {
      return NextResponse.json(
        { error: "利用回数が上限に達しました。しばらく待ってから再度お試しください。" },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        },
      );
    }
  } catch {
    if (process.env.NODE_ENV !== "development") {
      return jsonError("レート制限の確認に失敗しました。時間をおいて再度お試しください。", 503);
    }
  }

  return null;
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonError("リクエストが大きすぎます。文章を短くしてお試しください。", 413);
    }
  }

  const parsed = await parseRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }
  const body = parsed.body;

  if (!body || !isAction(body.action)) {
    return jsonError("実行する処理を正しく指定してください。", 400);
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return jsonError("処理する文章を入力してください。", 400);
  }

  const text = body.text.trim();
  if (text.length > MAX_INPUT_LENGTH) {
    return jsonError(
      "入力は" + MAX_INPUT_LENGTH.toLocaleString() + "文字以内にしてください。",
      413,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError("LLM APIキーが未設定です。管理者がサーバー環境変数を設定してください。", 503);
  }

  const accessClientId = process.env.LLM_ACCESS_CLIENT_ID;
  const accessClientSecret = process.env.LLM_ACCESS_CLIENT_SECRET;
  if ((accessClientId && !accessClientSecret) || (!accessClientId && accessClientSecret)) {
    return jsonError("LLM接続用の認証設定が不完全です。管理者に連絡してください。", 503);
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        ...(accessClientId && accessClientSecret
          ? {
              "CF-Access-Client-Id": accessClientId,
              "CF-Access-Client-Secret": accessClientSecret,
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: prompts[body.action] },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return jsonError("LLM APIから回答を取得できませんでした。設定または利用状況を確認してください。", 502);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const result = typeof content === "string" ? content.trim() : "";

    if (!result) {
      return jsonError("AIから有効な回答が返されませんでした。", 502);
    }

    return NextResponse.json(
      { result, action: body.action },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("AI処理がタイムアウトしました。文章を短くして再度お試しください。", 504);
    }
    return jsonError("AI処理中に通信エラーが発生しました。時間をおいて再度お試しください。", 502);
  } finally {
    clearTimeout(timeout);
  }
}
