# CLAUDE.md

StarTrace — 子ども向けの「星座なぞり」Webアプリ。指で夜空をなぞると、いちばん近い星座を判定して図鑑に集められる。
このリポジトリは**自律改善ループ（AIのBuilder/Reviewer）でも運用**されているため、人にもAIにも効く前提をここにまとめる。

## コマンド

```bash
npm install        # 依存インストール
npm run dev        # ローカル開発（Vite, 127.0.0.1）
npm run test       # ユニットテスト（Vitest, 一発実行）
npm run test:watch # テスト（watch）
npm run lint       # ESLint
npm run build      # tsc -b && vite build（型チェック込み）
node --check backend/index.mjs  # Lambda の構文チェック
```

**PR を出す前に必ず通す**: `npm run lint` / `npm run test` / `npm run build`（PRのCI `.github/workflows/ci.yml` と同じ）。

## 構成

- `src/` — フロント（Vite + React 18 + TypeScript, Canvas 2D 描画）
  - `components/` UI / `hooks/` 状態 / `lib/` ロジック（`shapeMatcher.ts`=判定, `skyRenderer.ts`=夜空描画, `api.ts`, `telemetry.ts`）/ `data/`（`constellations.ts`=星座定義, `releaseNotes.ts`）
- `backend/index.mjs` — 単一 Lambda（HTTP API 経由）。`/api/*` を処理。DynamoDB 単一テーブル。
- `infra/cloudformation.yaml` — AWS 一式（S3+CloudFront+OAC+APIGW+Lambda+DynamoDB+OIDCロール）。`infra/deploy.sh` がデプロイ実体。
- `metrics/*.json` — 利用状況の日次スナップショット（自律ループの入力・生データ）。
- `docs/` — 設計ドキュメント一式（下記）。

## アーキテクチャと本番反映

- ホスティング: **S3（非公開）+ CloudFront（OAC）**。`/api/*` は CloudFront → API Gateway(HTTP API) → Lambda → DynamoDB。
- CI/CD: **GitHub Actions + OIDC**（長期キー無し）。**main へマージで自動デプロイ**（`deploy.yml` → `deploy.sh` が S3 sync＋CloudFront invalidation＋`aws lambda update-function-code`）。
- 匿名のみ。個人情報は集めない（ランダムな clientId のみ）。

## ハマりどころ（重要・再発防止）

- **デフォルトブランチは `main`**。過去に作業ブランチが既定になっていて、スケジュール実行が誤ったブランチで走り失敗した。既定は必ず `main`。
- **`infra/cloudformation.yaml` は ASCII のみ**にする。日本語コメントを入れると Windows 日本語環境（cp932）で `aws cloudformation deploy` が落ちる。
- **スタック更新（`aws cloudformation deploy`）が必要なのは `infra/**` を変えたときだけ**。`backend/index.mjs` の変更や DynamoDB の新item種別・属性の追加は**スキーマレスなので不要**（`deploy.sh` が Lambda コードを自動更新する）。インフラに触れる PR は本文先頭に「⚠️ スタック更新が必要」と明記。
- `deploy.yml` は `metrics/**` を `paths-ignore`。メトリクスの自動コミットでは本番デプロイしない。
- **自律ループのトリガー（claude.ai の Routine）は作り直さない**。作り直すとリポジトリ接続が外れる。挙動を変えたいときは**プロンプトではなく `docs/` のドキュメント側**を編集する（Routine はそれを毎回読む）。

## 自律改善ループ

「収集 → 分析 → 提案 → 実装 → 承認 → マージ → 本番」を AI が回す。人間は監督のみ（`hold` ラベルで除外、revert、Routine 一時停止）。

- **Builder（毎朝5:00 JST）**: `metrics/` を分析し、日次レポート＋改善Issueを起票、承認済みを実装して **PR 作成**（マージしない）。規約は **`docs/improvement-loop.md`**。
- **Reviewer（毎朝6:00 JST）**: Issue を承認し、CI緑を確認して **PR をマージ**。基準は **`docs/reviewer-policy.md`**。
- 目的（North Star）と判定のガードレールは **`docs/product-goal.md`**。
- ラベル: `report` / `improvement` / `approved` / `hold`（自動処理から除外＝人間預かり） / `feedback`。

## 規約

- 変更は小さく（1 Issue = 1 PR）。PR 本文に `Closes #<Issue番号>`。ユーザーに見える変更は `src/data/releaseNotes.ts` の先頭に追記。
- 既存コードの書き味（命名・コメント量・言語）に合わせる。UI 文言・リリースノート・図鑑は**ひらがな中心の子ども向け日本語**。
- テスト規約: 判定ロジック（`shapeMatcher`）は識別性・不変性（平行移動/拡縮/回転）テストを維持する。

## 詳しくは docs/

`architecture.md` / `requirements.md` / `backend.md` / `deployment.md` / `matching-algorithm.md` /
`constellation-data.md` / `visuals.md` / `zukan-feature.md` / `improvement-loop.md` / `reviewer-policy.md` / `product-goal.md`
