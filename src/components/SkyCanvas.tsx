import { useEffect, useRef } from 'react';
import type { Point } from '../types';
import {
  drawAurora,
  drawBackgroundStars,
  drawMilkyWayBand,
  drawMilkyWayStars,
  drawNebulae,
  drawSatellites,
  drawShootingStars,
  generateBackgroundStars,
  generateMilkyWayStars,
  generateNebulae,
  spawnAurora,
  spawnSatellite,
  spawnShootingStar,
  updateSatellites,
  updateShootingStars,
  type Aurora,
  type Satellite,
  type ShootingStar,
} from '../lib/skyEffects';

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

/** 天の川の帯の傾き(ラジアン) */
const MILKY_WAY_ANGLE = Math.PI * 0.14;

export function SkyCanvas({
  width,
  height,
  currentStroke,
  overlayPoints,
  interactive,
  pointerHandlers,
}: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 静的に生成する天体は初回だけ作る(座標は 0〜1 正規化なのでリサイズ非依存)
  const starsRef = useRef(generateBackgroundStars(170));
  const milkyWayStarsRef = useRef(generateMilkyWayStars(230, MILKY_WAY_ANGLE));
  const nebulaeRef = useRef(generateNebulae());

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

    // 開発・検証用の隠しフック: ?sky=aurora / shower / fireball / satellite で
    // そのイベントをすぐに発生させる(通常利用では無害)。
    const skyParam = new URLSearchParams(window.location.search).get('sky');
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

      // 背景のグラデーション
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#04040f');
      gradient.addColorStop(0.55, '#0b0f2b');
      gradient.addColorStop(1, '#161436');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // 星雲 → オーロラ → 天の川 → 星の順で奥から手前へ描く
      drawNebulae(ctx, nebulaeRef.current, width, height, time);
      if (auroraRef.current) {
        auroraRef.current.age += dt;
        if (auroraRef.current.age >= auroraRef.current.life) {
          auroraRef.current = null;
        } else {
          drawAurora(ctx, auroraRef.current, width, height, time);
        }
      }
      drawMilkyWayBand(ctx, width, height, MILKY_WAY_ANGLE);
      drawMilkyWayStars(ctx, milkyWayStarsRef.current, width, height);
      drawBackgroundStars(ctx, starsRef.current, width, height, time);

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
