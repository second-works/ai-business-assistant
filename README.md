# AI Business Assistant

生成AIを利用して、業務文章の要約・文章改善・タスク抽出を行うポートフォリオ用Webアプリです。

## デモ

https://ai-business-assistant.katamachi.workers.dev

[ポートフォリオ向け説明書](docs/PORTFOLIO_GUIDE.md)

![デスクトップ画面](public/portfolio/desktop.png)

![スマートフォン画面](public/portfolio/mobile.png)

## 主な機能

- 業務報告・メール・議事録などの文章入力
- 要約
- 文章改善
- タスク抽出
- 処理中・エラー状態の表示
- 結果のワンクリックコピー
- PC / スマートフォン向けレスポンシブUI

## 使用技術

- Next.js / React / TypeScript
- OpenAI互換 Chat Completions API
- Cloudflare Workers（OpenNext）
- Cloudflare Tunnel / 専用LLMブリッジ

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` にサーバー側の接続設定を設定します。

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
LLM_ACCESS_CLIENT_ID=
LLM_ACCESS_CLIENT_SECRET=
```

`OPENAI_API_KEY` はブラウザへ公開されません。公開環境では、LLM APIキーではなく、loopback専用ブリッジへ接続するBearerトークンとして使用しています。`NEXT_PUBLIC_`を付けたり、ソースコードへ直接記載したりしないでください。

## 開発

```bash
npm run dev
```

http://localhost:3000 を開いてください。APIキーが未設定の場合も、画面と入力バリデーションは確認できます。

## 検証

```bash
npm run typecheck
npm run build
```

## Cloudflare Workersへの公開

OpenNextとWranglerの設定を含めています。

```bash
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

公開環境の接続先とモデルは`wrangler.jsonc`で管理し、秘密値はWrangler Secretで管理します。Cloudflare AccessでOriginを保護する場合は、`LLM_ACCESS_CLIENT_ID`と`LLM_ACCESS_CLIENT_SECRET`もWorker Secretへ登録してください。

## セキュリティ構成

- ブラウザはWorkerのAPIだけを呼び出し、LLM接続情報を受け取りません。
- WorkerはCloudflare Tunnel上の専用パスだけを呼び出します。
- 専用ブリッジは`127.0.0.1:8765`で待ち受け、Bearerトークンなしのリクエストを拒否します。
- ブリッジは許可したChat Completionsだけをllama-proxyへ転送し、OpenClaw Gatewayやllama-serverを公開しません。
- WorkerはIP単位で10回/60秒のRate Limitingを適用します。
- ログイン認証は実装していません。匿名公開の代わりに、レート制限・入力長制限・通信タイムアウトを適用しています。

## 制作目的

生成AIを利用した業務効率化Webアプリの設計・実装例として制作しています。UI設計、入力検証、LLM API連携、プロンプト設計、エラー処理、レスポンシブ対応、Cloudflareへのデプロイまでを小さく一通り実装しています。

## コスト面の特徴

- 外部LLM APIではなくローカルLLMを利用するため、通常の利用ではLLM APIの従量課金が発生しません。
- Cloudflare Workersの無料枠を前提に、小規模なポートフォリオやデモとして公開できます。
- 無料枠にはリクエスト数、ログ保存、機能の上限があり、端末の電気代や保守費用まで含めて完全無料になるわけではありません。

実装時の注意点や別環境への移植方法は、[ポートフォリオ向け説明書](docs/PORTFOLIO_GUIDE.md)にまとめています。

## 初版で実装しない機能

ログイン、データベース、課金、管理画面、複数LLM切替、RAG、ファイルアップロード、音声入力、MCP、AIエージェントは対象外です。
