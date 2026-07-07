# バックエンド・ダッシュボード・フィードバック 設計書

## 1. 目的

これまで完全な静的サイトだった StarTrace に、**全利用者にまたがる集計(ダッシュボード)**と
**フィードバック収集**を追加する。どちらも「みんなのデータを一箇所に集める」必要があるため、
既存の AWS 構成に軽量なサーバーレス・バックエンドを足す。

**プライバシー方針**: 個人情報は一切集めない。ブラウザで生成する匿名のランダムID
(`clientId`)・発見回数・フィードバック本文のみを扱う。名前・メール等は収集しない。

## 2. 構成

```
ブラウザ ──/api/*──► CloudFront ──► API Gateway (HTTP API) ──► Lambda ──► DynamoDB
   (同一オリジン。CORS不要・ビルド時のURL設定も不要)
```

- フロントは同一オリジンの `/api/...` を呼ぶだけ。CloudFront が `/api/*` を
  API Gateway に振り分ける(それ以外は S3)。
- Lambda 1本(Node.js 22)がルーティングし、DynamoDB を読み書きする。
- DynamoDB はオンデマンド課金(スケール to ゼロ)。低トラフィックならほぼ無料。

## 3. API

| メソッド・パス | ボディ | 役割 |
|---|---|---|
| `POST /api/visit` | `{ clientId }` | 匿名の「探した人」を登録(初回のみ人数+1) |
| `POST /api/discovery` | `{ clientId, constellationId }` | 発見を全体集計に加算 |
| `POST /api/feedback` | `{ clientId, message, category }` | フィードバックを保存 |
| `GET /api/stats` | – | ダッシュボード用の集計を返す |

- 発見・訪問の送信は**ベストエフォート**(失敗してもアプリは通常どおり動く)。
- フィードバックは本文500文字まで、カテゴリは `star|visual|bug|other`。
- API Gateway 側で軽いスロットリング(burst 20 / rate 10)をかけ、公開エンドポイントの
  乱用を緩和する。

## 4. データモデル(DynamoDB 単一テーブル)

| pk | sk | 主な属性 |
|---|---|---|
| `STATS` | `TOTAL` | `users`, `discoveries`(アトミック加算) |
| `CONST` | `<constellationId>` | `count` |
| `USER` | `<clientId>` | `createdAt`(存在＝ユニーク訪問者。条件付きPutで初回のみ人数加算) |
| `FEEDBACK` | `<createdAt>#<uuid>` | `message`, `category`, `clientId`, `createdAt`, `issueCreated` |

`GET /api/stats` は `STATS/TOTAL` の取得と `pk=CONST` のクエリの2読み取りだけで完結する。

## 5. フロントエンド

- `src/lib/api.ts` … API クライアント(同一オリジン `/api`。`VITE_API_BASE` で上書き可)。
- `src/hooks/useClientId.ts` … 匿名IDを localStorage に保持し、初回に訪問を登録。
- `src/components/Dashboard.tsx` … 全体集計(探した人数・発見合計・全星座制覇状況)、
  **きみ と みんな**の比較(自分の発見種類数 vs ひとり平均)、星座別ランキング
  (自分が見つけた星座には ✓)。
- `src/components/FeedbackForm.tsx` … カテゴリ選択+自由入力の投稿フォーム。送信後にお礼演出。
- 発見時に `recordDiscovery` を非同期で送る(UIはブロックしない)。

## 6. フィードバック → GitHub Issue 連携

「一旦は DynamoDB に保存し、最終的に GitHub Issue へ流したい」という要望に対応する。

- **保存**: まず DynamoDB に貯める(`issueCreated: false` で登録)。
- **確認**: `infra/list-feedback.sh` / `.ps1` で新しい順に一覧表示できる。
- **Issue化(任意・自動)**: `.github/workflows/feedback-to-issues.yml` が、未処理の
  フィードバックを GitHub Issue に変換し、`issueCreated=true` と `issueNumber` を書き戻す。
  - 認証は既存の OIDC デプロイロール(DynamoDB の Query/UpdateItem 権限を付与済み)と、
    Actions 標準の `GITHUB_TOKEN`(issues: write)。**追加の秘密情報は不要**。
  - 既定は手動実行(`workflow_dispatch`)。ワークフロー内の `schedule` のコメントを外すと
    定期実行(例: 6時間ごと)になる。

## 7. デプロイ

- インフラ(DynamoDB / Lambda / API Gateway / CloudFront `/api`)は `infra/cloudformation.yaml`
  に含まれ、既存スタックの更新で作成される。
- Lambda のコード(`backend/index.mjs`)は、CloudFormation では最小プレースホルダで作り、
  デプロイスクリプト(`deploy.sh` / `deploy.ps1`)と GitHub Actions が
  `aws lambda update-function-code` で本体を反映する。
- 詳細手順は `infra/README.md` を参照。

## 8. 既知の制約・将来案

- 集計の増分は公開エンドポイントなので、厳密な不正防止はしていない(子供向け・小規模の
  前提でスロットリングのみ)。必要なら WAF や検証トークンを追加できる。
- フィードバック本文は人間が Issue でレビューする前提。将来、簡単な NG ワード除外や
  モデレーションを足す余地がある。
