# StarTrace(ほしのなぞりがき)

星空を指でなぞると、なぞった形に一番近い星座を判定して表示する子供向けWebアプリです。

## 主な機能

- **なぞって星座あて**: 指(マウス)でなぞった形に一番近い星座を判定。位置・大きさ・向きが
  多少ちがっても当たる形状マッチング。
- **22の星座**: 実在の星座14個に加え、モナリザ座・ハート座・ネコ座などオリジナルの
  「おはなしの星座」8個を収録。
- **ほしぞら図鑑**: 見つけた星座を集めて図鑑に登録(端末に保存)。進捗・カテゴリ別に振り返れる。
- **リアルな星空**: 天の川、ときどき流れる流れ星、ぼんやり光る星雲、色とりどりのまたたく星。
- **みんなのダッシュボード**: 全利用者の集計(探した人数・発見合計・全星座制覇・星座別ランキング)と
  「きみ と みんな」の比較。匿名データのみ。
- **フィードバック**: 「◯◯座がほしい」などの意見を送れるフォーム。DynamoDBに保存し、
  GitHub Issue へ自動連携も可能(`docs/backend.md`)。

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

## デプロイ (AWS S3 + CloudFront)

非公開の S3 バケット + CloudFront で配信します。IaC(CloudFormation)一式は `infra/` にあります。

```bash
# 1. インフラ作成(初回のみ)
aws cloudformation deploy \
  --region ap-northeast-1 --stack-name startrace \
  --template-file infra/cloudformation.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides GitHubOwner=tishiyama1 GitHubRepo=StarTrace GitHubBranch=main

# 2. コンテンツをデプロイ(ビルド → S3同期 → CloudFront無効化)
./infra/deploy.sh
```

main への push で GitHub Actions が自動デプロイします(OIDC 認証)。
詳しい手順は [infra/README.md](infra/README.md)、設計判断は [docs/deployment.md](docs/deployment.md) を参照。

## 設計ドキュメント

- [要求仕様書](docs/requirements.md)
- [アーキテクチャ設計書](docs/architecture.md)
- [星座テンプレートデータ仕様書](docs/constellation-data.md)
- [形状マッチングアルゴリズム設計書](docs/matching-algorithm.md)
- [図鑑機能 設計書](docs/zukan-feature.md)
- [夜空ビジュアル 設計書](docs/visuals.md)
- [デプロイ設計書 (AWS)](docs/deployment.md)
- [バックエンド/ダッシュボード/フィードバック 設計書](docs/backend.md)
