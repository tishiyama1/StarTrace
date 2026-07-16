import { describe, expect, it } from 'vitest';
import {
  auroraEnvelope,
  spawnAurora,
  spawnSatellite,
  spawnShootingStar,
  updateSatellites,
  updateShootingStars,
  type ShootingStar,
} from './skyEffects';
import {
  drawDiscoveredConstellations,
  fbm2,
  generateBrightStars,
  generateConstellationSlots,
  generateHorizon,
  moonIlluminationFraction,
  mulberry32,
  valueNoise2,
} from './skyRenderer';

describe('skyRenderer noise', () => {
  it('mulberry32 is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      expect(a()).toBe(b());
    }
  });

  it('valueNoise2 / fbm2 return values in a sane range and are deterministic', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.7;
      const y = i * 1.3;
      const n = valueNoise2(x, y, 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(fbm2(x, y, 4, 7)).toBe(fbm2(x, y, 4, 7));
    }
  });
});

describe('generateBrightStars', () => {
  it('creates normalized stars with valid tint indices', () => {
    const stars = generateBrightStars(60);
    expect(stars).toHaveLength(60);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
      expect(s.size).toBeGreaterThan(0);
      expect(s.tintIndex).toBeGreaterThanOrEqual(0);
      expect(s.tintIndex).toBeLessThan(5);
    }
  });
});

describe('generateHorizon', () => {
  it('creates a ridge with reasonable heights and some trees', () => {
    const h = generateHorizon(48);
    expect(h.ridge).toHaveLength(49);
    for (const r of h.ridge) {
      expect(r).toBeGreaterThan(0.02);
      expect(r).toBeLessThan(0.15);
    }
    expect(h.trees.length).toBeGreaterThan(3);
  });
});

describe('spawnShootingStar', () => {
  it('starts near the top with a normalized direction vector', () => {
    for (let i = 0; i < 30; i++) {
      const s = spawnShootingStar();
      expect(s.y).toBeLessThan(0.3);
      const mag = Math.hypot(s.dirX, s.dirY);
      expect(mag).toBeCloseTo(1, 5);
      // 下向きに流れる
      expect(s.dirY).toBeGreaterThan(0);
      expect(s.life).toBeGreaterThan(0);
    }
  });

  it('spawns on the opposite side of its travel direction so it can cross the screen', () => {
    for (let i = 0; i < 40; i++) {
      const s = spawnShootingStar();
      if (s.dirX > 0) {
        // 右へ流れるなら左寄りから始まる
        expect(s.x).toBeLessThan(0.55);
      } else {
        // 左へ流れるなら右寄りから始まる
        expect(s.x).toBeGreaterThan(0.45);
      }
    }
  });
});

describe('updateShootingStars', () => {
  it('advances position along the direction vector', () => {
    const star: ShootingStar = {
      x: 0.2,
      y: 0.1,
      dirX: 1,
      dirY: 0.5,
      speed: 0.001,
      tailLength: 0.2,
      age: 0,
      life: 1000,
      rgb: '220, 240, 255',
      width: 2,
      fireball: false,
    };
    const [moved] = updateShootingStars([star], 100, 400);
    expect(moved.x).toBeGreaterThan(0.2);
    expect(moved.y).toBeGreaterThan(0.1);
    expect(moved.age).toBe(100);
  });

  it('removes stars whose life has ended', () => {
    const star: ShootingStar = {
      x: 0.5,
      y: 0.5,
      dirX: 1,
      dirY: 0,
      speed: 0.001,
      tailLength: 0.2,
      age: 990,
      life: 1000,
      rgb: '220, 240, 255',
      width: 2,
      fireball: false,
    };
    const result = updateShootingStars([star], 50, 400);
    expect(result).toHaveLength(0);
  });

  it('removes stars that have left the screen', () => {
    const star: ShootingStar = {
      x: 1.15,
      y: 0.5,
      dirX: 1,
      dirY: 0,
      speed: 0.01,
      tailLength: 0.2,
      age: 100,
      life: 5000,
      rgb: '220, 240, 255',
      width: 2,
      fireball: false,
    };
    const result = updateShootingStars([star], 50, 400);
    expect(result).toHaveLength(0);
  });
});

