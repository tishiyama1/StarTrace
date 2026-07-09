import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStats, recordDiscovery, registerVisit, submitFeedback } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('recordDiscovery / registerVisit', () => {
  it('POSTs JSON and returns true on ok', async () => {
    const spy = mockFetch(() => new Response('{}', { status: 200 }));
    const ok = await recordDiscovery('client-1', 'orion');
    expect(ok).toBe(true);
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain('/api/discovery');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ clientId: 'client-1', constellationId: 'orion' });
  });

  it('returns false when the request throws (offline)', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    expect(await registerVisit('c')).toBe(false);
  });

  it('returns false on non-ok status', async () => {
    mockFetch(() => new Response('{}', { status: 500 }));
    expect(await recordDiscovery('c', 'orion')).toBe(false);
  });
});

describe('submitFeedback', () => {
  it('sends message and category', async () => {
    const spy = mockFetch(() => new Response('{}', { status: 200 }));
    const ok = await submitFeedback('c', 'ドラゴン座がほしい', 'star');
    expect(ok).toBe(true);
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({
      clientId: 'c',
      message: 'ドラゴン座がほしい',
      category: 'star',
    });
  });
});

describe('fetchStats', () => {
  it('parses stats JSON', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            totalUsers: 3,
            totalDiscoveries: 10,
            uniqueDiscoveries: 7,
            constellations: { orion: 4 },
          }),
          { status: 200 },
        ),
    );
    const stats = await fetchStats();
    expect(stats.totalUsers).toBe(3);
    expect(stats.constellations.orion).toBe(4);
  });

  it('throws on non-ok', async () => {
    mockFetch(() => new Response('nope', { status: 503 }));
    await expect(fetchStats()).rejects.toThrow();
  });
});
