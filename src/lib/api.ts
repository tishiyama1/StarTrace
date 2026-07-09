// Thin client for the StarTrace backend API.
//
// In production the app is served from CloudFront and the API lives at the
// same origin under /api/*, so the default base URL is empty. For local dev
// you can point at a deployed API by setting VITE_API_BASE in a .env file.

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface GlobalStats {
  totalUsers: number;
  totalDiscoveries: number;
  /** Sum across all users of each user's count of distinct constellations found (0-22 per user). */
  uniqueDiscoveries: number;
  /** constellationId -> global find count */
  constellations: Record<string, number>;
}

export type FeedbackCategory = 'star' | 'visual' | 'bug' | 'other';

async function postJson(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Register an anonymous searcher (best-effort, fire-and-forget). */
export function registerVisit(clientId: string): Promise<boolean> {
  return postJson('/api/visit', { clientId });
}

/** Record a global discovery (best-effort, fire-and-forget). */
export function recordDiscovery(clientId: string, constellationId: string): Promise<boolean> {
  return postJson('/api/discovery', { clientId, constellationId });
}

/** Submit a feedback message. Returns whether it was accepted. */
export function submitFeedback(
  clientId: string,
  message: string,
  category: FeedbackCategory,
): Promise<boolean> {
  return postJson('/api/feedback', { clientId, message, category });
}

/** Fetch aggregate stats for the dashboard. Throws on failure. */
export async function fetchStats(): Promise<GlobalStats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) {
    throw new Error(`stats request failed: ${res.status}`);
  }
  return (await res.json()) as GlobalStats;
}
