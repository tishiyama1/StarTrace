import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS } from '../data/constellations';
import type { Point } from '../types';
import {
  distanceToConstellation,
  distanceToScore,
  matchConstellation,
  MIN_CONFIDENCE_MARGIN,
  NOT_FOUND_SCORE_THRESHOLD,
} from './shapeMatcher';
import { normalizeWithParams, rotatePoint } from './geometry';
import { resamplePath } from './resample';
import { mulberry32 } from './skyRenderer';

function translate(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function scale(points: Point[], factor: number): Point[] {
  return points.map((p) => ({ x: p.x * factor, y: p.y * factor }));
}

function rotate(points: Point[], theta: number): Point[] {
  return points.map((p) => rotatePoint(p, theta));
}

describe('matchConstellation', () => {
  for (const constellation of CONSTELLATIONS) {
    it(`identifies ${constellation.id} from its own (translated) shape`, () => {
      const stroke = translate(constellation.path, 200, -50);
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
    });

    it(`identifies ${constellation.id} when scaled up`, () => {
      const stroke = scale(constellation.path, 3);
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
    });

    it(`identifies ${constellation.id} when rotated 90 degrees`, () => {
      const stroke = rotate(constellation.path, Math.PI / 2);
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
    });

    it(`identifies ${constellation.id} when drawn in reverse`, () => {
      const stroke = [...constellation.path].reverse();
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
    });

    it(`gives a high score (>90) for an exact (translated+scaled+rotated) match of ${constellation.id}`, () => {
      const stroke = rotate(scale(translate(constellation.path, 10, 10), 1.7), 0.4);
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
      expect(result.score).toBeGreaterThan(90);
    });
  }

  it('gives a low score for a simple straight line vs a square-like constellation', () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const distance = distanceToConstellation(line, CONSTELLATIONS.find((c) => c.id === 'pegasus')!);
    expect(distance).toBeGreaterThan(0.3);
  });
});

describe('constellation template distinctiveness', () => {
  it('each constellation is closest to itself among all templates', () => {
    for (const constellation of CONSTELLATIONS) {
      const distances = CONSTELLATIONS.map((candidate) => ({
        id: candidate.id,
        distance: distanceToConstellation(constellation.path, candidate),
      }));
      distances.sort((a, b) => a.distance - b.distance);
      expect(distances[0].id).toBe(constellation.id);
    }
  });
});

/** 2つの星座テンプレートのちょうど中間形状のストローク(=どちらとも言い切れない、紛らわしい入力)を作る */
function blendShapes(idA: string, idB: string): Point[] {
  const a = resamplePath(CONSTELLATIONS.find((c) => c.id === idA)!.path, 64);
  const b = resamplePath(CONSTELLATIONS.find((c) => c.id === idB)!.path, 64);
  return a.map((p, i) => ({ x: (p.x + b[i].x) / 2, y: (p.y + b[i].y) / 2 }));
}

/**
 * お手本の各頂点(コントロールポイント)を、形の大きさに比例した量だけランダムにずらして
 * 手ブレ入り手描きをシミュレートする(1点ずつ独立にリサンプル後の点をずらす方式だと
 * 不自然にギザギザになるため、頂点単位でずらしてから resamplePath に通す)。
 * seed 付き決定的乱数(mulberry32)を使うため CI でも結果は安定する。
 */
function perturbTemplate(path: Point[], noiseLevel: number, rand: () => number): Point[] {
  const { rms } = normalizeWithParams(path);
  return path.map((p) => {
    const angle = rand() * Math.PI * 2;
    const magnitude = rand() * noiseLevel * rms;
    return { x: p.x + Math.cos(angle) * magnitude, y: p.y + Math.sin(angle) * magnitude };
  });
}

describe('confidence margin (ambiguous shape handling, issue #24)', () => {
  // フィードバックで報告された誤判定の組み合わせ: ハート/ペガスス/キノコ座は
  // 回転・拡縮・平行移動不変の距離では互いに近く(#24参照)、手描きの誤差次第で
  // 取り違えが起こり得る。1位と2位の中間形状(=どちらとも言い切れない、
  // 明確に「ハートそのもの」でも「ペガススそのもの」でもない入力)を与えたとき、
  // どちらか一方を確信度高く言い切らず「みつからないね」寄り(閾値未満)に
  // 倒れることを検証する。
  it.each([
    ['heart', 'pegasus'],
    ['heart', 'mushroom'],
  ])('a shape exactly between %s and %s is not confidently matched to either', (idA, idB) => {
    const blended = blendShapes(idA, idB);
    const result = matchConstellation(blended, CONSTELLATIONS);
    expect(result.score).toBeLessThan(NOT_FOUND_SCORE_THRESHOLD);
  });

  it('still confidently identifies a clearly-drawn heart despite being similar to pegasus', () => {
    const heart = CONSTELLATIONS.find((c) => c.id === 'heart')!;
    const result = matchConstellation(heart.path, CONSTELLATIONS);
    expect(result.constellation.id).toBe('heart');
    expect(result.score).toBeGreaterThan(90);
  });
});

