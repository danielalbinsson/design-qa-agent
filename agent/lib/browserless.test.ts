import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unwrapBrowserlessData } from "./browserless-unwrap.ts";

describe("unwrapBrowserlessData", () => {
  it("unwraps { data, type } envelopes", () => {
    const out = unwrapBrowserlessData<{ title: string }>({
      data: { title: "Hello" },
      type: "application/json",
    });
    assert.deepEqual(out, { title: "Hello" });
  });

  it("passes through already-flat payloads", () => {
    const out = unwrapBrowserlessData<{ url: string }>({
      url: "https://example.com",
      title: "Ex",
    });
    assert.equal(out.url, "https://example.com");
  });

  it("rejects non-objects", () => {
    assert.throws(() => unwrapBrowserlessData(null), /non-object/);
    assert.throws(() => unwrapBrowserlessData("oops"), /non-object/);
  });
});
