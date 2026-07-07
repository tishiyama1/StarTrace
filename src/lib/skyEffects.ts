/**
 * 夜空の「動く」演出(流れ星・火球・人工衛星・オーロラ)のユーティリティ。
 * 静的な空(天の川・微光星・山影など)は skyRenderer.ts が担当する。
 * 座標はすべて 0〜1 の正規化値で保持し、描画時に width/height を掛けて実ピクセルにする。
 */

export interface ShootingStar {
  x: number;
  y: number;
  /** 進行方向(正規化ベクトル) */
  dirX: number;
  dirY: number;
  /** 1ミリ秒あたりの移動量(画面短辺比) */
  speed: number;
  /** 尾の長さ(画面短辺比) */
  tailLength: number;
  /** 経過時間(ms) */
  age: number;
  /** 寿命(ms) */
  life: number;
  /** 尾と頭の色 "r, g, b" */
  rgb: string;
  /** 線の太さ(px) */
  width: number;
  /** 火球(大きく明るい流れ星)かどうか */
  fireball: boolean;
}

/** ゆっくり空を横切る人工衛星。 */
export interface Satellite {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** 1ミリ秒あたりの移動量(画面短辺比)。流れ星よりずっと遅い */
  speed: number;
  age: number;
  life: number;
}

/** 画面上部に揺らめくオーロラのカーテン。 */
export interface Aurora {
  age: number;
  life: number;
  layers: {
    /** 上端の基準位置(画面高さ比) */
    baseY: number;
    /** 揺れの振幅(画面高さ比) */
    amp: number;
    /** 波長係数 */
    waveLen: number;
    /** 揺れの速さ */
    phaseSpeed: number;
    /** カーテンの色 "r, g, b" */
    rgb: string;
    /** カーテンの縦の長さ(画面高さ比) */
    depth: number;
    peakAlpha: number;
  }[];
}

/** 流れ星の色バリエーション(実際の流星も組成で色が変わる)。 */
const METEOR_COLORS = [
  '220, 240, 255', // 白〜青白(いちばん多い)
  '220, 240, 255',
  '220, 240, 255',
  '180, 255, 220', // 緑がかった流星(マグネシウム)
  '255, 220, 170', // オレンジ(ナトリウム)
  '200, 210, 255', // 青紫
];

/**
 * 新しい流れ星を1つ生成する(画面上部からななめに流れる)。
 * @param kind 'fireball' にすると大きく明るい火球になる
 */
export function spawnShootingStar(kind: 'normal' | 'fireball' = 'normal'): ShootingStar {
  // 画面上部から出発し、下向き・ななめに流れる。
  // 進行方向と反対側から出発させることで、画面をしっかり横切って見えるようにする。
  const fromLeft = Math.random() < 0.5;
  const angle = fromLeft
    ? Math.PI * (0.13 + Math.random() * 0.1) // 右下方向
    : Math.PI * (0.87 - Math.random() * 0.1); // 左下方向
  const startX = fromLeft
    ? Math.random() * 0.35 + 0.05 // 右へ流れるので左寄りから
    : Math.random() * 0.35 + 0.6; // 左へ流れるので右寄りから
  const fireball = kind === 'fireball';
  return {
    x: startX,
    y: Math.random() * 0.2,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    // 速さ・長さ・太さにばらつきを持たせて、1本1本違う流れ星にする
    speed: fireball ? 0.0005 + Math.random() * 0.0003 : 0.0006 + Math.random() * 0.0007,
    tailLength: fireball ? 0.24 + Math.random() * 0.12 : 0.1 + Math.random() * 0.16,
    age: 0,
    life: fireball ? 1600 + Math.random() * 600 : 900 + Math.random() * 800,
    rgb: fireball
      ? '255, 235, 180' // 火球は明るい金色
      : METEOR_COLORS[Math.floor(Math.random() * METEOR_COLORS.length)],
    width: fireball ? 4.2 : 1.6 + Math.random() * 1.6,
    fireball,
  };
}

/** ゆっくり空を横切る人工衛星を生成する。 */
export function spawnSatellite(): Satellite {
  // 画面のどこか高めから、ほぼ水平にゆっくり横断する
  const fromLeft = Math.random() < 0.5;
  const angle = fromLeft
    ? (Math.random() * 0.2 - 0.1) // ほぼ右向き
    : Math.PI + (Math.random() * 0.2 - 0.1); // ほぼ左向き
  return {
    x: fromLeft ? -0.05 : 1.05,
    y: 0.08 + Math.random() * 0.45,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle) + 0.06 * (Math.random() - 0.5),
    speed: 0.00006 + Math.random() * 0.00004, // 流れ星の約1/10の速さ
    age: 0,
    life: 30000,
  };
}

export function updateSatellites(sats: Satellite[], dt: number, minDim: number): Satellite[] {
  const alive: Satellite[] = [];
  for (const s of sats) {
    s.age += dt;
    const move = s.speed * dt * minDim;
    s.x += (s.dirX * move) / minDim;
    s.y += (s.dirY * move) / minDim;
    if (s.age < s.life && s.x > -0.1 && s.x < 1.1 && s.y > -0.1 && s.y < 1.1) {
      alive.push(s);
    }
  }
  return alive;
}

export function drawSatellites(
  ctx: CanvasRenderingContext2D,
  sats: Satellite[],
  width: number,
  height: number,
): void {
  ctx.save();
  for (const s of sats) {
    const px = s.x * width;
    const py = s.y * height;
    // またたかない小さな点。すっと等速で動くのが人工衛星らしさ
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 250, 235, 0.95)';
    ctx.arc(px, py, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // ごく淡い進行方向の残像
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - s.dirX * 10, py - s.dirY * 10);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.restore();
}

