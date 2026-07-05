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

  const reset = useCallback(() => {
    strokeRef.current = [];
    setCurrentStroke([]);
    setIsDrawing(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = getRelativePoint(e);
    strokeRef.current = [point];
    setCurrentStroke([point]);
    setIsDrawing(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    setIsDrawing(false);
  }, [onStrokeEnd]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      finishStroke();
    },
    [finishStroke],
  );

  const onPointerLeave = useCallback(() => {
    if (isDrawing) {
      finishStroke();
    }
  }, [isDrawing, finishStroke]);

  return {
    isDrawing,
    currentStroke,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave },
    reset,
  };
}
