/**
 * Shared Browserless HTTP helpers for subagent tools.
 *
 * Browserless `/function` returns `{ data: T, type: "application/json" }` when
 * the runner code returns that envelope. Tools must unwrap `.data` (or accept a
 * bare payload if Browserless ever flattens it).
 *
 * Concurrent fan-out from the three specialists can hit 429; retry with backoff.
 */

export const BROWSERLESS_BASE =
  process.env.BROWSERLESS_URL ?? "https://production-sfo.browserless.io";

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Unwrap `{ data, type }` envelopes; pass through already-flat payloads. */
export function unwrapBrowserlessData<T extends Record<string, unknown>>(
  raw: unknown,
): T {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Browserless returned non-object JSON: ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  if ("data" in obj && obj.data && typeof obj.data === "object") {
    return obj.data as T;
  }
  return obj as T;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    const body = await res.text();
    lastErr = `${res.status} ${body.slice(0, 400)}`;

    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Browserless ${label} failed: ${lastErr}`);
    }

    // Exponential backoff + jitter; honor Retry-After seconds when present.
    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
    await sleep(delayMs);
  }
  throw new Error(`Browserless ${label} failed: ${lastErr}`);
}

/** POST JavaScript to `/function`; returns unwrapped `data` payload. */
export async function browserlessFunction<T extends Record<string, unknown>>(
  code: string,
): Promise<T> {
  const res = await fetchWithRetry(
    `${BROWSERLESS_BASE}/function?token=${process.env.BROWSERLESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/javascript" },
      body: code,
    },
    "/function",
  );
  return unwrapBrowserlessData<T>(await res.json());
}

/** POST JSON to `/screenshot`; returns raw PNG bytes. */
export async function browserlessScreenshot(
  body: Record<string, unknown>,
): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(
    `${BROWSERLESS_BASE}/screenshot?token=${process.env.BROWSERLESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "/screenshot",
  );
  return res.arrayBuffer();
}
