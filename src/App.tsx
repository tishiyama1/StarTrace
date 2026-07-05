import { useCallback, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { ResultOverlay } from './components/ResultOverlay';
import { SkyCanvas } from './components/SkyCanvas';
import { Zukan } from './components/Zukan';
import { CONSTELLATIONS } from './data/constellations';
import { useStrokeInput } from './hooks/useStrokeInput';
import { useViewportSize } from './hooks/useViewportSize';
import { useDiscoveries } from './hooks/useDiscoveries';
import {
  DISCOVERY_SCORE_THRESHOLD,
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
  const [showZukan, setShowZukan] = useState(false);

  const discoveries = useDiscoveries();

  const handleStrokeEnd = useCallback(
    (stroke: Point[]) => {
      const diagonal = Math.hypot(width, height);
      if (isStrokeTooShort(stroke, diagonal)) {
        setHint(TOO_SHORT_HINT);
        return;
      }

      const matchResult = matchConstellation(stroke, CONSTELLATIONS);
      const overlay = getOverlayPoints(stroke, matchResult.constellation);

      // 一定以上のマッチ度なら図鑑に登録。今回はじめての発見なら演出を出す。
      let newlyDiscovered = false;
      if (matchResult.score >= DISCOVERY_SCORE_THRESHOLD) {
        newlyDiscovered = discoveries.add(matchResult.constellation.id);
      }

      setResult(matchResult);
      setOverlayPoints(overlay);
      setIsNewDiscovery(newlyDiscovered);
      setHint(null);
    },
    [width, height, discoveries],
  );

  const { currentStroke, handlers, reset } = useStrokeInput({ onStrokeEnd: handleStrokeEnd });

  const handleRetry = useCallback(() => {
    setResult(null);
    setOverlayPoints(null);
    setIsNewDiscovery(false);
    setHint(DEFAULT_HINT);
    reset();
  }, [reset]);

  const canvasInteractive = result === null && !showZukan;

  return (
    <div className="app-root">
      <Header hint={hint} />

      <button
        type="button"
        className="zukan-open-button"
        onClick={() => setShowZukan(true)}
        aria-label="ほしぞら ずかんを ひらく"
      >
        <span className="zukan-open-button__icon" aria-hidden="true">
          📖
        </span>
        <span className="zukan-open-button__count">
          {discoveries.count}/{CONSTELLATIONS.length}
        </span>
      </button>

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

      {showZukan && (
        <Zukan
          discovered={discoveries.discovered}
          onClose={() => setShowZukan(false)}
          onReset={discoveries.reset}
        />
      )}
    </div>
  );
}

export default App;
