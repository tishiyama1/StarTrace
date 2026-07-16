import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { ResultOverlay } from './components/ResultOverlay';
import { NotFoundOverlay } from './components/NotFoundOverlay';
import { SkyCanvas } from './components/SkyCanvas';
import { Zukan } from './components/Zukan';
import { Dashboard } from './components/Dashboard';
import { FeedbackForm } from './components/FeedbackForm';
import { ReleaseNotes } from './components/ReleaseNotes';
import { CONSTELLATIONS } from './data/constellations';
import { useStrokeInput } from './hooks/useStrokeInput';
import { useViewportSize } from './hooks/useViewportSize';
import { useDiscoveries } from './hooks/useDiscoveries';
import { useClientId } from './hooks/useClientId';
import { backfillDiscovery, recordDiscovery } from './lib/api';
import { installErrorReporter, sendEvent } from './lib/telemetry';
import {
  DISCOVERY_SCORE_THRESHOLD,
  NOT_FOUND_SCORE_THRESHOLD,
  getOverlayPoints,
  isStrokeTooShort,
  matchConstellation,
} from './lib/shapeMatcher';
import type { MatchResult, Point } from './types';

const TOO_SHORT_HINT = 'もっと おおきく、ゆびで なぞってみてね!';
const DEFAULT_HINT = null;
/** なぞりガイド(👆)を出しておく時間。最初だけ助けて、あとは夜空を邪魔しない */
const TRACE_HINT_DURATION_MS = 10000;

