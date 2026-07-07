/**
 * 実写志向の夜空レンダラー。
 *
 * 天体写真の構成要素(フラクタルノイズの天の川と暗黒帯・銀河バルジ・
 * 色温度をもつ星・ブルーム・大気光・山影・周辺減光)を再現する。
 *
 * 描画コストの高い静的要素(空のグラデーション・天の川・星雲・微光星・
 * ビネット)は `renderStaticSky()` で一度だけオフスクリーンに描き、
 * 毎フレームは1回の `drawImage` で済ませる。動くのは輝星のまたたきと
 * イベント(流れ星等)だけなので、リッチな見た目と 60fps を両立できる。
 */

// ---------------------------------------------------------------------------
// 乱数とノイズ(シード付き・決定的。空の模様が毎回同じ「いつもの夜空」になる)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2次元バリューノイズ(0〜1)。 */
export function valueNoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** フラクタルノイズ(fBm)。雲のようなムラを作る(だいたい 0〜1)。 */
export function fbm2(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise2(x * freq, y * freq, seed + i * 101);
    amp *= 0.5;
    freq *= 2.02;
  }
  return value;
}

// ---------------------------------------------------------------------------
// 静的な空(グラデーション+天の川+星雲+微光星+ビネット)のプリレンダ
// ---------------------------------------------------------------------------

/** 空の模様のシード。固定値にして「いつ開いても同じ夜空」にする。 */
const SKY_SEED = 20260707;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * 「天球ドーム」— 画面より大きい正方形の静的な空 — を描いて返す。
 *
 * 一辺 `size`(=画面対角+マージン)の正方形にしておき、画面中心を軸に
 * ゆっくり回転させても四隅に隙間が出ないようにする(地球の自転の演出)。
 * 空のベースは低解像度で per-pixel 計算し、拡大転写でなめらかにぼかす
 * (星雲・天の川の「にじみ」がタダで手に入る)。微光星と月は実解像度で重ねる。
 *
 * 画面に固定される要素(大気光・ビネット)は含めない —
 * それらは `renderAtmosphere()` が別レイヤーとして描く。
 */
