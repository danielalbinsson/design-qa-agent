import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  // Unique-local fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // Link-local fe80::/10
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/** True if the address is loopback, private, link-local, or otherwise non-public. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

function assertHostnameAllowed(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`URL host is not allowed: ${hostname}`);
  }
  if (host.endsWith(".local") || host.endsWith(".localhost")) {
    throw new Error(`URL host is not allowed: ${hostname}`);
  }
  const version = isIP(host);
  if (version !== 0 && isPrivateOrReservedIp(host)) {
    throw new Error(`URL resolves to a non-public address: ${hostname}`);
  }
}

/**
 * Reject non-http(s) schemes, localhost/metadata hosts, and private IPs.
 * Resolves DNS and re-checks so CNAME-to-private cannot bypass the guard.
 */
export async function assertPublicHttpUrl(raw: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http(s) URLs are allowed (got ${parsed.protocol})`);
  }

  if (!parsed.hostname) {
    throw new Error(`URL is missing a hostname: ${raw}`);
  }

  assertHostnameAllowed(parsed.hostname);

  // Literal IPs are already checked; still resolve hostnames to catch private CNAMEs.
  if (isIP(parsed.hostname) === 0) {
    let address: string;
    try {
      const result = await lookup(parsed.hostname, { all: false });
      address = result.address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`URL hostname could not be resolved: ${parsed.hostname} (${msg})`);
    }
    if (isPrivateOrReservedIp(address)) {
      throw new Error(
        `URL resolves to a non-public address: ${parsed.hostname} → ${address}`,
      );
    }
  }

  return parsed.toString();
}
