# デプロイ設計書(AWS S3 + CloudFront)

## 1. 目的

StarTrace はバックエンドを持たない静的 SPA(Vite でビルドした HTML/CSS/JS)なので、
**オブジェクトストレージ(S3)+ CDN(CloudFront)** で配信するのが、低コスト・高可用・
低レイテンシで最も適した構成。IaC(CloudFormation)で再現可能にし、GitHub Actions で
継続的にデプロイする。

具体的な操作手順は `infra/README.md` を参照。本書は設計判断の記録。

## 2. 構成図

```
                 ┌─────────────────────────────────────────┐
   ブラウザ ──►  │ CloudFront (グローバルCDN, 既定ドメイン)   │
   (HTTPS)       │  - HTTPS強制 / HTTP3 / IPv6               │
                 │  - gzip・brotli 圧縮                       │
                 │  - CachingOptimized (マネージド)          │
                 │  - SecurityHeadersPolicy (マネージド)     │
                 │  - 403/404 → /index.html (SPAフォールバック)│
                 └───────────────┬─────────────────────────┘
                                 │ Origin Access Control (SigV4)
                                 ▼
                 ┌─────────────────────────────────────────┐
                 │ S3 バケット (完全非公開)                    │
                 │  - パブリックアクセス全ブロック             │
                 │  - CloudFront の SourceArn のみ GetObject  │
                 │  - SSE-S3 暗号化 / バージョニング          │
                 └─────────────────────────────────────────┘

   GitHub Actions ──(OIDC: sts:AssumeRoleWithWebIdentity)──► IAM Role ──► 上記へデプロイ
```

## 3. 主要な設計判断

| 項目 | 決定 | 理由 |
|---|---|---|
| ホスティング | S3 + CloudFront | 静的SPAに最適。サーバー管理不要・従量課金・CDNで高速 |
| バケット公開 | 非公開 + OAC | S3を直接公開せず CloudFront 経由のみ。OAI ではなく現行推奨の OAC |
| ドメイン | CloudFront 標準 | ドメイン取得・ACM・Route53 不要ですぐ公開できる(要望どおり) |
| TLS | CloudFront 既定証明書 | `*.cloudfront.net` に自動付与。証明書管理不要 |
| SPA フォールバック | 403/404→index.html(200) | 非公開バケットは404を403で返すため両方をマップ。深いリンク・将来のルーティングに備える |
| キャッシュ | 資産=immutable, HTML=no-cache | ハッシュ付き資産は永続キャッシュ、HTMLは即時反映 |
| IaC | CloudFormation(YAML) | 追加ツール不要でAWS標準。1コマンドで再現・削除可能 |
| CI/CD 認証 | GitHub OIDC | 長期のAWSキーをGitHubに置かない。漏洩リスクを排除 |
| 権限 | 最小権限ロール | 対象バケット/ディストリビューション/当スタックのみに限定 |
| バケット削除保護 | DeletionPolicy: Retain | スタック誤削除時もコンテンツを保護 |
| リージョン | ap-northeast-1(東京) | 日本の利用者に近い。配信自体はCDNでグローバル |
| エッジ範囲 | PriceClass_200 | アジア(東京含む)をカバーしつつ All より低コスト |

## 4. デプロイの流れ

1. **インフラ作成**(初回): `aws cloudformation deploy` でスタックを作成。
2. **コンテンツ配信**: `infra/deploy.sh` が `npm run build` → S3 同期(キャッシュ
   ヘッダ付き)→ CloudFront 無効化を実行。
3. **自動化**: main への push で GitHub Actions が同じ `deploy.sh` を実行
   (`SKIP_BUILD=1`、ビルドはワークフロー側で実施)。

## 5. コストの目安

小規模な子供向けアプリの想定では、いずれも無料枠〜数十円/月程度に収まる見込み。

- S3: 数MBの静的ファイル + 少数のリクエスト → ほぼ無料枠内。
- CloudFront: 転送量課金。個人利用の規模なら僅少。無効化は月1,000パスまで無料。
- 独自ドメイン・ACM を使わないため追加費用なし。

## 6. 将来の拡張

- **独自ドメイン**: Route53 ホストゾーン + us-east-1 の ACM 証明書を追加し、
  CloudFront に `Aliases` と `ViewerCertificate(AcmCertificateArn)` を設定。
  テンプレートはパラメータ追加で対応可能な構造にしてある。
- **PWA / オフライン**: Service Worker を足す場合は、そのファイルだけ `no-cache`
  にするなどキャッシュ方針を調整。
- **プレビュー環境**: ブランチごとに別スタック(`ProjectName` を変える)を作れば
  検証用URLを分離できる。
