import { useCallback, useRef, useState } from 'react';

const STORAGE_KEY = 'startrace.discoveries.v1';

function loadFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    }
  } catch {
    // localStorage が使えない/壊れている場合は空の図鑑から始める
  }
  return new Set();
}

function saveToStorage(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // 保存に失敗しても致命的ではないので無視する(プライベートモード等)
  }
}

export interface UseDiscoveriesResult {
  /** 発見済みの星座ID集合 */
  discovered: Set<string>;
  /** 発見数 */
  count: number;
  /** 指定IDが発見済みか */
  has: (id: string) => boolean;
  /**
   * 星座を発見済みとして登録する。
   * @returns 今回はじめて発見した場合は true、すでに発見済みなら false
   */
  add: (id: string) => boolean;
  /** 図鑑をすべてリセットする */
  reset: () => void;
}

/** 発見済み星座を localStorage で永続管理するフック。 */
export function useDiscoveries(): UseDiscoveriesResult {
  const [discovered, setDiscovered] = useState<Set<string>>(loadFromStorage);
  // add() で最新状態を同期的に判定するためのミラー
  const ref = useRef(discovered);
  ref.current = discovered;

  const has = useCallback((id: string) => ref.current.has(id), []);

  const add = useCallback((id: string): boolean => {
    if (ref.current.has(id)) {
      return false;
    }
    const next = new Set(ref.current);
    next.add(id);
    ref.current = next;
    saveToStorage(next);
    setDiscovered(next);
    return true;
  }, []);

  const reset = useCallback(() => {
    const empty = new Set<string>();
    ref.current = empty;
    saveToStorage(empty);
    setDiscovered(empty);
  }, []);

  return { discovered, count: discovered.size, has, add, reset };
}
