import type { Constellation, MatchResult, Point } from '../types';
import {
  normalizePoints,
  normalizeWithParams,
  optimalRotationAngle,
  rotatePoint,
  meanPointDistance,
  pathLength,
  secondaryCornerRatio,
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

/**
 * gemini(ふたご座)/taurus(おうし座)限定のタイブレークで使う定数(issue #38)。
 *
 * MIN_CONFIDENCE_MARGIN による僅差ブロックの過剰検出は、実測(23星座×手ブレ2〜12%
 * ×150試行=20,700試行)の59%が gemini/taurus 単独ペアの取り違えだった。この2つは
 * 全体距離では紛らわしいが、形の構造ははっきり異なる: gemini は「コの字」で
 * ほぼ同じ鋭さの曲がり角が2つ(双子それぞれの頭の折れ)あるのに対し、taurus は
 * 「よこに広いV」で鋭い折れ角が1つ(顔まわり)+その後は2本のツノがほぼ直線、という
 * 構造(secondaryCornerRatio でお手本同士を比べると gemini≈0.19, taurus≈0.02)。
 *
 * この非対称性を使い、このペア限定で「僅差」を解きほぐす。他のペアの判定・
 * MIN_CONFIDENCE_MARGIN 自体には一切影響しない。
 */
const GEMINI_TAURUS_CORNER_WINDOW = 5;

/**
 * ストロークの secondaryCornerRatio が gemini/taurus どちらのお手本の比に近いかを比べ、
 * その差がこの値未満(=どちらとも言い切れない)なら手を出さず、通常どおり
 * 「みつからないね」に倒す。
 *
 * 手ブレ2〜12%相当のノイズを加えた gemini/taurus 各300試行×6段階のシミュレーションで、
 * 0.12 は「正しいなぞりの取りこぼし(みつからないねへの誤ブロック)を大きく減らしつつ、
 * 確信度高い誤マッチ(取り違え)をほぼ0(高ノイズ12%でも1.3%程度)に抑える」バランス点として
 * 選んだ(0.05等もっと小さい値では正解率はやや上がるが取り違えも増える)。
 */
const GEMINI_TAURUS_CORNER_RATIO_MIN_GAP = 0.12;

function isGeminiTaurusPair(idA: string, idB: string): boolean {
  return (idA === 'gemini' && idB === 'taurus') || (idA === 'taurus' && idB === 'gemini');
}

interface ScoredCandidate {
  constellation: Constellation;
  distance: number;
  score: number;
}

/**
 * gemini/taurus 限定のタイブレーク本体。
 * ストローク自身の secondaryCornerRatio を両テンプレートのそれと比較し、
 * はっきりどちらかに近ければそちらを返す。差が僅かなら null を返し、
 * 呼び出し側で通常どおりの「みつからないね」処理に委ねる。
 */
function resolveGeminiTaurusTie(
  stroke: Point[],
  best: ScoredCandidate,
  runnerUp: ScoredCandidate,
): ScoredCandidate | null {
  const geminiCandidate = best.constellation.id === 'gemini' ? best : runnerUp;
  const taurusCandidate = best.constellation.id === 'taurus' ? best : runnerUp;

  const cornerRatioOf = (points: Point[]) =>
    secondaryCornerRatio(resamplePath(points, RESAMPLE_POINTS), GEMINI_TAURUS_CORNER_WINDOW);

  const userRatio = cornerRatioOf(stroke);
  const geminiRatio = cornerRatioOf(geminiCandidate.constellation.path);
  const taurusRatio = cornerRatioOf(taurusCandidate.constellation.path);

  const distanceToGemini = Math.abs(userRatio - geminiRatio);
  const distanceToTaurus = Math.abs(userRatio - taurusRatio);

  if (Math.abs(distanceToGemini - distanceToTaurus) < GEMINI_TAURUS_CORNER_RATIO_MIN_GAP) {
    return null;
  }

  return distanceToGemini < distanceToTaurus ? geminiCandidate : taurusCandidate;
}

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
    // gemini/taurus 限定: 全体距離では僅差でも、形の構造(曲がり角の数と鋭さ)で
    // はっきり決着がつくならブロックしない(issue #38)。他のペアはこれまでどおり。
    if (isGeminiTaurusPair(best.constellation.id, runnerUp.constellation.id)) {
      const resolved = resolveGeminiTaurusTie(stroke, best, runnerUp);
      if (resolved) {
        return resolved;
      }
    }
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