function App() {
  const { width, height } = useViewportSize();
  const [result, setResult] = useState<MatchResult | null>(null);
  const [overlayPoints, setOverlayPoints] = useState<Point[] | null>(null);
  const [hint, setHint] = useState<string | null>(DEFAULT_HINT);
  const [isNewDiscovery, setIsNewDiscovery] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showZukan, setShowZukan] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [hintExpired, setHintExpired] = useState(false);

  const discoveries = useDiscoveries();
  const clientId = useClientId();

  // なぞりガイドは起動から一定時間で消す(以後は再表示しない)
  useEffect(() => {
    const timer = setTimeout(() => setHintExpired(true), TRACE_HINT_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  // 未捕捉エラーの自動報告(改善ループの入力になる)
  useEffect(() => {
    installErrorReporter(clientId);
  }, [clientId]);

  // 既にブラウザに貯まっている図鑑を、一度だけサーバーへ同期する(バックフィル)。
  // ダッシュボードの「ひとり平均」を過去分から正確にするため。サーバー側は
  // 冪等なので二重加算はされないが、毎回送らないよう端末に印を付けておく。
  useEffect(() => {
    if (!clientId) return;
    const SYNC_FLAG = 'startrace.discoveries.synced.v1';
    try {
      if (localStorage.getItem(SYNC_FLAG)) return;
      localStorage.setItem(SYNC_FLAG, new Date().toISOString());
    } catch {
      return; // localStorage が使えない環境では同期しない
    }
    for (const id of discoveries.discovered) {
      void backfillDiscovery(clientId, id);
    }
  }, [clientId, discoveries.discovered]);

  const handleStrokeEnd = useCallback(
    (stroke: Point[]) => {
      const diagonal = Math.hypot(width, height);
      if (isStrokeTooShort(stroke, diagonal)) {
        setHint(TOO_SHORT_HINT);
        return;
      }

      const matchResult = matchConstellation(stroke, CONSTELLATIONS);

      // どの星座にも十分似ていない場合は「みつからないね」演出にする
      // (適当ななぐり書きでも必ず何かがヒットしてしまうのを防ぐ)。
      if (matchResult.score < NOT_FOUND_SCORE_THRESHOLD) {
        sendEvent('trace_notfound', clientId);
        setNotFound(true);
        setResult(null);
        setOverlayPoints(null);
        setIsNewDiscovery(false);
        setHint(null);
        return;
      }

      sendEvent('trace_hit', clientId);

      const overlay = getOverlayPoints(stroke, matchResult.constellation);

      // 一定以上のマッチ度なら図鑑に登録。今回はじめての発見なら演出を出す。
      let newlyDiscovered = false;
      if (matchResult.score >= DISCOVERY_SCORE_THRESHOLD) {
        newlyDiscovered = discoveries.add(matchResult.constellation.id);
        // 全体集計にも記録(ベストエフォート。失敗してもアプリは動く)
        void recordDiscovery(clientId, matchResult.constellation.id);
      }

      setResult(matchResult);
      setOverlayPoints(overlay);
      setIsNewDiscovery(newlyDiscovered);
      setNotFound(false);
      setHint(null);
    },
    [width, height, discoveries, clientId],
  );

  const { currentStroke, handlers, reset } = useStrokeInput({ onStrokeEnd: handleStrokeEnd });

  const handleRetry = useCallback(() => {
    setResult(null);
    setOverlayPoints(null);
    setIsNewDiscovery(false);
    setNotFound(false);
    setHint(DEFAULT_HINT);
    reset();
  }, [reset]);

  const anyOverlayOpen = showZukan || showDashboard || showFeedback || showReleaseNotes;
  const resultShowing = result !== null || notFound;
  const canvasInteractive = !resultShowing && !anyOverlayOpen;
  const showTraceHint = canvasInteractive && currentStroke.length === 0 && !hintExpired;

  return (
    <div className="app-root">
      <div className="top-bar">
        {/* 結果パネル表示中はヘッダー文言を隠して被りを防ぐ(ナビは残す) */}
        {resultShowing ? <div className="app-header" aria-hidden="true" /> : <Header hint={hint} />}
        <nav className="top-nav" aria-label="メニュー">
          <button
            type="button"
            className="nav-button nav-button--count"
            onClick={() => {
              sendEvent('zukan_open', clientId);
              setShowZukan(true);
            }}
            aria-label="ほしぞら ずかんを ひらく"
          >
            <span className="nav-button__icon" aria-hidden="true">📖</span>
            <span className="nav-button__count">
              {discoveries.count}/{CONSTELLATIONS.length}
            </span>
          </button>
          <button
            type="button"
            className="nav-button"
            onClick={() => {
              sendEvent('dashboard_open', clientId);
              setShowDashboard(true);
            }}
            aria-label="みんなの ほしぞらを みる"
          >
            <span className="nav-button__icon" aria-hidden="true">🌍</span>
          </button>
          <div className="app-menu">
            <button
              type="button"
              className="nav-button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="メニュー"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <span className="nav-button__icon" aria-hidden="true">☰</span>
            </button>
            {menuOpen && (
              <div className="app-menu__dropdown" role="menu">
                <button
                  type="button"
                  className="app-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEvent('releasenotes_open', clientId);
                    setShowReleaseNotes(true);
                  }}
                >
                  <span aria-hidden="true">🆕</span> アップデート
                </button>
                <button
                  type="button"
                  className="app-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEvent('feedback_open', clientId);
                    setShowFeedback(true);
                  }}
                >
                  <span aria-hidden="true">💌</span> いけん・おといあわせ
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      {menuOpen && (
        <button
          type="button"
          className="app-menu__backdrop"
          aria-label="メニューを とじる"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {showTraceHint && (
        <div className="trace-hint" aria-hidden="true">
          <span className="trace-hint__finger">👆</span>
          <span className="trace-hint__text">ゆびで じゆうに なぞってみてね</span>
        </div>
      )}

      <SkyCanvas
        width={width}
        height={height}
        currentStroke={currentStroke}
        overlayPoints={overlayPoints}
        discovered={discoveries.discovered}
        interactive={canvasInteractive}
        pointerHandlers={handlers}
      />

      {result && (
        <ResultOverlay
          result={result}
          isNewDiscovery={isNewDiscovery}
          onRetry={handleRetry}
          onOpenZukan={() => setShowZukan(true)}
        />
      )}

      {notFound && (
        <NotFoundOverlay onRetry={handleRetry} onOpenZukan={() => setShowZukan(true)} />
      )}

      {showZukan && (
        <Zukan
          discovered={discoveries.discovered}
          onClose={() => setShowZukan(false)}
          onReset={discoveries.reset}
        />
      )}

      {showDashboard && (
        <Dashboard discovered={discoveries.discovered} onClose={() => setShowDashboard(false)} />
      )}

      {showFeedback && (
        <FeedbackForm clientId={clientId} onClose={() => setShowFeedback(false)} />
      )}

      {showReleaseNotes && <ReleaseNotes onClose={() => setShowReleaseNotes(false)} />}
    </div>
  );
}

export default App;
