# StarTrace アーキテクチャ設計書

## 1. 技術スタック

| 領域 | 採用技術 | 理由 |
|---|---|---|
| ビルドツール | Vite | 高速な開発サーバー、設定がシンプル |
| フレームワーク | React 18 + TypeScript | コンポーネント単位でUIを整理でき、型安全に実装できる |
| 描画 | Canvas 2D API (生Canvas, `useRef` で直接操作) | 指の軌跡をリアルタイムに高頻度更新するため、DOM/SVGよりCanvasが適している |
| スタイル | 素のCSS (CSS Modules不使用、`index.css` + コンポーネント単位のクラス) | 依存を増やさずシンプルに保つ |
| テスト | Vitest | Vite との親和性が高い単体テストランナー(形状マッチングのロジックを検証) |
| ホスティング | 静的ファイルとして任意の場所に配置可能(Vercel/Netlify/GitHub Pages等) | バックエンド不要のため |

外部通信・バックエンドは持たない。すべてのデータ(星座テンプレート)はビルドに含まれる静的な TypeScript データとして持つ。

## 2. ディレクトリ構成

```
StarTrace/
├── docs/                        # 設計書 (本ドキュメント群)
│   ├── requirements.md
│   ├── architecture.md
│   ├── constellation-data.md
│   ├── matching-algorithm.md
│   ├── zukan-feature.md         # 図鑑機能の設計
│   └── visuals.md               # 夜空ビジュアル(天の川・流れ星・星雲)の設計
├── src/
│   ├── main.tsx                 # エントリーポイント
│   ├── App.tsx                  # 画面全体の状態管理(なぞり/結果/図鑑の切り替え)
│   ├── App.css                  # アプリUIのスタイル
│   ├── index.css                # グローバルスタイル
│   ├── types.ts                 # 共通型定義 (Point, Constellation, category など)
│   ├── data/
│   │   └── constellations.ts    # 星座テンプレートデータ(実在14 + おはなし8 = 22星座)
│   ├── lib/
│   │   ├── geometry.ts          # 点・ベクトル演算の基本ユーティリティ
│   │   ├── resample.ts          # ストロークの等間隔リサンプリング
│   │   ├── shapeMatcher.ts      # 正規化・回転探索・距離計算・判定ロジック + 発見閾値
│   │   ├── skyEffects.ts        # 星・天の川・星雲・流れ星の生成/描画ユーティリティ
│   │   └── *.test.ts            # Vitest による単体テスト
│   ├── components/
│   │   ├── SkyCanvas.tsx        # 夜空の全レイヤー + なぞり描画を担当するCanvas
│   │   ├── ResultOverlay.tsx    # 判定結果(星座名・カテゴリ・マッチ度・お手本形状・NEW演出)
│   │   ├── ConstellationDiagram.tsx # 星座のお手本の形をSVGの線画で表示
│   │   ├── Zukan.tsx            # ほしぞら図鑑(発見一覧・進捗・カテゴリ絞り込み)
│   │   ├── Dashboard.tsx        # みんなの集計 + 自分vsみんな比較 + 星座ランキング
│   │   ├── FeedbackForm.tsx     # フィードバック投稿フォーム
│   │   └── Header.tsx           # タイトル・遊び方の簡単な案内
│   └── hooks/
│       ├── useStrokeInput.ts    # マウス/タッチ入力を1本のストローク(Point[])に変換
│       ├── useViewportSize.ts   # ビューポートサイズの追従
│       ├── useDiscoveries.ts    # 発見済み星座を localStorage で永続管理
│       └── useClientId.ts       # 匿名クライアントIDの発行と初回訪問の登録
│   └── lib/ … api.ts            # 共有バックエンドAPIクライアント(/api)
├── backend/
│   └── index.mjs               # 集計・フィードバックAPIのLambdaハンドラ(Node.js)
├── infra/                      # AWS構成(S3+CloudFront+API Gateway+Lambda+DynamoDB)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

バックエンド(共有集計・フィードバック)の設計は `docs/backend.md` を参照。
フロントは同一オリジンの `/api/*` を呼び、CloudFront が API Gateway に振り分ける。

## 3. データフロー

```
[ユーザー入力: pointerdown/move/up]
        │
        ▼
useStrokeInput  ── ストロークを Point[] として蓄積
        │ (pointerup で確定)
        ▼
shapeMatcher.matchConstellation(stroke, constellations)
        │  1. リサンプリング(resample.ts)
        │  2. 平行移動・スケールの正規化(geometry.ts / shapeMatcher.ts)
        │  3. 回転探索して各テンプレートとの最小距離を計算
        │  4. 距離が最小 = 最もマッチ度が高い星座を選出
        ▼
MatchResult { constellation, score, rotationApplied }
        │
        ▼
App.tsx が状態を更新 → ResultOverlay に結果を渡して表示
```

## 4. コンポーネント設計の要点

- **App.tsx**: `なぞり待ち` / `結果表示` / `図鑑表示` の状態を管理する。判定ロジックはコンポーネントに持たせず `lib/shapeMatcher.ts` に隔離し、UIとロジックを分離する。マッチ度が発見閾値以上のとき `useDiscoveries.add()` で図鑑に登録し、戻り値で「新発見かどうか」を受け取って結果画面の演出に渡す。
- **SkyCanvas.tsx**: 夜空の各レイヤー(星雲 → 天の川 → 星 → 流れ星)+ 結果表示時のお手本ライン + ユーザーのストローク軌跡を、1つのCanvasに `requestAnimationFrame` で重ねて描画する。天体の生成・更新・描画ロジックは `lib/skyEffects.ts` に切り出し、コンポーネントは配置と合成のみを担う。静的な天体は初回だけ生成して `useRef` に保持し、流れ星のみ動的に生成・更新する。
- **skyEffects.ts**: 星・天の川・星雲・流れ星の「生成関数」と「描画関数」を純粋関数として提供する。座標は 0〜1 の正規化値で持ち、描画時に画面サイズを掛ける。流れ星の生成・移動・寿命判定は副作用のない関数にし、単体テストで検証する(`skyEffects.test.ts`)。
- **useStrokeInput.ts**: Pointer Events API (`onPointerDown/Move/Up`) を使い、マウス・タッチ・ペンを同一コードで扱う。座標はCanvasのクライアント座標系で保持する。
- **useDiscoveries.ts**: 発見済み星座IDの集合を `localStorage`(キー `startrace.discoveries.v1`)に永続化する。`add()` は同期的に「初回発見か」を返すため `useRef` で最新状態をミラーしている。localStorage が使えない環境でも例外を握りつぶして空の図鑑として動作する。
- **Zukan.tsx / ResultOverlay.tsx / ConstellationDiagram.tsx**: 表示専用コンポーネント。図鑑・結果の見た目は `Constellation` のデータ(`category` / `emoji` / `description` / `path`)から駆動される。

## 5. 拡張ポイント(将来の機能追加時の設計余地)

- **星座の追加(88星座対応や季節切り替え)**: `data/constellations.ts` にオブジェクトを追加するだけで対応できるデータ駆動設計。追加した星座は図鑑・判定・テストに自動で反映される(テストは `CONSTELLATIONS` をループするため)。新しい形状は識別性テストで既存と衝突しないことが保証される。
- **効果音・BGM**: `App.tsx` の状態遷移(新発見・結果表示)にフックして音を鳴らす層を足せるよう、演出のトリガー(`isNewDiscovery` 等)を状態として持たせてある。
- **物語・神話解説の拡充**: `Constellation.description` を長文化するか、フィールドを追加して `ResultOverlay` / `Zukan` に表示欄を足すだけで拡張できる。
- **進捗の同期・共有**: 現状は `localStorage` のみ。`useDiscoveries` のストレージ層を差し替えればサーバー同期に拡張できる。
