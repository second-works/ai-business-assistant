import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORTFOLIO_LLM_BRIDGE_PORT ?? "8765");
const UPSTREAM_BASE_URL = (process.env.LLAMA_PROXY_URL ?? "http://127.0.0.1:8082").replace(/\/$/, "");
const BRIDGE_TOKEN = process.env.PORTFOLIO_LLM_BRIDGE_TOKEN ?? readFileSync(
  "/Users/work/.openclaw/secrets/ai-business-assistant-llm-bridge.token",
  "utf8",
).trim();
const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 35_000;

if (!BRIDGE_TOKEN) {
  throw new Error("PORTFOLIO_LLM_BRIDGE_TOKEN is required");
}

function authorized(request) {
  const received = request.headers.authorization ?? "";
  const expected = `Bearer ${BRIDGE_TOKEN}`;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body-too-large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function proxy(request, response, upstreamPath, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(`${UPSTREAM_BASE_URL}${upstreamPath}`, {
      method: request.method,
      headers: {
        "Content-Type": request.headers["content-type"] ?? "application/json",
      },
      body,
      signal: controller.signal,
    });
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, {
      "Cache-Control": "no-store",
      "Content-Type": upstreamResponse.headers.get("content-type") ?? "application/json",
      "Content-Length": responseBody.length,
    });
    response.end(responseBody);
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "upstream-timeout"
      : "upstream-unavailable";
    sendJson(response, 502, { error: message });
  } finally {
    clearTimeout(timeout);
  }
}

const server = createServer(async (request, response) => {
  if (!authorized(request)) {
    response.setHeader("WWW-Authenticate", "Bearer");
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && request.url === "/api/portfolio-llm/v1/models") {
    await proxy(request, response, "/v1/models");
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/portfolio-llm/chat/completions") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    sendJson(response, 413, { error: "body_too_large" });
    return;
  }

  try {
    const body = await readBody(request);
    await proxy(request, response, "/v1/chat/completions", body);
  } catch (error) {
    if (error instanceof Error && error.message === "body-too-large") {
      sendJson(response, 413, { error: "body_too_large" });
      return;
    }
    sendJson(response, 400, { error: "invalid_request" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI Business Assistant LLM bridge listening on http://${HOST}:${PORT}`);
});
