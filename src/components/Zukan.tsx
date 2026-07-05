import { useState } from 'react';
import { ConstellationDiagram } from './ConstellationDiagram';
import { CONSTELLATIONS } from '../data/constellations';
import type { Constellation, ConstellationCategory } from '../types';

interface ZukanProps {
  discovered: Set<string>;
  onClose: () => void;
  onReset: () => void;
}

type FilterKey = 'all' | ConstellationCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ぜんぶ' },
  { key: 'real', label: 'ほんとうの せいざ' },
  { key: 'fun', label: 'おはなしの せいざ' },
];

function ZukanCard({ constellation, found }: { constellation: Constellation; found: boolean }) {
  if (!found) {
    return (
      <div className="zukan-card zukan-card--locked" aria-label="まだ みつけていない せいざ">
        <div className="zukan-card__mystery">?</div>
        <p className="zukan-card__name">？？？</p>
        <p className="zukan-card__hint">なぞって みつけよう</p>
      </div>
    );
  }

  return (
    <div className="zukan-card">
      <span className="zukan-card__emoji" aria-hidden="true">
        {constellation.emoji}
      </span>
      <ConstellationDiagram path={constellation.path} />
      <p className="zukan-card__name">{constellation.nameJa}</p>
      <p className="zukan-card__desc">{constellation.description}</p>
    </div>
  );
}

export function Zukan({ discovered, onClose, onReset }: ZukanProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const total = CONSTELLATIONS.length;
  const foundCount = CONSTELLATIONS.filter((c) => discovered.has(c.id)).length;
  const visible = CONSTELLATIONS.filter((c) => filter === 'all' || c.category === filter);
  const progressPercent = Math.round((foundCount / total) * 100);

  const handleReset = () => {
    onReset();
    setConfirmingReset(false);
  };

  return (
    <div className="zukan" role="dialog" aria-label="ほしぞら ずかん">
      <div className="zukan__header">
        <div className="zukan__titles">
          <h2 className="zukan__title">📖 ほしぞら ずかん</h2>
          <p className="zukan__progress-text">
            {foundCount} / {total} こ はっけん!
          </p>
        </div>
        <button type="button" className="zukan__close" onClick={onClose} aria-label="とじる">
          ✕
        </button>
      </div>

      <div className="zukan__progress-bar">
        <div className="zukan__progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="zukan__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`zukan__filter${filter === f.key ? ' zukan__filter--active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="zukan__grid">
        {visible.map((c) => (
          <ZukanCard key={c.id} constellation={c} found={discovered.has(c.id)} />
        ))}
      </div>

      <div className="zukan__footer">
        {confirmingReset ? (
          <div className="zukan__confirm">
            <span className="zukan__confirm-text">ぜんぶ けしても いい?</span>
            <button type="button" className="zukan__confirm-yes" onClick={handleReset}>
              けす
            </button>
            <button
              type="button"
              className="zukan__confirm-no"
              onClick={() => setConfirmingReset(false)}
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="zukan__reset"
            onClick={() => setConfirmingReset(true)}
            disabled={foundCount === 0}
          >
            ずかんを リセット
          </button>
        )}
      </div>
    </div>
  );
}
