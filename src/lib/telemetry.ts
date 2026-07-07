// 利用状況とエラーの匿名テレメトリ。
//
// - すべてベストエフォート(失敗してもアプリの動作に影響しない)
// - 個人情報は送らない。clientId は端末内で生成したランダムIDのみ
// - イベント種別はバックエンド側の許可リストと対応している

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export type UsageEventType =
  | 'trace_hit'
  | 'trace_notfound'
  | 'zukan_open'
  | 'dashboard_open'
  | 'feedback_open';

function post(path: string, body: unknown): void {
  try {
    void fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      // ページ遷移中でも送信が生き残るように
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch が存在しない等。何もしない
  }
}

/** 利用イベントを1件送る(fire-and-forget)。 */
export function sendEvent(type: UsageEventType, clientId: string): void {
  post('/api/event', { clientId, type });
}

// 同一セッションからのエラー洪水を防ぐ
const MAX_ERRORS_PER_SESSION = 5;
let errorsSent = 0;
let installed = false;

function reportError(clientId: string, message: string, stack: string): void {
  if (errorsSent >= MAX_ERRORS_PER_SESSION) return;
  errorsSent += 1;
  post('/api/error', {
    clientId,
    message,
    stack,
    url: typeof location !== 'undefined' ? location.pathname : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  });
}

/**
 * 未捕捉エラーと未処理のPromise失敗を自動で報告するハンドラを設置する。
 * 何度呼んでも1回しか設置されない。
 */
export function installErrorReporter(clientId: string): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportError(
      clientId,
      event.message || 'unknown error',
      event.error instanceof Error ? (event.error.stack ?? '') : '',
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? (reason.stack ?? '') : '';
    reportError(clientId, `unhandledrejection: ${message}`, stack);
  });
}
