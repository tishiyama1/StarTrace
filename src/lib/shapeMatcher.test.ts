import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS } from '../data/constellations';
import type { Point } from '../types';
import { distanceToConstellation, matchConstellation, NOT_FOUND_SCORE_THRESHOLD } from './shapeMatcher';
import { rotatePoint } from './geometry';
import { resamplePath } from './resample';

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
