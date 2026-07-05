import { useCallback, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { ResultOverlay } from './components/ResultOverlay';
import { SkyCanvas } from './components/SkyCanvas';
import { CONSTELLATIONS } from './data/constellations';
import { useStrokeInput } from './hooks/useStrokeInput';
import { useViewportSize } from './hooks/useViewportSize';
import { getOverlayPoints, isStrokeTooShort, matchConstellation } from './lib/shapeMatcher';
import type { MatchResult, Point } from './types';

const TOO_SHORT_HINT = 'もっと おおきく、ゆびで なぞってみてね!';
const DEFAULT_HINT = null;

function App() {
  const { width, height } = useViewportSize();
  const [result, setResult] = useState<MatchResult | null>(null);
  const [overlayPoints, setOverlayPoints] = useState<Point[] | null>(null);
  const [hint, setHint] = useState<string | null>(DEFAULT_HINT);

  const handleStrokeEnd = useCallback(
    (stroke: Point[]) => {
      const diagonal = Math.hypot(width, height);
      if (isStrokeTooShort(stroke, diagonal)) {
        setHint(TOO_SHORT_HINT);
        return;
      }

      const matchResult = matchConstellation(stroke, CONSTELLATIONS);
      const overlay = getOverlayPoints(stroke, matchResult.constellation);
      setResult(matchResult);
      setOverlayPoints(overlay);
      setHint(null);
    },
    [width, height],
  );

  const { currentStroke, handlers, reset } = useStrokeInput({ onStrokeEnd: handleStrokeEnd });

  const handleRetry = useCallback(() => {
    setResult(null);
    setOverlayPoints(null);
    setHint(DEFAULT_HINT);
    reset();
  }, [reset]);

  return (
    <div className="app-root">
      <Header hint={hint} />
      <SkyCanvas
        width={width}
        height={height}
        currentStroke={currentStroke}
        overlayPoints={overlayPoints}
        interactive={result === null}
        pointerHandlers={handlers}
      />
      {result && <ResultOverlay result={result} onRetry={handleRetry} />}
    </div>
  );
}

export default App;
