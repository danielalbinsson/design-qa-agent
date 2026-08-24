/**
 * Shared Browserless HTTP helpers for subagent tools.
 *
 * Browserless `/function` returns `{ data: T, type: "application/json" }` when
 * the runner code returns that envelope. Tools must unwrap `.data` (or accept a
 * bare payload if Browserless ever flattens it).
 *
 * Concurrent fan-out from the three specialists can hit 429; retry with backoff.
 * Auth uses the Authorization header (not `?token=`) so the secret stays out of
 * URLs and proxy/access logs.
 */

import { requireEnv } from "./env";
import { unwrapBrowserlessData } from "./browserless-unwrap";

export { unwrapBrowserlessData } from "./browserless-unwrap";

export const BROWSERLESS_BASE =
  process.env.BROWSERLESS_URL ?? "https://production-sfo.browserless.io";

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv("BROWSERLESS_TOKEN")}`,
    ...extra,
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryAfterMs: number | undefined;
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;

      const body = await res.text();
      lastErr = `${res.status} ${body.slice(0, 400)}`;

      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
        throw new Error(`Browserless ${label} failed: ${lastErr}`);
      }

      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        retryAfterMs = retryAfter * 1000;
      }
    } catch (err) {
      // Network / DNS / abort errors — retry unless this was a final HTTP throw.
      if (err instanceof Error && err.message.startsWith(`Browserless ${label} failed:`)) {
        throw err;
      }
      lastErr = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Browserless ${label} failed: ${lastErr}`);
      }
    }

    const delayMs =
      retryAfterMs ??
      BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
    await sleep(delayMs);
  }
  throw new Error(`Browserless ${label} failed: ${lastErr}`);
}

/** POST JavaScript to `/function`; returns unwrapped `data` payload. */
export async function browserlessFunction<T extends Record<string, unknown>>(
  code: string,
): Promise<T> {
  const res = await fetchWithRetry(
    `${BROWSERLESS_BASE}/function`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/javascript" }),
      body: code,
    },
    "/function",
  );
  return unwrapBrowserlessData<T>(await res.json());
}

/** POST JSON to `/screenshot`; returns raw image bytes. */
export async function browserlessScreenshot(
  body: Record<string, unknown>,
): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(
    `${BROWSERLESS_BASE}/screenshot`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    "/screenshot",
  );
  return res.arrayBuffer();
}
