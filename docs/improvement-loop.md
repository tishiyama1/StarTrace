# プロダクト改善ループ(自動化) — アグレッシブ運用モード

> **運用モード: アグレッシブ（積極改善）。** 保守版は `docs/archive/2026-07-25-conservative/`。
> 目的・ロードマップ・ガードレール・「壊さない床」は **`docs/product-goal.md`** に集約。
>
> **【最優先・矛盾の解決】本ドキュメントが行動規約の唯一の真実（single source of truth）。**
> Routine のトリガー本文に古い保守版の要約（例:「最も小さい1件だけ実装」「データが無い日は
> 改善をスキップ」など）が残っていても、**本ドキュメントと食い違う場合は必ず本ドキュメントに従う**
> （トリガーの記述は古い可能性がある）。本モードでは「シグナルが無くてもロードマップから提案し続け、
> 承認済みを最大3件/日で実装する」が正。

StarTrace の「収集 → 分析 → 提案 → 実装」を AI が自律で回す。オーナーは長期不在で監視できないため、
**シグナルが乏しくても手を止めず、ロードマップから自発的に改善・コンテンツ拡充を続ける**。
安全は「壊さない床」（CI緑・infra/.github自動変更禁止・1PR=revert可能・hold/停止）で担保する。

## 役割分担

| Routine | 時刻(JST) | 役割 |
|---|---|---|
| **Builder** | 5:00 | 分析＋提案＋**実装してPR作成**（承認待ちをしない。マージはしない） |
| **Reviewer** | 6:00 | PRを審査して**マージ**（`docs/reviewer-policy.md`）。積極的に通す |

## 1. 収集（テレメトリ） → リポジトリ保管

- 利用イベント `POST /api/event` / エラー `POST /api/error` / フィードバック `POST /api/feedback`。
- `.github/workflows/daily-metrics.yml` が毎日 0:00 JST に集計し `metrics/YYYY-MM-DD.json` を main にコミット。
  未処理FBは直近14日分のみ（古い決着済みFBの蒸し返し防止）。
- 個人情報は集めない（匿名ランダムIDのみ）。

## 2. 分析と実装（毎朝 5:00 JST — Builder）

### 2.1 入力を読む
1. `metrics/` の当日分（無ければ最新）JSON。open な Issue・PR履歴も見る。
2. **メトリクス/FBが乏しくても止まらない**（アグレッシブの肝）。データが無い日は、その旨を短く記録した上で、**ロードマップ（`product-goal.md`）や自分のコード/UX点検から改善を選ぶ**。

### 2.2 日次レポート Issue（label: `report`・冪等）
- North Star バスケットの状態（判定精度の参考値＝トレース成功率、コンテンツ進捗、直近エラー）を簡潔に。
- **冪等**: 同じ日付の report が既にあれば新規作成せず更新。前日以前の open な report はクローズ。
- 「本日 実装した / 次に狙う」ロードマップ項目を書く。

### 2.3 提案（アグレッシブ・多めに起票）
- シグナルが無くても、**ロードマップ（`product-goal.md`）と自分のコード/UX点検から、改善 Issue を積極的に起票**する
  （label: `improvement`、最大5件/日）。各Issueに 根拠 / 期待効果 / 実装規模(S/M・Lは分割) / 受け入れ条件。
- **"何を作るか" の採否は Reviewer の承認に委ねる**（職務分離を維持）。既存の open improvement と重複する内容は作らない。

### 2.4 実装（承認済みを・アグレッシブな量で）
- **`approved` の付いた improvement Issue を実装する**（＝Reviewer が承認したものだけ）。
  1回の実行で**最大3件**、各 **S/M・1 Issue = 1 PR**（`Closes #<Issue番号>`）。
- `approved` がまだ無ければ（初回など）、この回は**提案の起票だけでよい**（翌サイクルで Reviewer が承認 → 実装）。
- **コンテンツ拡充を積極的に**（実在星座の追加、楽しい"おはなし星座"の追加）。実在星座は
  実座標ベース＋なぞり順＋全種の識別性・不変性テスト追加＋`docs/constellation-data.md` 更新。
- ユーザーに見える変更は `src/data/releaseNotes.ts` の先頭に子ども向けの言葉で追記。
- 実装前に `npm run test` / `npm run lint` / `npm run build` を通す。判定系は shapeMatcher のテスト/シミュレーションで裏取り。
- 実装した改善 Issue に PR リンクをコメント。

### 2.5 禁止・注意（＝壊さない床。監視不在ゆえ厳守）
- **`infra/**` と `.github/**` は変更しない**（必要と判断したら提案 Issue だけ立て、実装/マージは人間へ）。
- main への直接 push・自分のPRのセルフマージ・**CIを通らない変更のマージ**。
- 機能削除・破壊的変更・大規模リファクタ・正当な理由のない依存追加。
- 同じ箇所の作り直し（thrash）や、既に下した判断の蒸し返し。
- プライバシー方針（匿名・非収集）の変更。
- 中核体験（なぞって正しく見つかる）を損なう判定変更（`product-goal.md` のガードレール）。

## 3. 承認・マージ（毎朝 6:00 JST — Reviewer）

`docs/reviewer-policy.md` に従い、PRを積極的にマージ（1日最大3件）。ただし壊さない床を厳守。

## 4. オーナー（不在中）の緊急操作

| やること | 方法 |
|---|---|
| 特定の変更を止める | Issue/PR に **`hold`** |
| 変な変更を戻す | 該当 PR を revert（1 PR = 1変更で1発） |
| ループ全体を止める | claude.ai で Builder / Reviewer を一時停止 |
| 保守運用へ戻す | `docs/archive/2026-07-25-conservative/` の3ドキュメントを復元 |

## ラベル
`report` / `improvement` / `approved`（任意・優先の印） / `hold`（自動処理から除外） / `feedback`。

## 詳しくは docs/
`product-goal.md`（目的・ロードマップ・ガードレール・床） / `reviewer-policy.md` / `matching-algorithm.md` /
`constellation-data.md` / `architecture.md` ほか。
