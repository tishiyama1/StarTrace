import { useEffect, useRef } from 'react';
import type { Point } from '../types';

interface BackgroundStar {
  x: number;
  y: number;
  radius: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhaseOffset: number;
}

function generateBackgroundStars(count: number): BackgroundStar[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 1.4 + 0.6,
    baseOpacity: Math.random() * 0.5 + 0.4,
    twinkleSpeed: Math.random() * 0.0015 + 0.0004,
    twinklePhaseOffset: Math.random() * Math.PI * 2,
  }));
}

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
  const starsRef = useRef<BackgroundStar[]>(generateBackgroundStars(150));
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

    function drawStrokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    function frame(time: number) {
      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#050818');
      gradient.addColorStop(1, '#151a42');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (const star of starsRef.current) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinklePhaseOffset);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${star.baseOpacity * twinkle})`;
        ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

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
