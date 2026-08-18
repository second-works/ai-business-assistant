# Project history

## 2026-08-17 / Initial portfolio build

### Start requirements

- クラウドワークスの応募時に提示できる、実際に操作できるAI業務支援Webアプリを短期間で完成させる。
- 要約・文章改善・タスク抽出を初版の必須機能とする。
- PCとスマートフォンで使えること、APIキーをブラウザとGitHubへ出さないことを完成条件とする。
- GitHubへのpushは、登録済みアカウントとは別アカウントの確認後に行う。

### Decisions

- Next.js App Router + TypeScriptで、画面とサーバー側Route Handlerを同一アプリにまとめる。
- LLM APIはOpenAI互換 Chat Completions APIを1種類だけ利用し、`OPENAI_BASE_URL` と `OPENAI_MODEL` で差し替え可能にする。
- APIキーはサーバー環境変数だけで管理し、クライアントへ渡さない。
- Cloudflare Workersへの公開にはOpenNextとWranglerを利用する。
- 初版ではログイン、DB、課金、RAG、ファイルアップロード、音声入力、MCP、AIエージェントを実装しない。

### Current boundary

- ローカルの型チェック、Next.js本番ビルド、Cloudflare OpenNextビルド、実ブラウザのPC・390px確認まで完了。
- Cloudflare Workersへ公開済み。LLM接続は、専用ブリッジ・Bearer認証・Rate Limitingを追加して公開経路の実動作まで確認済み。

## 2026-08-17 / Private local LLM connection

### Decisions

- 公開Workerからllama-server／OpenClaw Gatewayへ直接接続しない。
- WorkerはOpenClawの既存Originホスト上の専用パスだけをCloudflare Tunnel経由で呼び出す。
- 専用ブリッジはloopbackで待ち受け、Bearerトークンを要求し、Chat Completionsだけをllama-proxyへ転送する。
- 公開アプリはログインなしで利用できるが、Cloudflare Rate LimitingをIP単位で適用する。
- Cloudflare Accessサービス トークン用のヘッダーにも対応している。AccessをOriginへ適用する場合だけWorker Secretへ登録する。

### Verified runtime

- Worker URL: `https://ai-business-assistant.katamachi.workers.dev`
- Local LLM: `gemma-4-e4b`
- Bridge: `127.0.0.1:8765`、未認証401、認証済みhealth 200
- Public API: `summary` / `improve` / `tasks` が実LLM経路で200
- Cloudflare Rate Limiting: 10 requests / 60 seconds / IP
- 入力上限: 8,000文字。ローカルLLMの長文推論が30秒を超えることを防ぐ。

## 2026-08-17 / Portfolio documentation

- システム構成、技術選定、セキュリティ、実装時の注意点、コスト面の説明を`docs/PORTFOLIO_GUIDE.md`へ追加。
- ローカルLLMによるLLM API従量課金の回避と、Cloudflare Workers無料枠を利用した小規模公開をアピールポイントとして整理。
- 無料枠の上限、ローカルPCの稼働、電気代、モデル性能、ログ保存範囲について、完全無料を保証しない注意書きを追加。
