import type { Constellation, MatchResult, Point } from '../types';
import {
  normalizePoints,
  normalizeWithParams,
  optimalRotationAngle,
  rotatePoint,
  meanPointDistance,
  pathLength,
} from './geometry';
import { resamplePath } from './resample';

/** リサンプリングする点数 */
export const RESAMPLE_POINTS = 64;

/**
 * 正規化空間での平均距離を 0〜100 のマッチ度に変換するためのスケール定数。
 * distance = 0 (完全一致) で score = 100、distance >= DISTANCE_SCALE で score = 0。
 */
export const DISTANCE_SCALE = 1.4;

/** これより短いストロークは「タップ」とみなしマッチングを行わない */
export const MIN_STROKE_LENGTH_RATIO = 0.05;

/**
 * このマッチ度以上のときに「図鑑に登録する(=発見した)」とみなす閾値。
 * 低すぎると適当に描いても集まってしまい、高すぎると子供が達成できないため中間値。
 */
export const DISCOVERY_SCORE_THRESHOLD = 55;

function distanceForDirection(userNormalized: Point[], templateNormalized: Point[]): number {
  const theta = optimalRotationAngle(userNormalized, templateNormalized);
  const rotated = templateNormalized.map((p) => rotatePoint(p, theta));
  return meanPointDistance(userNormalized, rotated);
}

/** ストロークとテンプレート1つとの最小距離(正方向・逆方向の両方を試す) */
export function distanceToConstellation(stroke: Point[], constellation: Constellation): number {
  const userResampled = resamplePath(stroke, RESAMPLE_POINTS);
  const userNormalized = normalizePoints(userResampled);

  const forwardResampled = resamplePath(constellation.path, RESAMPLE_POINTS);
  const reverseResampled = resamplePath([...constellation.path].reverse(), RESAMPLE_POINTS);

  const forwardNormalized = normalizePoints(forwardResampled);
  const reverseNormalized = normalizePoints(reverseResampled);

  const forwardDistance = distanceForDirection(userNormalized, forwardNormalized);
  const reverseDistance = distanceForDirection(userNormalized, reverseNormalized);

  return Math.min(forwardDistance, reverseDistance);
}

export function distanceToScore(distance: number): number {
  const score = 100 * (1 - distance / DISTANCE_SCALE);
  return Math.max(0, Math.min(100, score));
}

/**
 * ストロークが「タップ」程度の短さでないかを判定する。
 * @param canvasDiagonal 判定基準となる画面(Canvas)の対角線の長さ
 */
export function isStrokeTooShort(stroke: Point[], canvasDiagonal: number): boolean {
  return pathLength(stroke) < canvasDiagonal * MIN_STROKE_LENGTH_RATIO;
}

/** ストロークに最も近い星座を判定する */
export function matchConstellation(stroke: Point[], constellations: Constellation[]): MatchResult {
  if (constellations.length === 0) {
    throw new Error('matchConstellation: constellations must not be empty');
  }

  let best: MatchResult | null = null;

  for (const constellation of constellations) {
    const dist = distanceToConstellation(stroke, constellation);
    if (best === null || dist < best.distance) {
      best = { constellation, distance: dist, score: distanceToScore(dist) };
    }
  }

  return best as MatchResult;
}

/**
 * マッチした星座のお手本の形を、ユーザーが描いたストロークと同じ位置・大きさになるよう
 * 変換した座標列を返す(結果画面でお手本を重ねて表示するために使う)。
 */
export function getOverlayPoints(stroke: Point[], constellation: Constellation): Point[] {
  const userResampled = resamplePath(stroke, RESAMPLE_POINTS);
  const { points: userNormalized, centroid: userCentroid, rms: userRms } =
    normalizeWithParams(userResampled);

  const forwardResampled = resamplePath(constellation.path, RESAMPLE_POINTS);
  const reverseResampled = resamplePath([...constellation.path].reverse(), RESAMPLE_POINTS);

  const forwardNormalized = normalizePoints(forwardResampled);
  const reverseNormalized = normalizePoints(reverseResampled);

  const forwardDistance = distanceForDirection(userNormalized, forwardNormalized);
  const reverseDistance = distanceForDirection(userNormalized, reverseNormalized);

  const templateNormalized = forwardDistance <= reverseDistance ? forwardNormalized : reverseNormalized;
  const theta = optimalRotationAngle(userNormalized, templateNormalized);

  return templateNormalized.map((p) => {
    const rotated = rotatePoint(p, theta);
    return { x: rotated.x * userRms + userCentroid.x, y: rotated.y * userRms + userCentroid.y };
  });
}
