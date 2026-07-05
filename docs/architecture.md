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
│   └── matching-algorithm.md
├── src/
│   ├── main.tsx                 # エントリーポイント
│   ├── App.tsx                  # 画面全体の状態管理(描画中/結果表示の切り替え)
│   ├── index.css                # グローバルスタイル
│   ├── types.ts                 # 共通型定義 (Point, Constellation など)
│   ├── data/
│   │   └── constellations.ts    # 星座テンプレートデータ(12星座分)
│   ├── lib/
│   │   ├── geometry.ts          # 点・ベクトル演算の基本ユーティリティ
│   │   ├── resample.ts          # ストロークの等間隔リサンプリング
│   │   ├── shapeMatcher.ts      # 正規化・回転探索・距離計算・判定ロジック
│   │   └── *.test.ts            # Vitest による単体テスト
│   ├── components/
│   │   ├── SkyCanvas.tsx        # 背景の星 + なぞり描画を担当するCanvasコンポーネント
│   │   ├── ResultOverlay.tsx    # 判定結果(星座名・マッチ度・お手本形状)の表示
│   │   └── Header.tsx           # タイトル・遊び方の簡単な案内
│   └── hooks/
│       └── useStrokeInput.ts    # マウス/タッチ入力を1本のストローク(Point[])に変換するフック
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

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

- **App.tsx**: `idle`(なぞり待ち) / `drawing`(なぞり中) / `result`(結果表示) の3状態を管理する状態機械として実装する。ロジック(判定)はコンポーネントに持たせず `lib/shapeMatcher.ts` に隔離し、UIとロジックを分離する。
- **SkyCanvas.tsx**: 背景の装飾星(ランダム生成、`useMemo` で初期化時に1回だけ生成)と、ユーザーのストローク軌跡、結果表示時のお手本ライン(星座の形)の3レイヤーを1つのCanvasに重ねて描画する。
- **useStrokeInput.ts**: Pointer Events API (`onPointerDown/Move/Up`) を使い、マウス・タッチ・ペンを同一コードで扱う。座標はCanvasのクライアント座標系で正規化して保持する。
- 状態・データは全てクライアントメモリ内のみで完結し、永続化は行わない(スコープ外)。

## 5. 拡張ポイント(将来の機能追加時の設計余地)

要求仕様のスコープ外とした機能を後から追加しやすいように、以下を意識して設計する。

- **効果音・アニメーション**: `ResultOverlay` にエフェクト層を追加するだけで対応できるよう、判定ロジックとUIを分離しておく。
- **豆知識・神話解説**: `Constellation` 型に `description` フィールドを最初から持たせておき、将来 `ResultOverlay` に表示欄を追加するだけで拡張できるようにする。
- **図鑑・コレクション機能**: `localStorage` への保存キーを `constellationId` ベースで設計しやすいよう、星座データに一意な `id` を持たせる。
- **星座の追加(88星座対応や季節切り替え)**: `data/constellations.ts` にオブジェクトを追加するだけで対応できるデータ駆動設計にする。
