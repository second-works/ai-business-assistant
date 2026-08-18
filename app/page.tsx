"use client";

import { useState } from "react";

type Action = "summary" | "improve" | "tasks";

const MAX_INPUT_LENGTH = 8000;

const actions: Array<{
  id: Action;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: "summary",
    label: "要約する",
    description: "要点を短く整理",
    icon: "↘",
  },
  {
    id: "improve",
    label: "文章を整える",
    description: "伝わる表現に改善",
    icon: "✦",
  },
  {
    id: "tasks",
    label: "タスクを抽出",
    description: "次の行動を明確化",
    icon: "✓",
  },
];

const sampleText =
  "今週の営業会議では、来月の新サービス紹介に向けて資料を更新することになりました。田中さんは競合サービスの価格情報を金曜日までに確認し、鈴木さんは既存顧客向けの案内文を来週月曜までに作成します。次回会議では進捗と懸念点を共有します。";

function getActionLabel(action: Action | null) {
  return actions.find((item) => item.id === action)?.label ?? "AI処理";
}

export default function Home() {
  const [input, setInput] = useState("");
  const [selectedAction, setSelectedAction] = useState<Action>("summary");
  const [result, setResult] = useState("");
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleProcess = async (action: Action = selectedAction) => {
    const trimmedInput = input.trim();
    setCopied(false);

    if (!trimmedInput) {
      setError("処理する文章を入力してください。");
      return;
    }

    if (input.length > MAX_INPUT_LENGTH) {
      setError(`入力は${MAX_INPUT_LENGTH.toLocaleString()}文字以内にしてください。`);
      return;
    }

    setSelectedAction(action);
    setIsLoading(true);
    setError("");
    setResult("");

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: trimmedInput }),
      });
      const data = (await response.json()) as { result?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "AI処理に失敗しました。時間をおいて再度お試しください。");
      }

      setResult(data.result ?? "");
      setLastAction(action);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "予期しないエラーが発生しました。",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("コピーに失敗しました。結果を選択してコピーしてください。");
    }
  };

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="AI Business Assistant ホーム">
          <span className="brand-mark">AI</span>
          <span>Business Assistant</span>
        </a>
        <span className="status-pill">
          <span className="status-dot" />
          WORKFLOW TOOL
        </span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AI WORKFLOW / PORTFOLIO EDITION</p>
          <h1>
            仕事の文章を、
            <br />
            <em>次のアクション</em>へ
          </h1>
          <p className="hero-description">
            報告書・メール・議事録などの業務文章を、生成AIで素早く整理するためのツールです。
          </p>
        </div>
        <div className="hero-note">
          <span className="note-line" />
          <p>入力した文章は、選択した処理のためだけに使用されます。</p>
        </div>
      </section>

      <section className="workspace" aria-label="AI業務アシスタント">
        <div className="panel input-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">01 / INPUT</p>
              <h2>業務文章を入力</h2>
            </div>
            <button
              className="sample-button"
              type="button"
              onClick={() => {
                setInput(sampleText);
                setError("");
              }}
            >
              サンプルを入力 <span>↗</span>
            </button>
          </div>
          <label className="sr-only" htmlFor="business-text">
            業務文章
          </label>
          <textarea
            id="business-text"
            value={input}
            onChange={(event) => {
              const nextInput = event.target.value;
              setInput(nextInput);
              if (nextInput.length > MAX_INPUT_LENGTH) {
                setError(`入力は${MAX_INPUT_LENGTH.toLocaleString()}文字以内にしてください。`);
              } else if (error) {
                setError("");
              }
            }}
            placeholder="ここに業務報告、メール、議事録などを入力してください。"
            aria-invalid={input.length > MAX_INPUT_LENGTH}
            aria-describedby="business-text-hint"
          />
          <div className="input-footer" id="business-text-hint">
            <span className={input.length > MAX_INPUT_LENGTH ? "input-count over-limit" : "input-count"}>
              {input.length.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()}文字
              {input.length > MAX_INPUT_LENGTH ? "（上限超過）" : ""}
            </span>
            <span className="private-label">● ブラウザから直接APIキーは送信されません</span>
          </div>
        </div>

        <div className="panel action-panel">
          <div className="panel-heading compact-heading">
            <div>
              <p className="panel-kicker">02 / ACTION</p>
              <h2>AIに依頼する</h2>
            </div>
            <span className="action-count">3 actions</span>
          </div>
          <div className="action-list">
            {actions.map((action) => (
              <button
                className={`action-card ${selectedAction === action.id ? "selected" : ""}`}
                key={action.id}
                type="button"
                disabled={isLoading}
                onClick={() => handleProcess(action.id)}
              >
                <span className="action-icon">{action.icon}</span>
                <span className="action-copy">
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </span>
                <span className="action-arrow">→</span>
              </button>
            ))}
          </div>
          <p className="action-hint">文章を入力して、実行したい処理を選択してください。</p>
        </div>

        <div className="panel result-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">03 / OUTPUT</p>
              <h2>AIの処理結果</h2>
            </div>
            <button className="copy-button" type="button" onClick={handleCopy} disabled={!result || isLoading}>
              <span>{copied ? "✓" : "▣"}</span> {copied ? "コピーしました" : "結果をコピー"}
            </button>
          </div>
          <div className={`result-body ${isLoading ? "loading" : ""} ${result ? "has-result" : ""}`}>
            {isLoading ? (
              <div className="loading-state" role="status" aria-live="polite">
                <span className="loading-orbit" />
                <strong>{getActionLabel(selectedAction)}しています…</strong>
                <span>文章を読み込んでいます</span>
              </div>
            ) : result ? (
              <p className="result-text">{result}</p>
            ) : (
              <div className="empty-state">
                <span className="empty-mark">✦</span>
                <p>ここに処理結果が表示されます。</p>
                <small>左側に文章を入力し、AIに依頼してください。</small>
              </div>
            )}
          </div>
          {lastAction && result && !isLoading ? (
            <div className="result-meta">
              <span>{getActionLabel(lastAction)} · 最新の結果</span>
              <span>AI Business Assistant</span>
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="error-banner" role="alert">
          <span>!</span>
          <p>{error}</p>
        </div>
      ) : null}

      <footer className="footer">
        <span>AI BUSINESS ASSISTANT</span>
        <span>Designed for focused work.</span>
      </footer>
    </main>
  );
}
