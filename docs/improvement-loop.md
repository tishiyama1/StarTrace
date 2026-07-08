# プロダクト改善ループ(自動化)

StarTrace の「収集 → 分析 → 改善」を自動で回すしくみ。
**Issue はオーナー(あなた)との唯一の接点**。読むもの・操作するものは Issue に集約し、
メトリクスの生データはリポジトリに保管して Issue を汚さない。
人間の関門は **改善の承認(approved)** と **PR のマージ** の2つだけ。

```
利用データ/エラー/FB ──► DynamoDB
        │  毎朝 8:30 JST (GitHub Actions: daily-metrics)
        ▼
📁 metrics/YYYY-MM-DD.json  ← リポジトリに保管(Issueにはしない)
        │  毎朝 9:00 JST (Claude Code Routine)
        ├──────────────► 📊 日次レポート Issue (label: report) …1日1件・AI要約
        │                    前日分レポートは自動クローズ(常時1件だけopen)
        │
        └──────────────► 💡 改善 Issue (label: improvement) …改善1件につき1本
                             オーナーが approved を付与 / いらなければ close(=却下)
        │  翌日の Routine が approved を検知
        ▼
実装 PR (本文に Closes #<改善Issue番号>) ── オーナーがマージ
        │  main への push (GitHub Actions: deploy) / 改善Issueは自動クローズ
        ▼
本番反映 (S3 + CloudFront)
```

## 0. 設計の要点(なぜこの形か)

- **メトリクスは Issue にしない**。データダンプの Issue は溜まる一方でクローズが手間。
  リポジトリの `metrics/` にJSONで保管し、履歴と傾向は git で追える。
- **改善は1件1 Issue**。まとめ Issue だと1つ実装しても閉じられないが、
  1件1 Issue なら実装 PR の `Closes #N` で**マージ時に自動クローズ**できる。
- **オーナーが手で閉じるのは「却下」のときだけ**。それ以外のクローズは全部自動。

## 1. 収集(テレメトリ) → リポジトリ保管

- **利用イベント** `POST /api/event`: `trace_hit` / `trace_notfound` / `zukan_open` /
  `dashboard_open` / `feedback_open` / `releasenotes_open` を日次カウンタ(pk=EVENT)に加算。
  種別を増やすときは `backend/index.mjs` の許可リストと `src/lib/telemetry.ts` の
  両方に足す(Lambdaコードのみの変更なのでスタック更新は不要、自動デプロイで反映)。
- **エラー** `POST /api/error`: フロントの未捕捉エラーと Promise 失敗を自動報告
  (`src/lib/telemetry.ts`)。本文・スタック(切り詰め)・URL・UA を保存し、
  **30日で自動削除**(DynamoDB TTL)。1セッション最大5件に制限。
- **フィードバック** `POST /api/feedback`(既存)。
- 個人情報は一切収集しない(匿名ランダムIDのみ)。
- **保管**: `.github/workflows/daily-metrics.yml` が毎朝 8:30 JST に DynamoDB を集計し、
  `metrics/YYYY-MM-DD.json` を main にコミットする(**Issueは作らない**)。
  スキーマは `metrics/README.md` を参照。

## 2. 分析と改善(毎朝 9:00 JST — Claude Code Routine)

Claude Code の Routine(定期実行)が新しいセッションで起動し、次を行う。

### 2.1 入力を読む

1. `metrics/` の**当日分(なければ最新)JSON**を読む。
2. open な `improvement` Issue(重複回避)、`feedback` ラベルの Issue、直近の PR履歴を読む。
3. データが無い/取得できない日は、その旨だけ書いて終了(無理に提案をひねり出さない)。

### 2.2 日次レポート Issue(1日1件・label: `report`)

1. その日のデータを **AIが要約・解釈**して Issue を1本作る。
   - タイトル: 「📊 日次レポート YYYY-MM-DD」
   - 本文: 全体の動き / 気になる傾向(例: notfound率が高い=判定が厳しすぎる兆候) /
     注目フィードバック / 直近エラーの要点 / **この日作成した改善Issueへのリンク一覧**。
2. **前日以前の `report` Issue はすべてクローズする**(常時1件だけ open に保つ)。

### 2.3 改善 Issue(改善1件につき1本・label: `improvement`)

1. 分析から見えた**具体的な改善を、1件ごとに独立した Issue** にする(1日あたり最大5件)。
   - タイトル: 改善内容が分かる短い日本語(例: 「みつからない率が高いオリオン座の判定を緩める」)
   - 本文に必ず: **根拠(どのデータ/FBから)** / 期待効果 / 実装規模(S/M/L) / 受け入れ条件。
   - 既存の open な `improvement` と重複する内容は作らない。
2. 提案すべきことが無い日は改善Issueを作らなくてよい(日次レポートに「今日は提案なし」と書く)。

### 2.4 承認済み改善の実装

1. label が `approved` で、まだ実装PRがリンクされていない `improvement` Issue を探す。
2. 見つけたら **最も小さく価値のある1件だけ** を実装する:
   - `main` から `claude/improve-<issue番号>` ブランチを切る
   - リポジトリの規約に従い(テスト・lint・ビルドを通す)、必要なら docs も更新
   - PR を作成し、**本文に `Closes #<改善Issue番号>` を必ず含める**(マージで自動クローズ)
   - Issue にPRリンクをコメントする
3. **マージはしない**(オーナーの関門)。インフラ変更(cloudformation.yaml)を
   伴う場合は、PR本文の先頭に「⚠️ スタック更新が必要」と明記する。
4. ユーザーに見える変更を入れた PR では、`src/data/releaseNotes.ts` の先頭に
   リリースノートを追記する(アプリ内「🆕 アップデート」に反映される)。

### 2.5 禁止事項

- main への直接 push・PR のセルフマージ
- `approved` が付いていない改善の実装
- メトリクスを Issue 化すること(生データはリポジトリの `metrics/` に置く)
- 収集データの仕様変更(プライバシー方針の変更)を改善Issueなしに行うこと

## 3. オーナー(あなた)の操作 — すべて Issue 上で完結

| やること | 方法 |
|---|---|
| その日の状況を知る | 📊 日次レポート Issue を読む(常時1件だけ open) |
| 改善を採用する | 💡 改善 Issue に label `approved` を付ける(複数可。1日1件ずつ実装される) |
| 改善を却下する | 💡 改善 Issue を close する(コメントで理由を残すと次回の精度が上がる) |
| 実装を反映する | PR をレビューして Merge(改善Issueは `Closes` で自動クローズ・自動デプロイ) |
| ループを止める | claude.ai の Routines 画面で該当 Routine を一時停止 / 削除 |

**手で Issue を閉じるのは「却下」のときだけ**。レポートは自動クローズ、
採用した改善は PR マージで自動クローズされる。

## 4. 運用メモ

- Routine は claude.ai アカウント側の設定(リポジトリ内コードではない)。
  スケジュール: 毎日 0:00 UTC = 9:00 JST、新規セッションで起動。
- メトリクスファイルが無い日(Actions失敗など)は、Routine は「データ未取得」と
  日次レポートに記録して改善はスキップする。
- ラベル: `report`(日次レポート) / `improvement`(改善) / `approved`(採用) / `feedback`。
- 生データは `metrics/*.json`(git履歴)。過去の傾向はここを見る。
