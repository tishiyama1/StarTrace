import { useCallback, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { ResultOverlay } from './components/ResultOverlay';
import { NotFoundOverlay } from './components/NotFoundOverlay';
import { SkyCanvas } from './components/SkyCanvas';
import { Zukan } from './components/Zukan';
import { Dashboard } from './components/Dashboard';
import { FeedbackForm } from './components/FeedbackForm';
import { CONSTELLATIONS } from './data/constellations';
import { useStrokeInput } from './hooks/useStrokeInput';
import { useViewportSize } from './hooks/useViewportSize';
import { useDiscoveries } from './hooks/useDiscoveries';
import { useClientId } from './hooks/useClientId';
import { recordDiscovery } from './lib/api';
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

  const discoveries = useDiscoveries();
  const clientId = useClientId();

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
        setNotFound(true);
        setResult(null);
        setOverlayPoints(null);
        setIsNewDiscovery(false);
        setHint(null);
        return;
      }

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

  const anyOverlayOpen = showZukan || showDashboard || showFeedback;
  const canvasInteractive = result === null && !notFound && !anyOverlayOpen;
  const showTraceHint = canvasInteractive && currentStroke.length === 0;

  return (
    <div className="app-root">
      <div className="top-bar">
        <Header hint={hint} />
        <nav className="top-nav" aria-label="メニュー">
          <button
            type="button"
            className="nav-button nav-button--count"
            onClick={() => setShowZukan(true)}
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
            onClick={() => setShowDashboard(true)}
            aria-label="みんなの ほしぞらを みる"
          >
            <span className="nav-button__icon" aria-hidden="true">🌍</span>
          </button>
          <button
            type="button"
            className="nav-button"
            onClick={() => setShowFeedback(true)}
            aria-label="いけんを おくる"
          >
            <span className="nav-button__icon" aria-hidden="true">💌</span>
          </button>
        </nav>
      </div>

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
    </div>
  );
}

export default App;