describe('fireball', () => {
  it('is bigger, longer-lived and marked as fireball', () => {
    const normal = spawnShootingStar();
    const fireball = spawnShootingStar('fireball');
    expect(fireball.fireball).toBe(true);
    expect(normal.fireball).toBe(false);
    expect(fireball.width).toBeGreaterThan(3);
    expect(fireball.life).toBeGreaterThan(1500);
  });
});

describe('satellite', () => {
  it('crosses the sky slowly and horizontally-ish', () => {
    for (let i = 0; i < 20; i++) {
      const s = spawnSatellite();
      expect(Math.abs(s.dirX)).toBeGreaterThan(0.8); // ほぼ水平
      expect(s.speed).toBeLessThan(0.0002); // 流れ星よりずっと遅い
    }
  });

  it('advances position and expires off-screen', () => {
    const s = spawnSatellite();
    const startX = s.x;
    const [moved] = updateSatellites([s], 1000, 400);
    expect(moved.x).not.toBe(startX);

    const gone = { ...spawnSatellite(), x: 1.5 };
    expect(updateSatellites([gone], 16, 400)).toHaveLength(0);
  });
});

describe('aurora', () => {
  it('spawns layered curtains with sane parameters', () => {
    const a = spawnAurora();
    expect(a.curtains.length).toBeGreaterThanOrEqual(2);
    for (const curtain of a.curtains) {
      expect(curtain.strength).toBeGreaterThan(0);
      expect(curtain.rayLen).toBeGreaterThan(0);
      expect(curtain.baseY).toBeGreaterThan(0);
      expect(curtain.baseY).toBeLessThan(0.6);
    }
    expect(typeof a.hasRedTop).toBe('boolean');
  });

  it('fades in and out over its lifetime', () => {
    const a = spawnAurora();
    a.age = 0;
    expect(auroraEnvelope(a)).toBe(0);
    a.age = a.life / 2;
    expect(auroraEnvelope(a)).toBeCloseTo(1, 5);
    a.age = a.life;
    expect(auroraEnvelope(a)).toBe(0);
  });
});

describe('generateConstellationSlots', () => {
  it('is deterministic and keeps every slot within the dome (0..1)', () => {
    const a = generateConstellationSlots(25);
    const b = generateConstellationSlots(25);
    expect(a).toEqual(b);
    for (const slot of a) {
      expect(slot.x).toBeGreaterThan(0);
      expect(slot.x).toBeLessThan(1);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(1);
    }
  });

  it('spreads slots out so no two constellations share a spot', () => {
    const slots = generateConstellationSlots(25);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const dist = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y);
        expect(dist).toBeGreaterThan(0.01);
      }
    }
  });

  it('returns an empty array for zero constellations', () => {
    expect(generateConstellationSlots(0)).toEqual([]);
  });
});

describe('drawDiscoveredConstellations', () => {
  function makeCtxMock() {
    return {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
  }

  it('does nothing when there is nothing discovered yet', () => {
    const ctx = makeCtxMock();
    expect(() => drawDiscoveredConstellations(ctx, [], 800, 0)).not.toThrow();
  });

  it('draws each discovered constellation without throwing', () => {
    const ctx = makeCtxMock();
    const slots = generateConstellationSlots(2);
    const items = [
      {
        path: [
          { x: 10, y: 10 },
          { x: 50, y: 20 },
          { x: 30, y: 60 },
        ],
        slot: slots[0],
      },
      {
        path: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        slot: slots[1],
      },
    ];
    expect(() => drawDiscoveredConstellations(ctx, items, 800, 1234)).not.toThrow();
  });
});

describe('moonIlluminationFraction', () => {
  it('is 0 at new moon, 0.5 at quarters, 1 at full moon', () => {
    expect(moonIlluminationFraction(0)).toBeCloseTo(0, 5);
    expect(moonIlluminationFraction(0.25)).toBeCloseTo(0.5, 5);
    expect(moonIlluminationFraction(0.5)).toBeCloseTo(1, 5);
    expect(moonIlluminationFraction(0.75)).toBeCloseTo(0.5, 5);
    expect(moonIlluminationFraction(1)).toBeCloseTo(0, 5);
  });
});
