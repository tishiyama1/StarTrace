import { useEffect, useRef, useState } from 'react';
import { registerVisit } from '../lib/api';

const STORAGE_KEY = 'startrace.clientId.v1';
const VISITED_KEY = 'startrace.visited.v1';

function loadOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage unavailable: fall back to an ephemeral id for this session.
    return `ephemeral_${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Provides a stable, anonymous client id (random UUID kept in localStorage).
 * On first ever load it registers a "visit" so the dashboard can count how
 * many people have played. No personal data is involved.
 */
export function useClientId(): string {
  const [clientId] = useState(loadOrCreateClientId);
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    try {
      if (localStorage.getItem(VISITED_KEY)) return;
      localStorage.setItem(VISITED_KEY, '1');
    } catch {
      // ignore storage errors; still attempt to register once per session
    }
    void registerVisit(clientId);
  }, [clientId]);

  return clientId;
}
