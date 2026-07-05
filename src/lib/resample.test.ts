import { describe, expect, it } from 'vitest';
import { resamplePath } from './resample';
import { pathLength } from './geometry';

describe('resamplePath', () => {
  it('returns exactly n points', () => {
    const result = resamplePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      16,
    );
    expect(result).toHaveLength(16);
  });

  it('produces points that are roughly equally spaced', () => {
    const result = resamplePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      11,
    );
    const total = pathLength(result);
    expect(total).toBeGreaterThan(0);
    const expectedInterval = total / (result.length - 1);
    for (let i = 1; i < result.length; i++) {
      const segment = Math.hypot(result[i].x - result[i - 1].x, result[i].y - result[i - 1].y);
      expect(segment).toBeCloseTo(expectedInterval, 1);
    }
  });

  it('handles a single-point input without throwing', () => {
    const result = resamplePath([{ x: 5, y: 5 }], 8);
    expect(result).toHaveLength(8);
    for (const p of result) {
      expect(p).toEqual({ x: 5, y: 5 });
    }
  });
});
