import type { Point } from '../types';

interface ConstellationDiagramProps {
  path: Point[];
}

/** 星座のお手本の形を、なぞった線と見比べやすいようにきれいな線画で表示する。 */
export function ConstellationDiagram({ path }: ConstellationDiagramProps) {
  const points = path.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      className="constellation-diagram"
      viewBox="0 0 100 100"
      role="img"
      aria-label="せいざの ただしい かたち"
    >
      <polyline points={points} className="constellation-diagram__line" />
      {path.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="constellation-diagram__star" />
      ))}
    </svg>
  );
}