describe('gemini/taurus pair-specific tie-break (issue #38)', () => {
  const GEMINI = CONSTELLATIONS.find((c) => c.id === 'gemini')!;
  const TAURUS = CONSTELLATIONS.find((c) => c.id === 'taurus')!;

  it.each([
    ['gemini', GEMINI, 20260719],
    ['taurus', TAURUS, 20260720],
  ] as const)(
    'correctly matches noisy %s strokes in cases that are genuinely a score-margin tie with the other',
    (id, source, seed) => {
      // シミュレーション(issue #38参照)で確認した通り、gemini/taurus は手ブレを加えると
      // 頻繁に「全体距離では僅差」になる。以前はこの僅差ケースが一律「みつからないね」に
      // 倒れていたが、曲がり角の形がはっきり違う分については正しく判定できるように
      // なったことを、実際に僅差となったケースだけを対象に検証する
      // (曲がり角の差も僅かな一部のケースは、意図どおり今も not-found に倒れてよい)。
      const rand = mulberry32(seed);
      let ambiguousCasesSeen = 0;
      let resolvedCorrectly = 0;
      for (let trial = 0; trial < 60; trial++) {
        const stroke = perturbTemplate(source.path, 0.1, rand);
        const geminiScore = distanceToScore(distanceToConstellation(stroke, GEMINI));
        const taurusScore = distanceToScore(distanceToConstellation(stroke, TAURUS));
        if (Math.abs(geminiScore - taurusScore) >= MIN_CONFIDENCE_MARGIN) continue;

        ambiguousCasesSeen++;
        const result = matchConstellation(stroke, CONSTELLATIONS);
        if (result.constellation.id === id && result.score >= NOT_FOUND_SCORE_THRESHOLD) {
          resolvedCorrectly++;
        }
        // 解決できないときは、確信度高い「取り違え」ではなく not-found 側に倒れているべき。
        if (result.score >= NOT_FOUND_SCORE_THRESHOLD) {
          expect(result.constellation.id).toBe(id);
        }
      }
      // 手ブレなぞりが実際にこの「僅差」状況を再現できていること、かつ
      // その大半が正しく解決されるようになったことを確認する。
      expect(ambiguousCasesSeen).toBeGreaterThan(0);
      expect(resolvedCorrectly).toBeGreaterThan(0);
      expect(resolvedCorrectly / ambiguousCasesSeen).toBeGreaterThan(0.5);
    },
  );

  it('measurably raises the overall correct-match rate for noisy gemini/taurus strokes without introducing confident-wrong matches', () => {
    // issue #38 のシミュレーションと同じ方式(頂点単位のノイズ)で、実装済みの
    // matchConstellation をそのまま使い、正解率・not-found率・確信度高い誤マッチ率を測る。
    for (const id of ['gemini', 'taurus'] as const) {
      const rand = mulberry32(31415 + id.length);
      const template = CONSTELLATIONS.find((c) => c.id === id)!.path;
      let correct = 0;
      let confidentWrong = 0;
      const trials = 80;
      for (let t = 0; t < trials; t++) {
        const stroke = perturbTemplate(template, 0.08, rand);
        const result = matchConstellation(stroke, CONSTELLATIONS);
        const found = result.score >= NOT_FOUND_SCORE_THRESHOLD;
        if (found && result.constellation.id === id) correct++;
        if (found && result.constellation.id !== id) confidentWrong++;
      }
      // 修正前(margin導入直後)はこの水準のノイズで correct/trials が8割を割り込んでいた。
      // 確信度高い誤マッチ(取り違え)は増やさないことも合わせて確認する。
      expect(correct / trials).toBeGreaterThan(0.85);
      expect(confidentWrong).toBe(0);
    }
  });

  it('does not change not-found behavior for other confusing pairs (pair-scoping check)', () => {
    // gemini/taurus 用のタイブレークが他のペアに漏れ出していないことを、
    // 既存の紛らわしいペア(heart/pegasus, heart/mushroom)で再確認する。
    for (const [idA, idB] of [
      ['heart', 'pegasus'],
      ['heart', 'mushroom'],
    ]) {
      const blended = blendShapes(idA, idB);
      const result = matchConstellation(blended, CONSTELLATIONS);
      expect(result.score).toBeLessThan(NOT_FOUND_SCORE_THRESHOLD);
    }
  });

  it('does not introduce confident-wrong matches for a broader sample of unrelated constellations', () => {
    // gemini/taurus 以外の星座に手ブレを加えても、確信度高い誤マッチが増えていないことを確認する。
    const sampleIds = ['heart', 'pegasus', 'mushroom', 'leo', 'orion', 'cygnus', 'ursa-major', 'aries', 'virgo'];
    const rand = mulberry32(2718);
    for (const id of sampleIds) {
      const template = CONSTELLATIONS.find((c) => c.id === id)!.path;
      for (let t = 0; t < 20; t++) {
        const stroke = perturbTemplate(template, 0.08, rand);
        const result = matchConstellation(stroke, CONSTELLATIONS);
        if (result.score >= NOT_FOUND_SCORE_THRESHOLD) {
          expect(result.constellation.id).toBe(id);
        }
      }
    }
  });

  it('still recognizes gemini and taurus upside-down (rotation invariance is preserved)', () => {
    // 回転不変性(=「上下逆さまを認める」)が gemini/taurus でも維持されていることを、
    // 180度回転させたお手本そのもので確認する(#38の対応方針: 回転不変性は無効化しない)。
    for (const constellation of [GEMINI, TAURUS]) {
      const stroke = rotate(constellation.path, Math.PI);
      const result = matchConstellation(stroke, CONSTELLATIONS);
      expect(result.constellation.id).toBe(constellation.id);
      expect(result.score).toBeGreaterThan(90);
    }
  });
});
