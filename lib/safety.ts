import type { PageResponse, Transport } from "./check";
import { untilAborted, type Resolver } from "./dns";
import { ipBytes, isIP, unmapV4 } from "./ip";

const blocked4: [number[], number][] = [
  [[0], 8],
  [[10], 8],
  [[100, 64], 10],
  [[127], 8],
  [[169, 254], 16],
  [[172, 16], 12],
  [[192, 0, 0], 24],
  [[192, 0, 2], 24],
  [[192, 88, 99], 24],
  [[192, 168], 16],
  [[198, 18], 15],
  [[198, 51, 100], 24],
  [[203, 0, 113], 24],
  [[224], 4],
  [[240], 4],
];

const blocked6: Record<string, [number[], number]> = {
  "unspecified, loopback, IPv4-compatible and other reserved": [[0x00], 8],
  "discard-only": [[0x01, 0x00, 0, 0, 0, 0, 0, 0], 64],
  Teredo: [[0x20, 0x01, 0x00, 0x00], 32],
  ORCHID: [[0x20, 0x01, 0x00, 0x10], 28],
  ORCHIDv2: [[0x20, 0x01, 0x00, 0x20], 28],
  "documentation 2001:db8::/32": [[0x20, 0x01, 0x0d, 0xb8], 32],
  "6to4": [[0x20, 0x02], 16],
  "documentation 3fff::/20": [[0x3f, 0xff, 0x00], 20],
  "SRv6 SIDs": [[0x5f, 0x00], 16],
  "unique local": [[0xfc], 7],
  "link-local": [[0xfe, 0x80], 10],
  "site-local (deprecated)": [[0xfe, 0xc0], 10],
  multicast: [[0xff], 8],
};

export function isPublicAddress(ip: string): boolean {
  const parsed = ipBytes(ip);
  if (!parsed) return false;
  let b = unmapV4(parsed);
  if (b.length === 16 && b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (b.slice(4, 12).some((x) => x !== 0)) return false;
    b = b.slice(12);
  }
  const table = b.length === 4 ? blocked4 : Object.values(blocked6);
  return !table.some(([prefix, len]) => matches(b, prefix, len));
}

// Cloudflare's published ranges (https://www.cloudflare.com/ips-v4 and
// ips-v6, read 2026-10-25). Workers cannot open sockets to them, so a page
// behind Cloudflare's proxy is requested with fetch() instead.
const cloudflare = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
].map((cidr): [Uint8Array, number] => {
  const [ip, len] = cidr.split("/");
  return [ipBytes(ip)!, Number(len)];
});

export function isCloudflareAddress(ip: string): boolean {
  const parsed = ipBytes(ip);
  if (!parsed) return false;
  const b = unmapV4(parsed);
  return cloudflare.some(([prefix, len]) => prefix.length === b.length && matches(b, [...prefix], len));
}

function matches(b: Uint8Array, prefix: number[], len: number): boolean {
  for (let bit = 0; bit < len; bit++) {
    const i = bit >> 3;
    const mask = 0x80 >> (bit & 7);
    if ((b[i] & mask) !== ((prefix[i] ?? 0) & mask)) return false;
  }
  return true;
}

export interface SafeTransportOptions {
  resolver: Pick<Resolver, "resolve4" | "resolve6">;
  isAllowed?: (ip: string) => boolean;
  ports?: number[];
  timeoutMs?: number;
  maxBody?: number;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  pinned?: PinnedRequest;
}

export type PinnedRequest = (ip: string, url: URL, headers: Record<string, string>, signal: AbortSignal, maxBody: number) => Promise<PageResponse>;

export function safeTransport(o: SafeTransportOptions): Transport {
  const isAllowed = o.isAllowed ?? isPublicAddress;
  const ports = o.ports ?? [80, 443];
  const timeoutMs = o.timeoutMs ?? 8_000;
  const maxBody = o.maxBody ?? 512 * 1024;
  const get = o.fetch ?? ((input, init) => fetch(input, init));

  return async (url, headers, signal) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${url.protocol} refused`);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (!ports.includes(port)) throw new Error(`port ${port} refused`);
    if (url.username || url.password) throw new Error("credentials in URL refused");
    const host = url.hostname.replace(/^\[|\]$/g, "");

    const timeout = AbortSignal.timeout(timeoutMs);
    const timedOut = `timeout after ${timeoutMs / 1000} s`;
    const both = AbortSignal.any([signal, timeout]);
    const addresses = await untilAborted(publicAddresses(host, o.resolver, isAllowed), both, timedOut);
    const direct = addresses.filter((a) => !isCloudflareAddress(a));
    const plainHttpCannotBePinned = o.pinned !== undefined && direct.length === 0 && url.protocol === "http:";
    if (plainHttpCannotBePinned) throw new Error(`${host}: plain http to a host only on Cloudflare's proxy refused`);
    if (o.pinned && direct.length > 0) {
      const ip = direct.find((a) => !a.includes(":")) ?? direct[0];
      try {
        return await o.pinned(ip, url, headers, both, maxBody);
      } catch (err) {
        if (timeout.aborted) throw new Error(timedOut);
        throw err;
      }
    }

    try {
      const res = await get(url.href, { method: "GET", headers, redirect: "manual", signal: both });
      return { status: res.status, headers: res.headers, body: await readCapped(res, maxBody) };
    } catch (err) {
      if (timeout.aborted) throw new Error(timedOut);
      throw err;
    }
  };
}

export async function publicAddresses(
  host: string,
  resolver: Pick<Resolver, "resolve4" | "resolve6">,
  isAllowed: (ip: string) => boolean = isPublicAddress,
): Promise<string[]> {
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const [v4, v6] = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
    addresses = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
    if (addresses.length === 0) throw new Error(`${host}: no such host`);
  }
  if (!addresses.some(isAllowed)) throw new Error(`${host}: no public address`);
  const refused = addresses.find((a) => !isAllowed(a));
  if (refused) throw new Error(`${host}: ${refused} is not a public address`);
  return addresses;
}

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } catch (err) {
    if (chunks.length === 0) throw err;
  } finally {
    reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(bytes.subarray(0, max));
}
