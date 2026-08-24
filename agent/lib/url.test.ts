import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPublicHttpUrl, isPrivateOrReservedIp } from "./url.ts";

describe("isPrivateOrReservedIp", () => {
  it("flags loopback and RFC1918", () => {
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);
    assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
  });

  it("allows public IPv4", () => {
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
  });

  it("flags IPv6 loopback and unique-local", () => {
    assert.equal(isPrivateOrReservedIp("::1"), true);
    assert.equal(isPrivateOrReservedIp("fc00::1"), true);
    assert.equal(isPrivateOrReservedIp("fe80::1"), true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects non-http schemes", async () => {
    await assert.rejects(
      () => assertPublicHttpUrl("file:///etc/passwd"),
      /Only http\(s\)/,
    );
    await assert.rejects(
      () => assertPublicHttpUrl("javascript:alert(1)"),
      /Only http\(s\)/,
    );
  });

  it("rejects localhost and .local hosts", async () => {
    await assert.rejects(
      () => assertPublicHttpUrl("http://localhost/"),
      /not allowed/,
    );
    await assert.rejects(
      () => assertPublicHttpUrl("http://app.local/"),
      /not allowed/,
    );
    await assert.rejects(
      () => assertPublicHttpUrl("http://metadata.google.internal/"),
      /not allowed/,
    );
  });

  it("rejects private literal IPs", async () => {
    await assert.rejects(
      () => assertPublicHttpUrl("http://127.0.0.1/"),
      /non-public/,
    );
    await assert.rejects(
      () => assertPublicHttpUrl("http://10.1.2.3/"),
      /non-public/,
    );
    await assert.rejects(
      () => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/"),
      /non-public/,
    );
  });

  it("allows a public https URL", async () => {
    const out = await assertPublicHttpUrl("https://example.com/path");
    assert.match(out, /^https:\/\/example\.com\/path/);
  });
});
