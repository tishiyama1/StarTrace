import { useEffect, useRef } from 'react';
import type { Point } from '../types';
import {
  drawAurora,
  drawSatellites,
  drawShootingStars,
  spawnAurora,
  spawnSatellite,
  spawnShootingStar,
  updateSatellites,
  updateShootingStars,
  type Aurora,
  type Satellite,
  type ShootingStar,
} from '../lib/skyEffects';
import {
  createStarSprites,
  drawBrightStars,
  drawHorizon,
  generateBrightStars,
  generateHorizon,
  getMoonSprite,
  renderAtmosphere,
  renderStaticSky,
  type MoonSpriteCache,
} from '../lib/skyRenderer';

interface PointerHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

interface SkyCanvasProps {
  width: number;
  height: number;
  currentStroke: Point[];
  overlayPoints: Point[] | null;
  interactive: boolean;
  pointerHandlers: PointerHandlers;
}

export function SkyCanvas({
  width,
  height,
  currentStroke,
  overlayPoints,
  interactive,
  pointerHandlers,
}: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 静的な空(プリレンダ)・輝星・山影は初回とリサイズ時だけ作り直す
  // 輝星は画面より大きい「天球ドーム」上に置くため、少し多めに生成する
  const brightStarsRef = useRef(generateBrightStars(300));
  const starSpritesRef = useRef<ReturnType<typeof createStarSprites> | null>(null);
  const horizonRef = useRef(generateHorizon());
  const moonCacheRef = useRef<MoonSpriteCache>({});

  // 動的な天体(流れ星・人工衛星・オーロラ)とイベント予約
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const satellitesRef = useRef<Satellite[]>([]);
  const auroraRef = useRef<Aurora | null>(null);
  const nextEventInRef = useRef<number>(1800);
  // 流星群イベント中の残り数と次の1本までの時間
  const showerRef = useRef<{ remaining: number; nextIn: number }>({ remaining: 0, nextIn: 0 });
  const lastTimeRef = useRef<number>(0);

  const strokeRef = useRef<Point[]>(currentStroke);
  const overlayRef = useRef<Point[] | null>(overlayPoints);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    strokeRef.current = currentStroke;
  }, [currentStroke]);

  useEffect(() => {
    overlayRef.current = overlayPoints;
  }, [overlayPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return;
    const ctx: CanvasRenderingContext2D = rawCtx;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const minDim = Math.min(width, height);

    // 重い静的レイヤーはここで一度だけ描く(リサイズ時は作り直し)。
    // 天球ドームは画面対角より大きい正方形にして、回転しても隙間が出ないようにする。
    const domeSize = Math.ceil(Math.hypot(width, height)) + 16;
    const skyDome = renderStaticSky(domeSize, dpr);
    const atmosphere = renderAtmosphere(width, height, dpr);
    if (!starSpritesRef.current) {
      starSpritesRef.current = createStarSprites();
    }
    const sprites = starSpritesRef.current;

    // 地球の自転の演出: 天球全体が画面中心のまわりをゆっくり回る(1周約40分)
    const ROTATION_PERIOD_MS = 40 * 60 * 1000;
    // 月の満ち欠け: 自転と同じくらいの時間スケールで新月→満月→新月を一巡する
    const MOON_CYCLE_MS = 40 * 60 * 1000;
    const MOON_PHASE_OFFSET = 0.18; // 起動時は三日月あたりから始める

    // 開発・検証用の隠しフック: ?sky=aurora / shower / fireball / satellite で
    // そのイベントをすぐに発生、?moon=0〜1 で月相を固定できる(通常利用では無害)。
    const params = new URLSearchParams(window.location.search);
    const moonOverride = params.get('moon') !== null ? Number(params.get('moon')) : null;
    const skyParam = params.get('sky');
    if (skyParam === 'aurora' && !auroraRef.current) {
      auroraRef.current = spawnAurora();
    } else if (skyParam === 'shower') {
      showerRef.current = { remaining: 6, nextIn: 0 };
    } else if (skyParam === 'fireball') {
      shootingStarsRef.current.push(spawnShootingStar('fireball'));
    } else if (skyParam === 'satellite') {
      satellitesRef.current.push(spawnSatellite());
    }

    function drawStrokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    function frame(time: number) {
      const dt = lastTimeRef.current === 0 ? 16 : Math.min(64, time - lastTimeRef.current);
      lastTimeRef.current = time;

      // 天球ドーム(空+天の川+微光星+月)を、画面中心を軸にゆっくり回して転写。
      // またたく輝星も同じ回転空間に置くので、空と一緒に回る。
      const theta = ((time % ROTATION_PERIOD_MS) / ROTATION_PERIOD_MS) * Math.PI * 2;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(theta);
      ctx.translate(-domeSize / 2, -domeSize / 2);
      ctx.drawImage(skyDome, 0, 0, domeSize, domeSize);
      drawBrightStars(ctx, brightStarsRef.current, sprites, domeSize, domeSize, time);
      // 月: 位相(満ち欠け)つきスプライトを天球に載せて一緒に回す
      const moonPhase =
        moonOverride !== null && Number.isFinite(moonOverride)
          ? moonOverride
          : (time / MOON_CYCLE_MS + MOON_PHASE_OFFSET) % 1;
      const moonSprite = getMoonSprite(moonCacheRef.current, domeSize * 0.026, moonPhase);
      ctx.drawImage(
        moonSprite,
        domeSize * 0.60 - moonSprite.width / 2,
        domeSize * 0.27 - moonSprite.height / 2,
      );
      ctx.restore();

      // オーロラ(画面固定。星や月はオーロラの奥で回りつづける)
      if (auroraRef.current) {
        auroraRef.current.age += dt;
        if (auroraRef.current.age >= auroraRef.current.life) {
          auroraRef.current = null;
        } else {
          drawAurora(ctx, auroraRef.current, width, height, time);
        }
      }

      // ── 夜空イベントのスケジューラ ──
      // 数秒ごとに「ふつうの流れ星 / 火球 / 流星群 / 人工衛星 / オーロラ」の
      // どれかが起こる。眺めているだけでも、たまに珍しいものが見られる。
      nextEventInRef.current -= dt;
      if (nextEventInRef.current <= 0) {
        const roll = Math.random();
        if (roll < 0.52) {
          if (shootingStarsRef.current.length < 3) {
            shootingStarsRef.current.push(spawnShootingStar());
          }
          nextEventInRef.current = 3000 + Math.random() * 4500;
        } else if (roll < 0.64) {
          // 火球: 大きく明るい流れ星(すこし珍しい)
          shootingStarsRef.current.push(spawnShootingStar('fireball'));
          nextEventInRef.current = 6000 + Math.random() * 6000;
        } else if (roll < 0.76) {
          // 流星群: 数秒のあいだに立てつづけに流れる
          showerRef.current = { remaining: 4 + Math.floor(Math.random() * 4), nextIn: 0 };
          nextEventInRef.current = 16000 + Math.random() * 14000;
        } else if (roll < 0.9) {
          // 人工衛星: またたかず、すーっと等速で横切る
          if (satellitesRef.current.length < 1) {
            satellitesRef.current.push(spawnSatellite());
          }
          nextEventInRef.current = 8000 + Math.random() * 8000;
        } else {
          // オーロラ: いちばん珍しい。しばらく空が色づく
          if (!auroraRef.current) {
            auroraRef.current = spawnAurora();
          }
          nextEventInRef.current = 25000 + Math.random() * 20000;
        }
      }

      // 流星群の連続スポーン
      if (showerRef.current.remaining > 0) {
        showerRef.current.nextIn -= dt;
        if (showerRef.current.nextIn <= 0) {
          shootingStarsRef.current.push(spawnShootingStar());
          showerRef.current.remaining -= 1;
          showerRef.current.nextIn = 250 + Math.random() * 650;
        }
      }

      shootingStarsRef.current = updateShootingStars(shootingStarsRef.current, dt, minDim);
      drawShootingStars(ctx, shootingStarsRef.current, width, height);

      satellitesRef.current = updateSatellites(satellitesRef.current, dt, minDim);
      drawSatellites(ctx, satellitesRef.current, width, height);

      // 大気レイヤー(ビネット+大気光)は画面に固定。回る空の手前に重なる
      ctx.drawImage(atmosphere, 0, 0, width, height);

      // 地平線の山影(前景。流れ星は山のうしろに沈む)
      drawHorizon(ctx, horizonRef.current, width, height);

      // お手本ライン(結果表示時)
      const overlay = overlayRef.current;
      if (overlay && overlay.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 205, 90, 0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        drawStrokePath(ctx, overlay);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255, 225, 140, 0.95)';
        for (const p of overlay) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ユーザーがなぞっている光る線
      const stroke = strokeRef.current;
      if (stroke.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#7ee8ff';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#7ee8ff';
        ctx.shadowBlur = 14;
        drawStrokePath(ctx, stroke);
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(frame);
    }

    animationFrameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="sky-canvas"
      style={{ touchAction: 'none', pointerEvents: interactive ? 'auto' : 'none' }}
      onPointerDown={pointerHandlers.onPointerDown}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={pointerHandlers.onPointerUp}
      onPointerLeave={pointerHandlers.onPointerLeave}
    />
  );
}
