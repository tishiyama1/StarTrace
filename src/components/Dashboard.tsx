import { useEffect, useMemo, useState } from 'react';
import { CONSTELLATIONS } from '../data/constellations';
import { fetchStats, type GlobalStats } from '../lib/api';

interface DashboardProps {
  /** IDs the current player has personally discovered. */
  discovered: Set<string>;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; stats: GlobalStats };

const TOTAL_KINDS = CONSTELLATIONS.length;

export function Dashboard({ discovered, onClose }: DashboardProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchStats()
      .then((stats) => {
        if (!cancelled) setState({ status: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ランキングは全星座を並べるが、未発見のものは名前を伏せてマスクする。
  const ranking = useMemo(() => {
    if (state.status !== 'ready') return [];
    return CONSTELLATIONS.map((c) => ({
      constellation: c,
      count: state.stats.constellations[c.id] ?? 0,
      mine: discovered.has(c.id),
    })).sort((a, b) => b.count - a.count);
  }, [state, discovered]);

  return (
    <div className="dashboard" role="dialog" aria-label="みんなの ほしぞら">
      <div className="dashboard__header">
        <h2 className="dashboard__title">🌍 みんなの ほしぞら</h2>
        <button type="button" className="dashboard__close" onClick={onClose} aria-label="とじる">
          ✕
        </button>
      </div>

      {state.status === 'loading' && (
        <p className="dashboard__message">よみこみちゅう…</p>
      )}

      {state.status === 'error' && (
        <p className="dashboard__message">
          いまは よみこめなかったよ。すこし じかんを おいて ためしてね。
        </p>
      )}

      {state.status === 'ready' && (
        <DashboardBody stats={state.stats} ranking={ranking} discovered={discovered} />
      )}
    </div>
  );
}

interface RankingRow {
  constellation: (typeof CONSTELLATIONS)[number];
  count: number;
  mine: boolean;
}

function DashboardBody({
  stats,
  ranking,
  discovered,
}: {
  stats: GlobalStats;
  ranking: RankingRow[];
  discovered: Set<string>;
}) {
  // 世界で見つかった種類数は全体データから数える(自分の発見とは独立)。
  const kindsFoundGlobally = CONSTELLATIONS.filter(
    (c) => (stats.constellations[c.id] ?? 0) > 0,
  ).length;
  const allFound = kindsFoundGlobally >= TOTAL_KINDS;
  const maxCount = ranking.length > 0 ? Math.max(1, ranking[0].count) : 1;

  const myKinds = discovered.size;
  const averagePerPlayer =
    stats.totalUsers > 0 ? stats.totalDiscoveries / stats.totalUsers : 0;

  return (
    <div className="dashboard__body">
      <div className="dashboard__tiles">
        <div className="stat-tile">
          <span className="stat-tile__icon" aria-hidden="true">👥</span>
          <span className="stat-tile__value">{stats.totalUsers.toLocaleString()}</span>
          <span className="stat-tile__label">さがした にんずう</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__icon" aria-hidden="true">⭐</span>
          <span className="stat-tile__value">{stats.totalDiscoveries.toLocaleString()}</span>
          <span className="stat-tile__label">みつけた ごうけい</span>
        </div>
        <div className={`stat-tile${allFound ? ' stat-tile--gold' : ''}`}>
          <span className="stat-tile__icon" aria-hidden="true">{allFound ? '🏆' : '🧭'}</span>
          <span className="stat-tile__value">
            {allFound ? 'たっせい!' : `${kindsFoundGlobally}/${TOTAL_KINDS}`}
          </span>
          <span className="stat-tile__label">
            {allFound ? 'ぜんぶ みつかった!' : 'せかいで みつかった しゅるい'}
          </span>
        </div>
      </div>

      {/* 自分 vs みんな */}
      <div className="dashboard__compare">
        <h3 className="dashboard__subtitle">きみ と みんな</h3>
        <CompareRow
          label="きみが みつけた しゅるい"
          value={myKinds}
          max={TOTAL_KINDS}
          suffix={`/${TOTAL_KINDS}`}
          tone="mine"
        />
        <CompareRow
          label="ひとり へいきん(みんな)"
          value={Math.round(averagePerPlayer * 10) / 10}
          max={TOTAL_KINDS}
          suffix=" こ"
          tone="all"
        />
        <p className="dashboard__compare-note">
          {myKinds >= averagePerPlayer
            ? '⭐ みんなの へいきんより たくさん みつけているよ!'
            : 'この ちょうしで もっと なぞって みつけよう!'}
        </p>
      </div>

      {/* 星座別ランキング(全星座。未発見はマスク) */}
      <h3 className="dashboard__subtitle">せいざ ランキング</h3>
      {ranking[0]?.count === 0 ? (
        <p className="dashboard__message">
          まだ だれも みつけていないよ。きみが さいしょかも!
        </p>
      ) : (
        <ul className="ranking">
          {ranking.map((row, i) => (
            <li
              key={row.constellation.id}
              className={`ranking__row${row.mine ? '' : ' ranking__row--masked'}`}
            >
              <span className="ranking__rank">{i + 1}</span>
              <span className="ranking__emoji" aria-hidden="true">
                {row.mine ? row.constellation.emoji : '❔'}
              </span>
              <div className="ranking__main">
                {row.mine ? (
                  <span className="ranking__name">{row.constellation.nameJa}</span>
                ) : (
                  <span className="ranking__name ranking__name--masked">
                    ？？？ <span className="ranking__masked-note">まだ みつけてないよ</span>
                  </span>
                )}
                <div className="ranking__bar">
                  <div
                    className="ranking__bar-fill"
                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
              <span className="ranking__count">{row.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompareRow({
  label,
  value,
  max,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  tone: 'mine' | 'all';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="compare-row">
      <span className="compare-row__label">{label}</span>
      <div className="compare-row__bar">
        <div className={`compare-row__fill compare-row__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="compare-row__value">
        {value}
        {suffix}
      </span>
    </div>
  );
}
