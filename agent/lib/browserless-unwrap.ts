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
