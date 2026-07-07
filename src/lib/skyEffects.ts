/**
 * 夜空の「動く」演出(流れ星・火球・人工衛星・オーロラ)のユーティリティ。
 * 静的な空(天の川・微光星・山影など)は skyRenderer.ts が担当する。
 * 座標はすべて 0〜1 の正規化値で保持し、描画時に width/height を掛けて実ピクセルにする。
 */

import { fbm2, valueNoise2 } from './skyRenderer';

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

/** オーロラの1枚のカーテン。 */
export interface AuroraCurtain {
  /** カーテン下端(明るい縁)の基準高さ(画面高さ比) */
  baseY: number;
  /** 下端のうねりの振幅(画面高さ比) */
  amp: number;
  /** レイ(光条)が上へ伸びる基準の長さ(画面高さ比) */
  rayLen: number;
  /** 明るさ(0〜1) */
  strength: number;
  /** 折りたたみ(明るい部分)の空間スケール */
  foldScale: number;
  /** カーテンに沿って模様が流れる速さ */
  driftSpeed: number;
}

/**
 * 画面上部に揺らめくオーロラ。
 * 実際のオーロラの構造 — 垂直のレイ、鋭く明るい下端、高度による色の変化
 * (下端の緑 → 上部の赤紫)、うねるカーテンの折りたたみ — を再現する。
 */
