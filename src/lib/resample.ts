import type { Point } from '../types';
import { distance, pathLength } from './geometry';

/**
 * 折れ線を弧長ベースで N 点の等間隔な点列にリサンプリングする。
 * 入力が1点しかない、または全長が0の場合は同じ点を N 回複製して返す。
 */
export function resamplePath(points: Point[], n: number): Point[] {
  if (points.length === 0) {
    throw new Error('resamplePath: points must not be empty');
  }
  if (points.length === 1 || pathLength(points) < 1e-9) {
    const only = points[0];
    return Array.from({ length: n }, () => ({ x: only.x, y: only.y }));
  }

  const total = pathLength(points);
  const interval = total / (n - 1);

  const result: Point[] = [points[0]];
  let prev = points[0];
  let accumulated = 0;

  for (let i = 1; i < points.length && result.length < n; i++) {
    const current = points[i];
    let segmentLength = distance(prev, current);

    while (accumulated + segmentLength >= interval && result.length < n) {
      const remaining = interval - accumulated;
      const t = remaining / segmentLength;
      const newPoint: Point = {
        x: prev.x + t * (current.x - prev.x),
        y: prev.y + t * (current.y - prev.y),
      };
      result.push(newPoint);
      prev = newPoint;
      segmentLength = distance(prev, current);
      accumulated = 0;
    }

    accumulated += segmentLength;
    prev = current;
  }

  while (result.length < n) {
    result.push(points[points.length - 1]);
  }

  return result;
}
