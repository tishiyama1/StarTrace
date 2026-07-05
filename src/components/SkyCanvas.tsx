import { useEffect, useRef } from 'react';
import type { Point } from '../types';
import {
  drawBackgroundStars,
  drawMilkyWayBand,
  drawMilkyWayStars,
  drawNebulae,
  drawShootingStars,
  generateBackgroundStars,
  generateMilkyWayStars,
  generateNebulae,
  spawnShootingStar,
  updateShootingStars,
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

  // 流れ星は動的に管理
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const nextSpawnRef = useRef<number>(1800);
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

      // 星雲 → 天の川 → 星の順で奥から手前へ描く
      drawNebulae(ctx, nebulaeRef.current, width, height, time);
      drawMilkyWayBand(ctx, width, height, MILKY_WAY_ANGLE);
      drawMilkyWayStars(ctx, milkyWayStarsRef.current, width, height);
      drawBackgroundStars(ctx, starsRef.current, width, height, time);

      // 流れ星のスポーンと更新
      nextSpawnRef.current -= dt;
      if (nextSpawnRef.current <= 0 && shootingStarsRef.current.length < 2) {
        shootingStarsRef.current.push(spawnShootingStar());
        nextSpawnRef.current = 3500 + Math.random() * 5000;
      }
      shootingStarsRef.current = updateShootingStars(shootingStarsRef.current, dt, minDim);
      drawShootingStars(ctx, shootingStarsRef.current, width, height);

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