export interface Aurora {
  age: number;
  life: number;
  seed: number;
  /** 活動が強い夜は上部が赤紫に色づく */
  hasRedTop: boolean;
  curtains: AuroraCurtain[];
  /** 低解像度の描画バッファ(ランタイム専用) */
  buffer?: HTMLCanvasElement;
  /** バッファを最後に描いた時刻(ms) */
  lastRenderTime?: number;
  /** 使い回し用の作業バッファ(毎回確保するとGCが重くなる) */
  imageData?: ImageData;
  accumulator?: Float32Array;
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

/** オーロラを生成する(奥に淡いカーテン+手前に明るいカーテンの2枚)。 */
export function spawnAurora(): Aurora {
  return {
    age: 0,
    life: 20000 + Math.random() * 10000,
    seed: Math.floor(Math.random() * 100000),
    hasRedTop: Math.random() < 0.55,
    curtains: [
      // 奥のカーテン: 高く・淡く・ゆっくり
      {
        baseY: 0.26 + Math.random() * 0.05,
        amp: 0.065,
        rayLen: 0.24,
        strength: 0.5,
        foldScale: 1.6,
        driftSpeed: 0.000032,
      },
      // 手前のカーテン: 低く・明るく・すこし速い
      {
        baseY: 0.37 + Math.random() * 0.06,
        amp: 0.085,
        rayLen: 0.30,
        strength: 1.0,
        foldScale: 2.3,
        driftSpeed: 0.00005,
      },
    ],
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

/**
 * オーロラのバッファ再描画の最短間隔(ms)。オーロラの動きはゆっくりなので
 * 15fps相当の更新で十分なめらか(表示自体は毎フレームの拡大転写で補間される)
 */
const AURORA_REDRAW_INTERVAL = 66;
/** バッファの解像度(実寸に対する比)。拡大時のスムージングがそのままグローになる */
const AURORA_BUFFER_SCALE = 0.18;

/**
 * オーロラを描く。
 * 低解像度バッファに1ピクセルずつ「カーテンの物理」を計算して書き込み、
 * 拡大転写する。列ごとに下端の高さ・折りたたみの明るさ・レイの縞を
 * ノイズで決め、高度プロファイル(鋭い下端 → 上へ減衰、上部は赤紫)で
 * 色を混ぜる。
 */
export function drawAurora(
  ctx: CanvasRenderingContext2D,
  aurora: Aurora,
  width: number,
  height: number,
  time: number,
): void {
  const envelope = auroraEnvelope(aurora);
  if (envelope <= 0) return;

  const regionH = height * 0.62;
  const lowW = Math.max(8, Math.ceil(width * AURORA_BUFFER_SCALE));
  const lowH = Math.max(8, Math.ceil(regionH * AURORA_BUFFER_SCALE));

  if (!aurora.buffer || aurora.buffer.width !== lowW || aurora.buffer.height !== lowH) {
    aurora.buffer = document.createElement('canvas');
    aurora.buffer.width = lowW;
    aurora.buffer.height = lowH;
    aurora.lastRenderTime = undefined;
    aurora.imageData = undefined;
    aurora.accumulator = undefined;
  }

  const needRender =
    aurora.lastRenderTime === undefined || time - aurora.lastRenderTime >= AURORA_REDRAW_INTERVAL;
  if (needRender) {
    aurora.lastRenderTime = time;
    renderAuroraBuffer(aurora, lowW, lowH, height, time, envelope);
  }

  ctx.save();
  // 拡大転写のスムージングは既定品質にする('high' はソフトウェア描画環境で
  // フレーム予算を食いつぶす。グローのぼかし用途なら既定で十分なめらか)
  ctx.imageSmoothingEnabled = true;
  // オーロラは「光」なので加算合成で足す。淡い部分が空を暗く汚さず、
  // 星や月がオーロラ越しに自然に透ける
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(aurora.buffer, 0, 0, width, regionH);
  ctx.restore();
}

function renderAuroraBuffer(
  aurora: Aurora,
  lowW: number,
  lowH: number,
  screenHeight: number,
  time: number,
  envelope: number,
): void {
  const bctx = aurora.buffer?.getContext('2d');
  if (!bctx) return;
  if (!aurora.imageData) {
    aurora.imageData = bctx.createImageData(lowW, lowH);
  }
  if (!aurora.accumulator) {
    aurora.accumulator = new Float32Array(lowW * lowH * 4);
  }
  const img = aurora.imageData;
  const data = img.data;
  const acc = aurora.accumulator;
  acc.fill(0);
  const seed = aurora.seed;
  const scaleY = (lowH / (screenHeight * 0.62)) * screenHeight; // 画面比 → バッファpx

  for (let c = 0; c < aurora.curtains.length; c++) {
    const curtain = aurora.curtains[c];
    const drift = time * curtain.driftSpeed;
    const curtainSeed = seed + c * 977;

    for (let x = 0; x < lowW; x++) {
      const u = x / lowW;

      // カーテンの折りたたみ: 大きな明暗のかたまりが横に流れる
      const fold = 0.2 + 1.0 * fbm2(u * curtain.foldScale + drift, 3.7, 2, curtainSeed);
      // レイ(光条): 細かい縦の縞。明るさと「長さ」の両方を波立たせることで、
      // 高さのちがう縦のすじが並ぶ本物のカーテンの見た目になる
      const rayBright = valueNoise2(u * 46 + drift * 260, c * 7.3, curtainSeed + 5);
      const rayLenNoise = valueNoise2(u * 21 + drift * 130, 4.4, curtainSeed + 29);
      const colStrength = envelope * curtain.strength * fold * (0.3 + 0.7 * rayBright * rayBright);
      if (colStrength < 0.01) continue;

      // 下端の高さ: 大きなうねり + 細かい波 + 列ごとの微ジッター。
      // 微ジッターはバッファ解像度での量子化(棚のような段差)をほどく
      const baseWave =
        (fbm2(u * 1.3 + drift * 0.7, 8.1, 2, curtainSeed + 11) - 0.5) * 2 +
        (fbm2(u * 5.7 + drift * 1.9, 21.9, 2, curtainSeed + 41) - 0.5) * 1.1;
      const jitter = (valueNoise2(u * 31 + drift * 40, 33.3, curtainSeed + 61) - 0.5) * 2.4;
      const baseYpx = (curtain.baseY + baseWave * curtain.amp) * scaleY + jitter;
      // この列のレイの長さ(列ごとに大きく変化して、すじの高さがそろわない)。
      // バッファ上端でクリップされて平らにならないよう、上端手前で必ず収める
      const rayLenPx = Math.min(
        curtain.rayLen * scaleY * (0.35 + 0.95 * rayLenNoise),
        baseYpx - 2,
      );
      if (rayLenPx <= 2) continue;

      const yTop = Math.max(0, Math.floor(baseYpx - rayLenPx));
      const yBottom = Math.min(lowH - 1, Math.ceil(baseYpx + rayLenPx * 0.3));

      for (let y = yTop; y <= yBottom; y++) {
        // a: 下端からの高さ(0=下端, 1=レイの先端, 負=下端より下)
        const a = (baseYpx - y) / rayLenPx;

        // 高度プロファイル: 柔らかく明るい下端のグロー + 上へ減衰する長いレイ。
        // 下端を細い線にするとバッファ解像度の段差が見えてしまうため、
        // 幅のあるグローにしてなめらかに沈ませる
        let green = 0;
        let red = 0;
        let pink = 0;
        if (a >= 0) {
          green = colStrength * (Math.exp(-a * 1.7) * 0.62 + Math.exp((-a * a) / 0.015) * 0.38);
          if (aurora.hasRedTop) {
            // 高高度の赤〜紫(酸素630nm)。レイの上のほうだけ色づく
            const ta = (a - 0.75) / 0.32;
            red = colStrength * Math.exp(-ta * ta) * 0.5;
          }
        } else {
          // 下端の下はなだらかに消えつつ、窒素のピンクがほんのり残る
          green = colStrength * Math.exp((-a * a) / 0.008) * 0.5;
          pink = colStrength * colStrength * Math.exp((-a * a) / 0.004) * 0.35;
        }

        const p = (y * lowW + x) * 4;
        acc[p] += green * 30 + red * 180 + pink * 190; // R
        acc[p + 1] += green * 175 + red * 42 + pink * 85; // G
        acc[p + 2] += green * 112 + red * 118 + pink * 138; // B
      }
    }
  }

  // 加算合成('lighter')で光として足すので、全ピクセル不透明・RGB=光量にする
  // (黒は「光ゼロ」として何も足さない)
  for (let i = 0; i < acc.length; i += 4) {
    data[i] = Math.min(255, acc[i]);
    data[i + 1] = Math.min(255, acc[i + 1]);
    data[i + 2] = Math.min(255, acc[i + 2]);
    data[i + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
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
