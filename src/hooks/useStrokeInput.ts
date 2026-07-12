import { useCallback, useRef, useState } from 'react';
import type { Point } from '../types';

interface UseStrokeInputOptions {
  onStrokeEnd: (stroke: Point[]) => void;
}

interface UseStrokeInputResult {
  isDrawing: boolean;
  currentStroke: Point[];
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerLeave: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  };
  reset: () => void;
}

function getRelativePoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Pointer Events (マウス/タッチ/ペン共通) から1本のストロークを収集するフック */
export function useStrokeInput({ onStrokeEnd }: UseStrokeInputOptions): UseStrokeInputResult {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const strokeRef = useRef<Point[]>([]);
  // 現在ストロークを描いている指(pointerId)。他の指のイベントはこれと一致するまで無視する。
  const activePointerIdRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    strokeRef.current = [];
    activePointerIdRef.current = null;
    setCurrentStroke([]);
    setIsDrawing(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    const point = getRelativePoint(e);
    strokeRef.current = [point];
    setCurrentStroke([point]);
    setIsDrawing(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      if (!strokeRef.current.length) return;
      const point = getRelativePoint(e);
      strokeRef.current = [...strokeRef.current, point];
      setCurrentStroke(strokeRef.current);
    },
    [],
  );

  const finishStroke = useCallback(() => {
    if (strokeRef.current.length > 0) {
      onStrokeEnd(strokeRef.current);
    }
    activePointerIdRef.current = null;
    setIsDrawing(false);
  }, [onStrokeEnd]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      finishStroke();
    },
    [finishStroke],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointerIdRef.current) return;
      if (isDrawing) {
        finishStroke();
      }
    },
    [isDrawing, finishStroke],
  );

  return {
    isDrawing,
    currentStroke,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave },
    reset,
  };
}
