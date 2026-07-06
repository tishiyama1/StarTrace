# StarTrace インフラ (AWS S3 + CloudFront)

静的サイトを **非公開の S3 バケット + CloudFront** で配信するための構成一式です。

- `cloudformation.yaml` … インフラ本体(S3 / CloudFront / OAC / GitHub OIDCロール)
- `deploy.sh` … ビルド成果物を S3 に同期し CloudFront を無効化するスクリプト
- `../.github/workflows/deploy.yml` … main への push で自動デプロイする GitHub Actions

## 構成の概要

```
         (HTTPS)              (OAC / SigV4)
ブラウザ ──────► CloudFront ──────────────► S3 バケット(非公開)
                  │  index.html を配信          ▲
                  │  403/404 → index.html        │ CloudFront だけが読める
                  └─ セキュリティヘッダ付与        (バケットポリシー + OAC)
```

- **S3 は完全非公開**。パブリックアクセスは全ブロックし、CloudFront からの
  リクエスト(Origin Access Control)だけが `s3:GetObject` を許可される。
- **HTTPS 強制**(`redirect-to-https`)、**gzip/brotli 圧縮**、
  AWS マネージドの **CachingOptimized** と **SecurityHeadersPolicy** を適用。
- ドメインは CloudFront 標準(`xxxx.cloudfront.net`)。証明書も自動なので
  ドメイン取得・DNS 設定は不要。
- デプロイ用 IAM ロールは **GitHub OIDC** で引き受ける(GitHub に AWS の
  長期キーを保存しない)。

## 前提

- awscli v2 がインストール済みで、デプロイ権限を持つ認証情報が設定済み
  (`aws sts get-caller-identity` が通ること)
- Node.js 18+ / npm

## 手順

### 1. インフラを作成(初回のみ)

東京リージョンにスタックを作成します。

```bash
aws cloudformation deploy \
  --region ap-northeast-1 \
  --stack-name startrace \
  --template-file infra/cloudformation.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      ProjectName=startrace \
      GitHubOwner=tishiyama1 \
      GitHubRepo=StarTrace \
      GitHubBranch=main
```

> **すでにアカウントに GitHub OIDC プロバイダがある場合**
> `token.actions.githubusercontent.com` はアカウントに1つしか作れません。既存が
> ある場合は、その ARN を渡して再利用してください(重複作成エラーを防げます)。
> ```bash
>   --parameter-overrides ... ExistingGitHubOIDCProviderArn=arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com
> ```

作成後、出力(Outputs)を確認します。

```bash
aws cloudformation describe-stacks --region ap-northeast-1 \
  --stack-name startrace --query 'Stacks[0].Outputs' --output table
```

- `SiteURL` … 公開 URL(コンテンツを上げると開けます)
- `GitHubDeployRoleArn` … CI/CD で使うロール ARN(手順3で使用)

### 2. コンテンツをデプロイ

ローカルからワンコマンドで、ビルド → S3 同期 → CloudFront 無効化まで行います。

**Mac / Linux / Git Bash / WSL:**

```bash
./infra/deploy.sh
```

**Windows PowerShell:**

```powershell
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1
```

`SiteURL`(`https://xxxx.cloudfront.net`)を開くと StarTrace が表示されます。
新規ディストリビューションは初回のみ数分で世界中に展開されます。

> **Windows での注意**
> - `aws cloudformation deploy ...`(手順1)は改行の `\` を消して **1行**で貼ってください。
>   PowerShell では `\` は改行つなぎになりません。
> - `.sh` は bash 用です。PowerShell では上の `deploy.ps1` を使ってください
>   (Git Bash / WSL なら `deploy.sh` でも動きます)。
> - 事前に AWS CLI と Node.js が必要です(`aws --version` と `node --version` で確認)。
>   認証情報は `aws configure` で設定しておきます。

### 3. GitHub Actions で自動デプロイ(任意)

main にマージするたびに自動でビルド&デプロイされます。GitHub 側に
**リポジトリ変数(Variables)** を1つ設定するだけです。

1. リポジトリの **Settings → Secrets and variables → Actions → Variables** を開く
2. 新規 variable を追加:
   - Name: `AWS_DEPLOY_ROLE_ARN`
   - Value: 手順1の出力 `GitHubDeployRoleArn` の値
3. これで `.github/workflows/deploy.yml` が main への push で走ります
   (テスト → ビルド → S3 同期 → CloudFront 無効化)。

> ロール ARN は秘密ではないため Secret ではなく Variable で十分です。AWS 側は
> `repo:tishiyama1/StarTrace:*` からの OIDC トークンだけを信頼するので、
> 他リポジトリからは引き受けられません。

## キャッシュ戦略

- `assets/*`(Vite がファイル名にハッシュを付与)→ `max-age=31536000, immutable`
- `*.html` → `no-cache`(デプロイ後すぐ最新版が反映される)
- 併せて毎回 `/*` の CloudFront 無効化を実行

## クリーンアップ(削除)

```bash
# バケットは DeletionPolicy: Retain なので、中身を空にしてから削除する
aws s3 rm s3://<BucketName> --recursive
aws cloudformation delete-stack --region ap-northeast-1 --stack-name startrace
# 保持されたバケットを消す場合(任意)
aws s3api delete-bucket --bucket <BucketName> --region ap-northeast-1
```

## 補足・設計判断

- **OAI ではなく OAC** を採用(AWS の現行推奨。SigV4 署名で S3 REST エンドポイントに
  アクセスし、静的ウェブサイトホスティング用のパブリックエンドポイントは使わない)。
- **SPA フォールバック**: OAC 経由の非公開バケットは存在しないキーに 403 を返すため、
  403/404 をどちらも `index.html`(200)にマップしている。将来クライアントルーティングを
  足しても深いリンクが動く。
- **バケットは Retain**: 誤ってスタックを消してもコンテンツ/バケットは残る。
- **最小権限**: デプロイロールは対象バケット・対象ディストリビューション・当スタックの
  Outputs 参照のみに限定。
