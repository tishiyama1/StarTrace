import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS } from '../data/constellations';
import type { Point } from '../types';
import { distanceToConstellation, matchConstellation } from './shapeMatcher';
import { rotatePoint } from './geometry';

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