export function renderStaticSky(size: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size * dpr));
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  // ---- 1. 低解像度 per-pixel パス --------------------------------------
  const scale = 0.3;
  const lw = Math.max(2, Math.round(size * scale));
  const lh = lw;
  const low = document.createElement('canvas');
  low.width = lw;
  low.height = lh;
  const lctx = low.getContext('2d');
  if (!lctx) return canvas;
  const img = lctx.createImageData(lw, lh);
  const data = img.data;

  // 天の川の帯: ドームの対角に沿わせる
  const angle = Math.PI / 4;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -dirY;
  const perpY = dirX;
  const diag = size * Math.SQRT2;
  const bandHalf = size * 0.16;

  // 空のベース色(上: 深い藍 → 下: わずかに明るい紫紺)
  const topColor: Rgb = { r: 6, g: 8, b: 22 };
  const midColor: Rgb = { r: 13, g: 17, b: 38 };
  const botColor: Rgb = { r: 24, g: 26, b: 48 };

  // かすかな星雲(実際の空の淡い散光星雲・反射星雲のイメージ)
  const nebulae = [
    { x: 0.26, y: 0.30, radius: 0.30, color: { r: 160, g: 80, b: 110 }, strength: 0.16 },
    { x: 0.72, y: 0.22, radius: 0.26, color: { r: 80, g: 115, b: 190 }, strength: 0.13 },
    { x: 0.62, y: 0.74, radius: 0.30, color: { r: 130, g: 90, b: 170 }, strength: 0.12 },
  ];

  const cx = size / 2;
  const cy = size / 2;

  let p = 0;
  for (let yy = 0; yy < lh; yy++) {
    const fy = yy / (lh - 1);
    const py = fy * size;
    // 縦グラデーション
    const base = fy < 0.6 ? lerpRgb(topColor, midColor, fy / 0.6) : lerpRgb(midColor, botColor, (fy - 0.6) / 0.4);

    for (let xx = 0; xx < lw; xx++) {
      const fx = xx / (lw - 1);
      const px = fx * size;

      let r = base.r;
      let g = base.g;
      let b = base.b;

      // ---- 天の川 ----
      const relX = px - cx;
      const relY = py - cy;
      const along = (relX * dirX + relY * dirY) / diag; // -0.5〜0.5 くらい
      const dist = (relX * perpX + relY * perpY) / bandHalf;

      // 帯の明るさ: ガウス減衰 × 雲状ノイズ
      const cloud = fbm2(along * 6.5 + 13.7, dist * 2.1, 4, SKY_SEED);
      let band = Math.exp(-dist * dist * 1.15) * (0.35 + 0.85 * cloud);

      // 暗黒帯(グレートリフト): 帯の中心近くを、ノイズで蛇行する黒い筋が走る
      const riftWobble = (fbm2(along * 4.2 + 51.3, 0, 3, SKY_SEED + 7) - 0.5) * 0.9;
      const riftD = (dist - riftWobble * 0.45 + 0.12) / 0.30;
      const rift = Math.exp(-riftD * riftD) * 0.72;
      band *= 1 - rift;

      // 銀河バルジ(中心方向のふくらみ): 帯の片側を明るく・暖色に
      const bulgeAlong = (along - 0.16) / 0.22;
      const bulge = Math.exp(-(bulgeAlong * bulgeAlong + dist * dist * 0.8)) * (0.55 + 0.45 * cloud);

      if (band > 0.003 || bulge > 0.003) {
        // 外側は青白く、バルジは象牙色に
        r += band * 26 + bulge * 66;
        g += band * 30 + bulge * 56;
        b += band * 44 + bulge * 50;
      }

      // ---- 星雲(ごく淡い色のにじみ) ----
      for (const neb of nebulae) {
        const dx = fx - neb.x;
        const dy = fy - neb.y;
        const nd = (dx * dx + dy * dy) / (neb.radius * neb.radius);
        if (nd < 1.6) {
          const shape = fbm2(fx * 5 + neb.x * 90, fy * 5 + neb.y * 90, 3, SKY_SEED + 31);
          const a = Math.exp(-nd * 2.2) * neb.strength * (0.45 + 0.75 * shape);
          r += neb.color.r * a;
          g += neb.color.g * a;
          b += neb.color.b * a;
        }
      }

      data[p++] = Math.min(255, r);
      data[p++] = Math.min(255, g);
      data[p++] = Math.min(255, b);
      data[p++] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);

  // 低解像度→実寸へ拡大(スムージングで自然なにじみになる)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(low, 0, 0, size, size);

  // ---- 2. 微光星(実解像度)。天の川沿いに密集させる ---------------------
  const rand = mulberry32(SKY_SEED + 5);
  const faintCount = Math.round(1400 + (size * size) / 850);
  for (let i = 0; i < faintCount; i++) {
    let px: number;
    let py: number;
    if (rand() < 0.45) {
      // 天の川の帯の中に集める(帯に近いほど濃い)
      const along = (rand() - 0.5) * 1.15;
      const dGauss = (rand() + rand() + rand() - 1.5) * 0.5;
      px = cx + dirX * along * diag + perpX * dGauss * bandHalf;
      py = cy + dirY * along * diag + perpY * dGauss * bandHalf;
      if (px < 0 || px > size || py < 0 || py > size) continue;
    } else {
      px = rand() * size;
      py = rand() * size;
    }

    const starSize = 0.35 + rand() * rand() * 0.9; // 小さい星ほど多い
    const alpha = 0.14 + rand() * 0.5 * (starSize / 1.2);
    // ほとんど白、まれに青白・暖色
    const tint = rand();
    const color =
      tint < 0.72 ? '228, 234, 246' : tint < 0.88 ? '196, 212, 248' : '250, 230, 205';
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    if (starSize < 0.8) {
      ctx.fillRect(px, py, starSize, starSize);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, starSize * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// 月(満ち欠けつき)。位相に応じたスプライトをキャッシュして毎フレーム転写する
// ---------------------------------------------------------------------------

/**
 * 月の照らされている面積の割合(0=新月, 0.5=半月, 1=満月)。
 * phase は 0〜1 の月齢位相(0=新月 → 0.5=満月 → 1=次の新月)。
 */
export function moonIlluminationFraction(phase: number): number {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

export interface MoonSpriteCache {
  canvas?: HTMLCanvasElement;
  phase?: number;
  radius?: number;
}

/**
 * 指定の位相の月スプライト(ハロー+地球照+照らされた面)を返す。
 * 位相がほとんど変わっていない間はキャッシュを使い回すので、
 * 毎フレーム呼んでも実質コストはかからない。
 *
 * 明暗境界(ターミネーター)は正しい月相の幾何で描く:
 * 照らされた側の半円 + 半径 r·|cos(2πφ)| の楕円を、
 * 三日月側では切り抜き・満月側では足し込む。
 */
export function getMoonSprite(cache: MoonSpriteCache, radius: number, phase: number): HTMLCanvasElement {
  const normalized = ((phase % 1) + 1) % 1;
  if (
    cache.canvas &&
    cache.radius === radius &&
    cache.phase !== undefined &&
    Math.abs(normalized - cache.phase) < 0.002
  ) {
    return cache.canvas;
  }

  const haloRadius = radius * 4.6;
  const size = Math.ceil(haloRadius * 2) + 4;
  const canvas = cache.canvas && cache.canvas.width === size ? cache.canvas : document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;

  const fraction = moonIlluminationFraction(normalized);

  // 月あかりのハロー(満月に近いほど明るく広がる)
  const haloAlpha = 0.05 + 0.19 * fraction;
  const halo = ctx.createRadialGradient(c, c, radius * 0.6, c, c, haloRadius);
  halo.addColorStop(0, `rgba(235, 238, 250, ${haloAlpha})`);
  halo.addColorStop(0.4, `rgba(225, 230, 250, ${haloAlpha * 0.3})`);
  halo.addColorStop(1, 'rgba(225, 230, 250, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(c, c, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // 地球照(影の側がうっすら見える。新月に近いほど相対的に目立つ)
  ctx.fillStyle = `rgba(205, 214, 236, ${0.05 + 0.1 * (1 - fraction)})`;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  // 照らされた面: 別ミニキャンバスで半円+ターミネーター楕円を合成
  if (fraction > 0.015) {
    const mini = document.createElement('canvas');
    const ms = Math.ceil(radius * 2) + 2;
    mini.width = ms;
    mini.height = ms;
    const mctx = mini.getContext('2d');
    if (mctx) {
      const mc = ms / 2;
      const k = Math.cos(normalized * Math.PI * 2); // +1=新月, 0=半月, -1=満月
      const waxing = normalized < 0.5; // 満ちていく間は右側が光る(北半球の見え方)

      // 照らされた側の半円
      mctx.fillStyle = '#f2ecdc';
      mctx.beginPath();
      mctx.arc(mc, mc, radius, -Math.PI / 2, Math.PI / 2, !waxing);
      mctx.closePath();
      mctx.fill();

      // ターミネーター(明暗境界)の楕円
      const rx = radius * Math.abs(k);
      if (rx > 0.2) {
        if (k > 0) {
          // 三日月側: 楕円ぶんを削る
          mctx.globalCompositeOperation = 'destination-out';
        }
        mctx.beginPath();
        mctx.ellipse(mc, mc, rx, radius, 0, 0, Math.PI * 2);
        mctx.fill();
        mctx.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(mini, c - mc, c - mc);
    }
  }

  cache.canvas = canvas;
  cache.phase = normalized;
  cache.radius = radius;
  return canvas;
}

/**
 * 画面に固定される大気のレイヤー(周辺減光+地平線近くの大気光)。
 * 回転する天球とは別に、一度だけ画面サイズで描いて毎フレーム重ねる。
 */
export function renderAtmosphere(cssWidth: number, cssHeight: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  // 大気光(地平線近くのかすかな緑)
  const glow = ctx.createLinearGradient(0, cssHeight * 0.78, 0, cssHeight * 0.97);
  glow.addColorStop(0, 'rgba(40, 95, 70, 0)');
  glow.addColorStop(0.62, 'rgba(45, 105, 78, 0.10)');
  glow.addColorStop(1, 'rgba(40, 95, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, cssHeight * 0.75, cssWidth, cssHeight * 0.25);

  // 周辺減光(ビネット。写真らしい落ち着き)
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const maxDist = Math.hypot(cx, cy);
  const vig = ctx.createRadialGradient(cx, cy, maxDist * 0.45, cx, cy, maxDist);
  vig.addColorStop(0, 'rgba(0, 0, 8, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 8, 0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  return canvas;
}

// ---------------------------------------------------------------------------
// 輝星(またたく明るい星)。ブルーム付きスプライトを使い回して毎フレーム描く
// ---------------------------------------------------------------------------

/** 恒星の色温度っぽいパレット(青白 → 白 → 黄 → オレンジ)。 */
const STAR_TINTS: { rgb: string; weight: number }[] = [
  { rgb: '175, 200, 255', weight: 0.2 }, // B型: 青白
  { rgb: '226, 233, 252', weight: 0.38 }, // A/F型: 白
  { rgb: '255, 243, 222', weight: 0.26 }, // G型: 黄白
  { rgb: '255, 219, 175', weight: 0.12 }, // K型: 橙
  { rgb: '255, 190, 155', weight: 0.04 }, // M型: 赤橙
];

export interface BrightStar {
  x: number; // 0〜1
  y: number;
  size: number; // 描画半径(px)
  tintIndex: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  /** ひときわ明るい星(回折光条つきスプライトを使う) */
  luminary: boolean;
}

export function generateBrightStars(count: number, seed = SKY_SEED + 9): BrightStar[] {
  const rand = mulberry32(seed);
  const stars: BrightStar[] = [];
  for (let i = 0; i < count; i++) {
    const t = rand();
    let acc = 0;
    let tintIndex = 0;
    for (let k = 0; k < STAR_TINTS.length; k++) {
      acc += STAR_TINTS[k].weight;
      if (t <= acc) {
        tintIndex = k;
        break;
      }
    }
    // 等級分布: 小さい星が圧倒的に多く、大きく明るい星はごく少数
    const mag = rand() * rand();
    const size = 0.8 + mag * mag * 2.6;
    stars.push({
      x: rand(),
      y: rand(),
      size,
      tintIndex,
      baseAlpha: 0.38 + mag * 0.62,
      twinkleSpeed: 0.0006 + rand() * 0.0018,
      twinklePhase: rand() * Math.PI * 2,
      luminary: size > 2.4,
    });
  }
  return stars;
}

/** ブルーム(にじみ)付きの星スプライトを色ごとに用意する。 */
export function createStarSprites(): { plain: HTMLCanvasElement; spiked: HTMLCanvasElement }[] {
  return STAR_TINTS.map(({ rgb }) => ({
    plain: makeStarSprite(rgb, false),
    spiked: makeStarSprite(rgb, true),
  }));
}

function makeStarSprite(rgb: string, spikes: boolean): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const half = size / 2;

  // 中心の白いコア + 色つきのガウス的なにじみ(PSF)
  const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.12, `rgba(${rgb}, 0.85)`);
  glow.addColorStop(0.32, `rgba(${rgb}, 0.22)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  if (spikes) {
    // レンズの回折光条(十字)。中心から端に向けて減衰
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const spike = ctx.createLinearGradient(half, half, half + dx * half, half + dy * half);
      spike.addColorStop(0, `rgba(${rgb}, 0.55)`);
      spike.addColorStop(0.5, `rgba(${rgb}, 0.12)`);
      spike.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.strokeStyle = spike;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.lineTo(half + dx * half, half + dy * half);
      ctx.stroke();
    }
  }
  return c;
}

export function drawBrightStars(
  ctx: CanvasRenderingContext2D,
  stars: BrightStar[],
  sprites: { plain: HTMLCanvasElement; spiked: HTMLCanvasElement }[],
  width: number,
  height: number,
  time: number,
): void {
  ctx.save();
  for (const star of stars) {
    // ゆっくりした明滅 + わずかに速い揺らぎ(大気のシンチレーション)
    const tw =
      0.72 +
      0.2 * Math.sin(time * star.twinkleSpeed + star.twinklePhase) +
      0.08 * Math.sin(time * star.twinkleSpeed * 3.7 + star.twinklePhase * 2.3);
    ctx.globalAlpha = Math.max(0.1, Math.min(1, star.baseAlpha * tw));
    const sprite = star.luminary ? sprites[star.tintIndex].spiked : sprites[star.tintIndex].plain;
    const drawSize = star.size * (star.luminary ? 10 : 6);
    ctx.drawImage(
      sprite,
      star.x * width - drawSize / 2,
      star.y * height - drawSize / 2,
      drawSize,
      drawSize,
    );
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 地平線の山影シルエット(写真の前景)
// ---------------------------------------------------------------------------

export interface Horizon {
  /** 稜線の高さ(画面高さ比、左→右) */
  ridge: number[];
  /** 木のシルエット(位置 0〜1 と大きさ) */
  trees: { x: number; size: number }[];
}

export function generateHorizon(segments = 64, seed = SKY_SEED + 17): Horizon {
  const rand = mulberry32(seed);
  const ridge: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const n = fbm2(t * 3.1, 0.5, 4, seed);
    ridge.push(0.045 + n * 0.055);
  }
  const trees: { x: number; size: number }[] = [];
  const treeCount = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < treeCount; i++) {
    trees.push({ x: rand(), size: 0.35 + rand() * 0.65 });
  }
  return { ridge, trees };
}

export function drawHorizon(
  ctx: CanvasRenderingContext2D,
  horizon: Horizon,
  width: number,
  height: number,
): void {
  const { ridge, trees } = horizon;
  const n = ridge.length - 1;

  ctx.save();
  ctx.fillStyle = '#04050c';

  // 稜線
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i <= n; i++) {
    ctx.lineTo((i / n) * width, height * (1 - ridge[i]));
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // 木(かさなった三角形のもみの木)
  const ridgeYAt = (fx: number) => {
    const idx = Math.max(0, Math.min(n, fx * n));
    const i0 = Math.floor(idx);
    const i1 = Math.min(n, i0 + 1);
    const f = idx - i0;
    return height * (1 - (ridge[i0] + (ridge[i1] - ridge[i0]) * f));
  };
  const unit = Math.min(width, height);
  for (const tree of trees) {
    const baseX = tree.x * width;
    const baseY = ridgeYAt(tree.x) + 2;
    const h = unit * 0.055 * tree.size;
    const w = h * 0.62;
    for (let tier = 0; tier < 3; tier++) {
      const ty = baseY - (h / 3) * tier;
      const tw = w * (1 - tier * 0.26);
      const th = h * 0.5;
      ctx.beginPath();
      ctx.moveTo(baseX - tw / 2, ty);
      ctx.lineTo(baseX + tw / 2, ty);
      ctx.lineTo(baseX, ty - th);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
