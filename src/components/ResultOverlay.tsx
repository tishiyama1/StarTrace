import { ConstellationDiagram } from './ConstellationDiagram';
import type { MatchResult } from '../types';

interface ResultOverlayProps {
  result: MatchResult;
  /** この結果ではじめて図鑑に登録された(新発見)かどうか */
  isNewDiscovery: boolean;
  onRetry: () => void;
  onOpenZukan: () => void;
}

const CATEGORY_BADGE: Record<MatchResult['constellation']['category'], string> = {
  real: 'ほんとうの せいざ',
  fun: 'おはなしの せいざ',
};

function praiseForScore(score: number): string {
  if (score >= 85) return '⭐ かんぺき!';
  if (score >= 70) return '🌟 すごい!';
  if (score >= 55) return '✨ いいね!';
  return '🌙 おしい! もういちど やってみよう';
}

export function ResultOverlay({ result, isNewDiscovery, onRetry, onOpenZukan }: ResultOverlayProps) {
  const scoreRounded = Math.round(result.score);
  const { constellation } = result;

  return (
    <div className={`result-panel${isNewDiscovery ? ' result-panel--new' : ''}`}>
      {isNewDiscovery && (
        <div className="result-panel__new-ribbon" role="status">
          ✨ ずかんに とうろく! ✨
        </div>
      )}

      <p className="result-panel__badge">この せいざに にてるよ!</p>
      <h2 className="result-panel__name">
        <span className="result-panel__name-emoji" aria-hidden="true">
          {constellation.emoji}
        </span>
        {constellation.nameJa}
      </h2>
      <p className="result-panel__sub">
        {constellation.nameEn} ({constellation.latinName})
      </p>
      <span className={`result-panel__category result-panel__category--${constellation.category}`}>
        {CATEGORY_BADGE[constellation.category]}
      </span>

      <ConstellationDiagram path={constellation.path} />
      <p className="result-panel__description">{constellation.description}</p>

      <div className="result-panel__score">
        <span className="result-panel__score-label">にてる ど</span>
        <div className="result-panel__score-bar">
          <div className="result-panel__score-fill" style={{ width: `${scoreRounded}%` }} />
        </div>
        <span className="result-panel__score-value">{scoreRounded}%</span>
      </div>
      <p className="result-panel__praise">{praiseForScore(result.score)}</p>

      <div className="result-panel__actions">
        <button type="button" className="result-panel__retry" onClick={onRetry}>
          もういちど なぞる
        </button>
        <button type="button" className="result-panel__zukan" onClick={onOpenZukan}>
          📖 ずかん
        </button>
      </div>
    </div>
  );
}
