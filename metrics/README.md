# metrics/

利用状況・フィードバック・エラーの日次スナップショット置き場。

- `daily-metrics` ワークフローが毎朝 8:30 JST に DynamoDB を集計し、
  `metrics/YYYY-MM-DD.json` を main にコミットする(Issue は作らない)。
- 9:00 JST の改善提案 Routine(Claude)がこのファイルを読み、
  **日次レポート Issue**(1日1件)と**改善 Issue**(改善1件につき1本)を作成する。
- 個人情報は含まない(匿名ランダムIDのみ)。エラーは30日でDynamoDB TTL削除。

## JSON スキーマ

```jsonc
{
  "date": "2026-07-08",              // JST の対象日
  "generatedAt": "2026-07-08T...Z",  // 生成時刻(UTC)
  "totals": { "users": 0, "discoveries": 0 },        // 累計
  "events7d": [                       // 直近7日の日次イベントカウンタ
    { "date": "2026-07-08", "type": "trace_hit", "count": 0 }
  ],
  "constellations": [                 // 星座別の累計発見数(降順)
    { "id": "orion", "count": 0 }
  ],
  "feedbackUnprocessed": [            // 未Issue化のフィードバック(最新20)
    { "category": "bug", "message": "...", "createdAt": "..." }
  ],
  "errorsRecent": [                   // 直近のクライアントエラー(最新15)
    { "createdAt": "...", "message": "...", "url": "/", "ua": "..." }
  ]
}
```
