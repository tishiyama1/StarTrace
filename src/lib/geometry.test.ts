import { describe, expect, it } from 'vitest';
import {
  centroid,
  distance,
  meanPointDistance,
  normalizePoints,
  normalizeWithParams,
  optimalRotationAngle,
  pathLength,
  rotatePoint,
  secondaryCornerRatio,
  turningAngleMagnitudes,
} from './geometry';
import type { Point } from '../types';

describe('distance', () => {
  it('returns the euclidean distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('returns 0 for the same point', () => {
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
});

describe('pathLength', () => {
  it('sums the distances between consecutive points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 0 },
    ];
    expect(pathLength(points)).toBeCloseTo(9);
  });

  it('returns 0 for a single point', () => {
    expect(pathLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('centroid', () => {
  it('returns the average of the points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 15 },
    ];
    expect(centroid(points)).toEqual({ x: 5, y: 5 });
  });
});

describe('normalizeWithParams / normalizePoints', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('centers the points on the origin', () => {
    const result = normalizeWithParams(square);
    expect(centroid(result.points).x).toBeCloseTo(0);
    expect(centroid(result.points).y).toBeCloseTo(0);
    expect(result.centroid).toEqual({ x: 5, y: 5 });
  });

  it('scales so the RMS distance from the centroid is 1', () => {
    const result = normalizeWithParams(square);
    const meanSquare =
      result.points.reduce((acc, p) => acc + p.x * p.x + p.y * p.y, 0) / result.points.length;
    expect(Math.sqrt(meanSquare)).toBeCloseTo(1);
  });

  it('is invariant to translation', () => {
    const shifted = square.map((p) => ({ x: p.x + 100, y: p.y - 50 }));
    const a = normalizePoints(square);
    const b = normalizePoints(shifted);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x);
      expect(b[i].y).toBeCloseTo(a[i].y);
    }
  });

  it('is invariant to uniform scaling', () => {
    const scaled = square.map((p) => ({ x: p.x * 3, y: p.y * 3 }));
    const a = normalizePoints(square);
    const b = normalizePoints(scaled);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x);
      expect(b[i].y).toBeCloseTo(a[i].y);
    }
  });

  it('does not divide by zero when all points coincide', () => {
    const same: Point[] = [
      { x: 2, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 2 },
    ];
    const result = normalizeWithParams(same);
    expect(result.rms).toBe(1);
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('rotatePoint', () => {
  it('rotates a point 90 degrees counter-clockwise', () => {
    const rotated = rotatePoint({ x: 1, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });

  it('leaves a point unchanged for a 0 rotation', () => {
    const rotated = rotatePoint({ x: 3, y: 4 }, 0);
    expect(rotated.x).toBeCloseTo(3);
    expect(rotated.y).toBeCloseTo(4);
  });
});

describe('optimalRotationAngle', () => {
  it('recovers a known rotation angle between two point sets', () => {
    const p: Point[] = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 2, y: 3 },
    ];
    const theta = Math.PI / 3;
    const q = p.map((pt) => rotatePoint(pt, theta));

    // optimalRotationAngle(p, q) finds the angle that rotates q onto p, i.e. -theta.
    const recovered = optimalRotationAngle(p, q);
    expect(recovered).toBeCloseTo(-theta);
  });

  it('returns 0 for identical point sets', () => {
    const p: Point[] = [
      { x: 1, y: 0 },
      { x: 0, y: 2 },
    ];
    expect(optimalRotationAngle(p, p)).toBeCloseTo(0);
  });
});

describe('meanPointDistance', () => {
  it('returns 0 for identical point sets', () => {
    const p: Point[] = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(meanPointDistance(p, p)).toBe(0);
  });

  it('averages the per-index distances', () => {
    const p: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const q: Point[] = [
      { x: 3, y: 4 },
      { x: 0, y: 0 },
    ];
    expect(meanPointDistance(p, q)).toBeCloseTo(2.5);
  });
});

describe('turningAngleMagnitudes', () => {
  it('is close to 0 along a straight line', () => {
    const line: Point[] = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0 }));
    const angles = turningAngleMagnitudes(line, 2);
    for (let i = 2; i < line.length - 2; i++) {
      expect(angles[i]).toBeCloseTo(0);
    }
  });

  it('detects a sharp right-angle corner', () => {
    // a path that goes right then turns to go up, with a sharp corner at index 4
    const path: Point[] = [
      { x: -4, y: 0 },
      { x: -3, y: 0 },
      { x: -2, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
    ];
    const angles = turningAngleMagnitudes(path, 2);
    expect(angles[4]).toBeCloseTo(Math.PI / 2);
  });

  it('leaves the unwritable window edges at 0', () => {
    const path: Point[] = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 }));
    const angles = turningAngleMagnitudes(path, 2);
    expect(angles[0]).toBe(0);
    expect(angles[1]).toBe(0);
    expect(angles[angles.length - 1]).toBe(0);
  });
});

describe('secondaryCornerRatio', () => {
  function corner(at: number, length = 9): Point[] {
    // an L-shaped path with a single sharp 90-degree corner at index `at`
    return Array.from({ length }, (_, i) =>
      i <= at ? { x: i - at, y: 0 } : { x: 0, y: i - at },
    );
  }

  it('is close to 0 when there is only a single sharp corner', () => {
    const ratio = secondaryCornerRatio(corner(4), 2);
    expect(ratio).toBeLessThan(0.2);
  });

  it('is close to 1 when there are two equally sharp corners far apart', () => {
    // a "Z" shaped path: sharp corner near the start and another sharp corner
    // near the end, separated well beyond the suppression radius (window * 2)
    const path: Point[] = [
      { x: 0, y: 5 },
      { x: 0, y: 4 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: -1 },
      { x: 5, y: -2 },
      { x: 5, y: -3 },
      { x: 5, y: -4 },
      { x: 5, y: -5 },
    ];
    const ratio = secondaryCornerRatio(path, 2);
    expect(ratio).toBeCloseTo(1, 1);
  });

  it('returns 0 for a straight line with no corner', () => {
    const line: Point[] = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0 }));
    expect(secondaryCornerRatio(line, 2)).toBe(0);
  });
});
