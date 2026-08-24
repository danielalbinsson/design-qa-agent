import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJsonArray } from "./json.ts";

describe("extractJsonArray", () => {
  it("parses a bare JSON array", () => {
    const out = extractJsonArray('[{"title":"a","region":"b"}]');
    assert.deepEqual(out, [{ title: "a", region: "b" }]);
  });

  it("parses a fenced JSON array", () => {
    const raw = '```json\n[{"title":"x","region":"y"}]\n```';
    assert.deepEqual(extractJsonArray(raw), [{ title: "x", region: "y" }]);
  });

  it("extracts the array from surrounding prose", () => {
    const raw = 'Here are findings:\n[{"title":"t","region":"r"}]\nThanks.';
    assert.deepEqual(extractJsonArray(raw), [{ title: "t", region: "r" }]);
  });

  it("handles nested brackets inside strings", () => {
    const raw = '[{"title":"see [docs]","region":"nav"}]';
    assert.deepEqual(extractJsonArray(raw), [
      { title: "see [docs]", region: "nav" },
    ]);
  });

  it("throws on garbage with no array", () => {
    assert.throws(() => extractJsonArray("not json at all"), /no JSON array/);
  });

  it("throws on empty input", () => {
    assert.throws(() => extractJsonArray("   "), /empty/);
  });
});