/** オーロラを生成する(緑〜紫の2〜3層カーテン)。 */
export function spawnAurora(): Aurora {
  const palettes = [
    ['110, 235, 170', '80, 200, 220', '170, 130, 235'], // 緑→青緑→紫
    ['120, 240, 150', '110, 235, 190', '230, 130, 200'], // 緑中心+ピンク
  ];
  const palette = palettes[Math.floor(Math.random() * palettes.length)];
  return {
    age: 0,
    life: 16000 + Math.random() * 8000,
    layers: palette.map((rgb, i) => ({
      baseY: 0.04 + i * 0.05 + Math.random() * 0.03,
      amp: 0.02 + Math.random() * 0.025,
      waveLen: 2.2 + Math.random() * 2.4 + i,
      phaseSpeed: 0.00018 + Math.random() * 0.00022,
      rgb,
      depth: 0.2 + Math.random() * 0.12 - i * 0.03,
      peakAlpha: 0.2 - i * 0.045,
    })),
  };
}

/** オーロラの現在の強さ(0〜1)。出現・消滅時になめらかにフェードする。 */
export function auroraEnvelope(aurora: Aurora): number {
  const t = aurora.age / aurora.life;
  if (t <= 0 || t >= 1) return 0;
  const fadeIn = Math.min(1, t / 0.2);
  const fadeOut = Math.min(1, (1 - t) / 0.25);
  return Math.min(fadeIn, fadeOut);
}

export function drawAurora(
  ctx: CanvasRenderingContext2D,
  aurora: Aurora,
  width: number,
  height: number,
  time: number,
): void {
  const envelope = auroraEnvelope(aurora);
  if (envelope <= 0) return;

  ctx.save();
  for (const layer of aurora.layers) {
    const alpha = layer.peakAlpha * envelope;
    if (alpha <= 0.004) continue;

    // カーテン上端の波打つライン(細かく分割してなめらかな曲線にする)
    const steps = 56;
    const topY: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const fx = i / steps;
      const wave =
        Math.sin(fx * Math.PI * layer.waveLen + time * layer.phaseSpeed) * 0.75 +
        Math.sin(fx * Math.PI * layer.waveLen * 2.3 - time * layer.phaseSpeed * 1.6) * 0.25;
      topY.push((layer.baseY + wave * layer.amp) * height);
    }

    const depthPx = layer.depth * height;
    const gradient = ctx.createLinearGradient(0, layer.baseY * height, 0, layer.baseY * height + depthPx);
    gradient.addColorStop(0, `rgba(${layer.rgb}, ${alpha})`);
    gradient.addColorStop(0.55, `rgba(${layer.rgb}, ${alpha * 0.35})`);
    gradient.addColorStop(1, `rgba(${layer.rgb}, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, topY[0]);
    for (let i = 1; i <= steps; i++) {
      ctx.lineTo((i / steps) * width, topY[i]);
    }
    // 下辺(まっすぐ下ろしてから左へ戻る)
    ctx.lineTo(width, topY[steps] + depthPx);
    ctx.lineTo(0, topY[0] + depthPx);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 流れ星の位置を進め、寿命が来たものを取り除く。
 * @returns 生存している流れ星の配列
 */
export function updateShootingStars(stars: ShootingStar[], dt: number, minDim: number): ShootingStar[] {
  const alive: ShootingStar[] = [];
  for (const s of stars) {
    s.age += dt;
    const move = s.speed * dt * minDim;
    s.x += (s.dirX * move) / minDim;
    s.y += (s.dirY * move) / minDim;
    if (s.age < s.life && s.x > -0.2 && s.x < 1.2 && s.y < 1.2) {
      alive.push(s);
    }
  }
  return alive;
}

export function drawShootingStars(
  ctx: CanvasRenderingContext2D,
  stars: ShootingStar[],
  width: number,
  height: number,
): void {
  const minDim = Math.min(width, height);
  ctx.save();
  ctx.lineCap = 'round';
  for (const s of stars) {
    // 出現時にすっと現れ、消える直前にフェードアウトする
    const lifeFrac = s.age / s.life;
    const fade = Math.min(1, lifeFrac * 4) * Math.min(1, (1 - lifeFrac) * 3);
    if (fade <= 0) continue;

    const headX = s.x * width;
    const headY = s.y * height;
    const tailPx = s.tailLength * minDim;
    const tailX = headX - s.dirX * tailPx;
    const tailY = headY - s.dirY * tailPx;

    const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
    gradient.addColorStop(0, `rgba(${s.rgb}, 0)`);
    gradient.addColorStop(1, `rgba(${s.rgb}, ${0.9 * fade})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    // 先端の輝き(火球は大きく明るく)
    const headRadius = s.fireball ? 3.6 : 1.8;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * fade})`;
    ctx.shadowColor = `rgba(${s.rgb}, 0.95)`;
    ctx.shadowBlur = s.fireball ? 22 : 8;
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (s.fireball) {
      // 火球のまわりのぼんやりした光(残光)
      const glow = ctx.createRadialGradient(headX, headY, 0, headX, headY, 34);
      glow.addColorStop(0, `rgba(${s.rgb}, ${0.35 * fade})`);
      glow.addColorStop(1, `rgba(${s.rgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(headX, headY, 34, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
