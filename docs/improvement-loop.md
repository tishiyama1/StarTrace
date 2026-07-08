# プロダクト改善ループ(自動化)

StarTrace の「収集 → 提案 → 開発 → 反映」を自動で回すしくみ。
人間(オーナー)の関門は **提案の承認** と **PRのマージ** の2箇所だけ。

```
利用データ/エラー/FB ──► DynamoDB
        │  毎朝 8:30 JST (GitHub Actions: daily-metrics)
        ▼
📊 日次メトリクス Issue (label: metrics)
        │  毎朝 9:00 JST (Claude Code Routine)
        ▼
💡 改善提案 Issue (label: proposal) ── オーナーが選んで label: approved を付与
        │  翌日の Routine が approved を検知
        ▼
実装 PR ── オーナーがレビューしてマージ
        │  main への push (GitHub Actions: deploy)
        ▼
本番反映 (S3 + CloudFront)
```

## 1. 収集(テレメトリ)

- **利用イベント** `POST /api/event`: `trace_hit` / `trace_notfound` / `zukan_open` /
  `dashboard_open` / `feedback_open` / `releasenotes_open` を日次カウンタ(pk=EVENT)に加算。
  種別を増やすときは `backend/index.mjs` の許可リストと `src/lib/telemetry.ts` の
  両方に足す(Lambdaコードのみの変更なのでスタック更新は不要、自動デプロイで反映)。
- **エラー** `POST /api/error`: フロントの未捕捉エラーと Promise 失敗を自動報告
  (`src/lib/telemetry.ts`)。本文・スタック(切り詰め)・URL・UA を保存し、
  **30日で自動削除**(DynamoDB TTL)。1セッション最大5件に制限。
- **フィードバック** `POST /api/feedback`(既存)。
- 個人情報は一切収集しない(匿名ランダムIDのみ)。

## 2. 日次メトリクス Issue(毎朝 8:30 JST)

`.github/workflows/daily-metrics.yml` が DynamoDB を集計し、
「📊 日次メトリクス YYYY-MM-DD」Issue(label: `metrics`)を作成する。
内容: 累計統計 / 直近7日の日次イベント / 星座別発見数上位 / 未処理FB / 直近エラー。

## 3. 改善提案(毎朝 9:00 JST — Claude Code Routine)

Claude Code の Routine(定期実行)が新しいセッションで起動し、次を行う。

### 3.1 提案の作成

1. 最新の `metrics` Issue、open な `proposal` Issue(重複回避)、
   `feedback` ラベルの Issue、直近の PR履歴を読む。
2. データに基づいて **改善提案 Issue** を1本作成する(label: `proposal`)。
   - タイトル: 「💡 改善提案 YYYY-MM-DD」
   - 提案は最大5件。各提案に: **根拠(どのデータ/FBから)** / 期待効果 /
     実装規模(S/M/L) / 受け入れ条件 を書く。
   - データが乏しい日・提案すべきことがない日は「今日は提案なし」と明記した
     Issue を立てて閉じてよい(無理に提案をひねり出さない)。
3. ユーザーに見える変更を入れたら、`src/data/releaseNotes.ts` の先頭に
   リリースノートを追記する(アプリ内「🆕 アップデート」に反映される)。

### 3.2 承認済み提案の実装

1. label が `approved` で、まだ実装PRがリンクされていない Issue を探す。
2. 見つけたら **最も小さく価値のある1件だけ** を実装する:
   - `main` から `claude/improve-<issue番号>` ブランチを切る
   - リポジトリの規約に従い(テスト・lint・ビルドを通す)、必要なら docs も更新
   - PR を作成し、本文に `Closes #<issue番号>` を含める
   - Issue にPRリンクをコメントする
3. **マージはしない**(オーナーの関門)。インフラ変更(cloudformation.yaml)を
   伴う提案は、PR本文の先頭に「⚠️ スタック更新が必要」と明記する。

### 3.3 禁止事項

- main への直接 push・PR のセルフマージ
- `approved` が付いていない提案の実装
- 収集データの仕様変更(プライバシー方針の変更)を提案なしに行うこと

## 4. オーナー(あなた)の操作

| やること | 方法 |
|---|---|
| 提案を承認する | 💡提案 Issue に label `approved` を付ける(複数可。ただし1日1件ずつ実装される) |
| 提案を却下する | Issue を close する(コメントで理由を残すと次回の提案精度が上がる) |
| 実装を反映する | PR をレビューして Merge(自動デプロイ) |
| ループを止める | claude.ai の Routines 画面で該当 Routine を一時停止 / 削除 |
| メトリクスIssueが溜まったら | 古いものは閉じてよい(分析は最新分のみ参照) |

## 5. 運用メモ

- Routine は claude.ai アカウント側の設定(リポジトリ内コードではない)。
  スケジュール: 毎日 0:00 UTC = 9:00 JST、新規セッションで起動。
- メトリクスIssueが存在しない日(Actions失敗など)は、提案 Routine は
  「データ未取得」と記録して提案をスキップする。
- ラベル `metrics` / `proposal` / `approved` / `feedback` を使う。
