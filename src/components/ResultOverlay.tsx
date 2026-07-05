import { ConstellationDiagram } from './ConstellationDiagram';
import type { MatchResult } from '../types';

interface ResultOverlayProps {
  result: MatchResult;
  onRetry: () => void;
}

export function ResultOverlay({ result, onRetry }: ResultOverlayProps) {
  const scoreRounded = Math.round(result.score);

  return (
    <div className="result-panel">
      <p className="result-panel__badge">この せいざに にてるよ!</p>
      <h2 className="result-panel__name">{result.constellation.nameJa}</h2>
      <p className="result-panel__sub">
        {result.constellation.nameEn} ({result.constellation.latinName})
      </p>

      <ConstellationDiagram path={result.constellation.path} />
      <p className="result-panel__description">{result.constellation.description}</p>

      <div className="result-panel__score">
        <span className="result-panel__score-label">にてる ど</span>
        <div className="result-panel__score-bar">
          <div
            className="result-panel__score-fill"
            style={{ width: `${scoreRounded}%` }}
          />
        </div>
        <span className="result-panel__score-value">{scoreRounded}%</span>
      </div>

      <button type="button" className="result-panel__retry" onClick={onRetry}>
        もういちど なぞる
      </button>
    </div>
  );
}
