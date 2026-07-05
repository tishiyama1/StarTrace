import type { Point } from '../types';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

export function centroid(points: Point[]): Point {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export interface NormalizeResult {
  points: Point[];
  centroid: Point;
  rms: number;
}

/** 重心を原点に平行移動し、重心からのRMS距離が1になるようスケーリングする(パラメータ付き) */
export function normalizeWithParams(points: Point[]): NormalizeResult {
  const c = centroid(points);
  const centered = points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

  const meanSquare =
    centered.reduce((acc, p) => acc + p.x * p.x + p.y * p.y, 0) / centered.length;
  const rms = Math.sqrt(meanSquare);

  if (rms < 1e-9) {
    return { points: centered, centroid: c, rms: 1 };
  }
  return { points: centered.map((p) => ({ x: p.x / rms, y: p.y / rms })), centroid: c, rms };
}

/** 重心を原点に平行移動し、重心からのRMS距離が1になるようスケーリングする */
export function normalizePoints(points: Point[]): Point[] {
  return normalizeWithParams(points).points;
}

export function rotatePoint(p: Point, theta: number): Point {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

/**
 * 点群 q を回転させて点群 p に最も近づける最適回転角 theta を閉形式で求める
 * (2次元における最小二乗回転フィッティング / Procrustes回転)。
 * p, q は同じ点数で、対応するインデックス同士が対応点であることを前提とする。
 */
export function optimalRotationAngle(p: Point[], q: Point[]): number {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < p.length; i++) {
    numerator += p[i].y * q[i].x - p[i].x * q[i].y;
    denominator += p[i].x * q[i].x + p[i].y * q[i].y;
  }
  return Math.atan2(numerator, denominator);
}

/** 対応点間の平均ユークリッド距離 */
export function meanPointDistance(p: Point[], q: Point[]): number {
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    total += distance(p[i], q[i]);
  }
  return total / p.length;
}
