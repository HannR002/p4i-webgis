import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readJsonBody, apiErrorResponse, JSON_BODY_DEADLINE_MS, JSON_BODY_MAX_BYTES } from '../lib/server/http';
import { readGisBody, gisError } from '../lib/server/gis/http';
import { POST as copilotPost } from '../app/api/gis/copilot/route';
import { requestBudgets } from '../lib/server/requestBudget';

const encode = (text: string) => new TextEncoder().encode(text);
function request(body: ReadableStream<Uint8Array> | string | null, signal?: AbortSignal) {
  return new Request('http://localhost/api/gis/copilot', {
    method: 'POST', body, signal, duplex: 'half',
  } as RequestInit);
}
function controlled(cancel: () => void | Promise<void> = vi.fn()) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel });
  return { body, controller, cancel };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe.each([
  { name: 'HTTP', read: readJsonBody, errorResponse: (e: unknown) => apiErrorResponse(e, 'JSON test') },
  { name: 'GIS', read: readGisBody, errorResponse: gisError },
])('$name bounded ingestion', ({ read, errorResponse }) => {
  it('accepts valid JSON and releases its reader/timer/listener', async () => {
    const c = controlled(), r = request(c.body);
    const remove = vi.spyOn(r.signal, 'removeEventListener');
    c.controller.enqueue(encode('{"ok":true}')); c.controller.close();
    await expect(read(r)).resolves.toEqual({ ok: true });
    expect(c.body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(c.cancel).not.toHaveBeenCalled();
  });
  it.each([null, '', '{', 'null trailing'])('rejects empty/invalid input %j', async (body) => {
    const input = request(body);
    const error = await read(input).catch((e: unknown) => e);
    expect(input.body?.locked ?? false).toBe(false);
    expect(error).toBeInstanceOf(Error); expect(errorResponse(error).status).toBe(400);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('decodes split UTF8 across multiple chunks', async () => {
    const c = controlled();
    for (const byte of encode('{"nama":"Peta 🌏"}')) c.controller.enqueue(new Uint8Array([byte]));
    c.controller.close(); await expect(read(request(c.body))).resolves.toEqual({ nama: 'Peta 🌏' });
    expect(c.body.locked).toBe(false);
  });
  it.each([JSON_BODY_MAX_BYTES - 1, JSON_BODY_MAX_BYTES])('accepts a %i-byte boundary payload', async (size) => {
    const data = '"' + 'x'.repeat(size - 2) + '"';
    await expect(read(request(data))).resolves.toHaveLength(size - 2);
  });
  it('counts bytes, ignores false Content-Length, cancels oversize and unlocks', async () => {
    const c = controlled(), r = request(c.body); r.headers.set('Content-Length', '2');
    c.controller.enqueue(encode('"' + 'é'.repeat(JSON_BODY_MAX_BYTES / 2) + '"'));
    const error = await read(r).catch((e: unknown) => e);
    expect(errorResponse(error).status).toBe(400);
    expect(c.cancel).toHaveBeenCalledOnce(); expect(c.body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects cumulative oversize across individually small chunks', async () => {
    const c = controlled();
    c.controller.enqueue(encode('"' + 'x'.repeat(JSON_BODY_MAX_BYTES / 2)));
    c.controller.enqueue(encode('x'.repeat(JSON_BODY_MAX_BYTES / 2) + '"'));
    const error = await read(request(c.body)).catch((e: unknown) => e);
    expect(errorResponse(error).status).toBe(400); expect(c.body.locked).toBe(false);
    expect(c.cancel).toHaveBeenCalledOnce();
  });
  it('enforces a total deadline on a stalled read, including after progress', async () => {
    const c = controlled(); c.controller.enqueue(encode('{'));
    const result = read(request(c.body)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(JSON_BODY_DEADLINE_MS / 2);
    c.controller.enqueue(encode('"ok":'));
    await vi.advanceTimersByTimeAsync(JSON_BODY_DEADLINE_MS / 2);
    const error = await result;
    expect(errorResponse(error).status).toBe(408);
    expect(c.cancel).toHaveBeenCalledOnce(); expect(c.body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['before', 'during'])('respects client cancellation %s reading', async (when) => {
    const c = controlled(), abort = new AbortController();
    if (when === 'before') abort.abort(new Error('private abort detail'));
    const result = read(request(c.body, abort.signal)).catch((e: unknown) => e);
    if (when === 'during') abort.abort(new Error('private abort detail'));
    const error = await result, response = errorResponse(error);
    expect(response.status).toBe(400); expect(await response.text()).not.toContain('private');
    expect(c.cancel).toHaveBeenCalledOnce(); expect(c.body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['reject', 'never', 'throw'])('does not await or leak a %s cancellation hook', async (mode) => {
    const c = controlled(() => {
      if (mode === 'throw') throw new Error('private cancel detail');
      if (mode === 'reject') return Promise.reject(new Error('private cancel detail'));
      return new Promise<void>(() => {});
    });
    const result = read(request(c.body)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(JSON_BODY_DEADLINE_MS);
    expect(errorResponse(await result).status).toBe(408);
    expect(c.body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync(); // A late cleanup rejection must not become unhandled.
  });
  it('does not wait on failed cleanup after oversize rejection', async () => {
    const c = controlled(() => new Promise<void>(() => {}));
    c.controller.enqueue(new Uint8Array(JSON_BODY_MAX_BYTES + 1));
    const error = await read(request(c.body)).catch((e: unknown) => e);
    expect(errorResponse(error).status).toBe(400);
    expect(c.body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('sanitizes a stream failure and releases resources', async () => {
    const c = controlled(); c.controller.error(new Error('private upstream stack/credential'));
    const error = await read(request(c.body)).catch((e: unknown) => e);
    const response = errorResponse(error); expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('private'); expect(c.body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('checks monotonic deadline even if ready chunks prevent timer dispatch', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(JSON_BODY_DEADLINE_MS);
    const c = controlled(); c.controller.enqueue(encode('{}'));
    const error = await read(request(c.body)).catch((e: unknown) => e);
    expect(errorResponse(error).status).toBe(408); expect(c.body.locked).toBe(false);
  });
});

it('Copilot timeout releases all four real request-budget slots', async () => {
  const requests = Array.from({ length: 4 }, () => controlled());
  const responses = requests.map((c) => copilotPost(request(c.body)));
  const refused = await copilotPost(request('{}')); expect(refused.status).toBe(429);
  await vi.advanceTimersByTimeAsync(JSON_BODY_DEADLINE_MS);
  expect((await Promise.all(responses)).map((r) => r.status)).toEqual([408, 408, 408, 408]);
  const releases: Array<() => void> = [];
  try { for (let i = 0; i < 4; i++) releases.push(requestBudgets.copilot.acquire()); }
  finally { for (const release of releases) release(); }
  expect(requests.every((c) => !c.body.locked)).toBe(true);
});
