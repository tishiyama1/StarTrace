# StarTrace(ほしのなぞりがき)

星空を指でなぞると、なぞった形に一番近い星座を判定して表示する子供向けWebアプリです。

## 主な機能

- **なぞって星座あて**: 指(マウス)でなぞった形に一番近い星座を判定。位置・大きさ・向きが
  多少ちがっても当たる形状マッチング。
- **22の星座**: 実在の星座14個に加え、モナリザ座・ハート座・ネコ座などオリジナルの
  「おはなしの星座」8個を収録。
- **ほしぞら図鑑**: 見つけた星座を集めて図鑑に登録(端末に保存)。進捗・カテゴリ別に振り返れる。
- **リアルな星空**: 天の川、ときどき流れる流れ星、ぼんやり光る星雲、色とりどりのまたたく星。

## セットアップ

```bash
npm install
npm run dev
```

## その他のコマンド

```bash
npm run build   # 本番ビルド
npm run test    # 単体テスト (Vitest)
npm run lint    # ESLint
```

## 設計ドキュメント

- [要求仕様書](docs/requirements.md)
- [アーキテクチャ設計書](docs/architecture.md)
- [星座テンプレートデータ仕様書](docs/constellation-data.md)
- [形状マッチングアルゴリズム設計書](docs/matching-algorithm.md)
- [図鑑機能 設計書](docs/zukan-feature.md)
- [夜空ビジュアル 設計書](docs/visuals.md)
