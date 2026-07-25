# プロダクト改善ループ(自動化) — アグレッシブ運用モード

> **運用モード: アグレッシブ（積極改善）。** 保守版は `docs/archive/2026-07-25-conservative/`。
> 目的・ロードマップ・ガードレール・「壊さない床」は **`docs/product-goal.md`** に集約。

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

### 2.3 提案と実装（アグレッシブ）
- **承認を待たない。** 価値ある改善を、`approved` の有無に関わらず自分で選んで実装してよい
  （最終ゲートは Reviewer のマージ＋CI）。`approved` が付いていればそれを優先する。
- **1回の実行で最大3件**まで実装してよい。各 **S/M・1 Issue = 1 PR**（`Closes #<Issue番号>`）。
  対応する改善 Issue（label: `improvement`）を立ててから実装する（追跡のため）。
- **選ぶ順番**: ①`approved` があればそれ → ②ロードマップ上位（黄道十二星座の完備など）→ ③自分の点検で見つけた品質・磨き込み。
- **コンテンツ拡充を積極的に**（実在星座の追加、楽しい"おはなし星座"の追加）。実在星座は
  実座標ベース＋なぞり順＋全種の識別性・不変性テスト追加＋`docs/constellation-data.md` 更新。
- ユーザーに見える変更は `src/data/releaseNotes.ts` の先頭に子ども向けの言葉で追記。
- 実装前に `npm run test` / `npm run lint` / `npm run build` を通す。判定系は shapeMatcher のテスト/シミュレーションで裏取り。

### 2.4 禁止・注意（＝壊さない床。監視不在ゆえ厳守）
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
