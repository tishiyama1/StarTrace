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
 * このマッチ度未満のときは「どの星座にも 見えない」として、
 * 星座名を出さずに「みつからないね」の演出を返す閾値。
 * 適当ななぐり書きでも必ず何かがヒットしてしまう問題への対策。
 *
 * 値はランダムななぐり書き30種と、手ブレを加えた正しいなぞり44種の
 * スコア分布から決定した: なぐり書きは中央値59%・最大79%、正しいなぞりは
 * 最低でも88%。65% はなぐり書きの93%をブロックしつつ、正しいなぞりを
 * 誤ってブロックしない。
 */
export const NOT_FOUND_SCORE_THRESHOLD = 65;

/**
 * このマッチ度以上のときに「図鑑に登録する(=発見した)」とみなす閾値。
 * NOT_FOUND と同じ値にして「結果が表示された=図鑑にも登録される」という
 * 子供に分かりやすい体験にしている。
 */
export const DISCOVERY_SCORE_THRESHOLD = NOT_FOUND_SCORE_THRESHOLD;

/**
 * 1位と2位のマッチ度の差(スコアの僅差)がこの値未満のときは、
 * 「形の近い星座同士で紛らわしい」とみなし確信度不足として扱う。
 *
 * ハート/ペガスス/キノコ座など誤判定が報告された組み合わせで、手ブレを加えた
 * 手描き入力から誤って別テンプレートが1位になる(「取り違え」)ケースを大量に
 * シミュレーションして分布を計測した結果: 取り違えが起きるときの1位・2位の
 * スコア差はほぼ常に5未満(300試行×3星座×4ノイズ量で94%が5未満)。一方、
 * 全22星座はどれも自分自身とのマッチで7.8以上の差がある(識別性テスト対象の
 * 完全一致・回転・拡縮・平行移動では発生しない)ため、正しいなぞりを
 * 誤ってブロックするリスクは小さい。
 */
export const MIN_CONFIDENCE_MARGIN = 5;

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

  const scored = constellations
    .map((constellation) => {
      const distance = distanceToConstellation(stroke, constellation);
      return { constellation, distance, score: distanceToScore(distance) };
    })
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;

  // 僅差(=紛らわしい取り違えの可能性)なら確信度不足として「みつからないね」に倒す。
  // score だけを下げて not-found 判定に流し、constellation/distance はそのまま返す。
  if (runnerUp && best.score - runnerUp.score < MIN_CONFIDENCE_MARGIN) {
    return { ...best, score: Math.min(best.score, NOT_FOUND_SCORE_THRESHOLD - 1) };
  }

  return best;
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
