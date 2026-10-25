import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl, tokenStore } from './client';

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => { vi.restoreAllMocks(); tokenStore.clear(); });

describe('api client', () => {
  it('drops empty query parameters', () => {
    expect(buildUrl('/farms', { q: '', farm_type: 'pig', taluk: undefined, offset: 0 })).toMatch(/\/farms\?farm_type=pig&offset=0$/);
  });

  it('sends the bearer token and parses JSON', async () => {
    tokenStore.set('abc');
    const spy = respond(200, { ok: true });
    await expect(api('/x')).resolves.toEqual({ ok: true });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('turns the backend error shape into ApiError with field errors', async () => {
    respond(422, { detail: 'Some fields are invalid.', code: 'validation_error', errors: [{ field: 'count', message: 'too small' }] });
    const err = (await api('/x', { method: 'POST', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual([{ field: 'count', message: 'too small' }]);
  });

  it('reports network failures without inventing data', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api('/dashboard/summary').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Cannot reach the server/);
  });

  it('handles 204 No Content', async () => {
    respond(204, undefined);
    await expect(api('/farms/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
