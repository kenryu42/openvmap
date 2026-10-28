import type { Table } from "../lib/provider";

export interface SourceDeps {
  token: string;
  allowed: ReadonlySet<string>;
  fetch: typeof fetch;
}

const maxBytes = 5 * 1024 * 1024;

export function citedUrls(t: Table): Set<string> {
  const urls = new Set<string>();
  for (const p of t.providers) {
    if (p.news) urls.add(p.news);
    for (const i of Object.values(p.incidents)) if (i.source) urls.add(i.source);
  }
  return urls;
}

export async function handleSource(request: Request, d: SourceDeps): Promise<Response> {
  if (!d.token) return new Response(null, { status: 404 });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!(await tokenMatchesInConstantTime(request.headers.get("authorization") ?? "", `Bearer ${d.token}`))) return new Response(null, { status: 401 });
  let url: unknown;
  try {
    const body: { url?: unknown } = await request.json();
    url = body.url;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof url !== "string" || !d.allowed.has(url)) return new Response(null, { status: 403 });

  const res = await d.fetch(url, {
    headers: { "User-Agent": request.headers.get("user-agent") ?? "OpenVMap source watch" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.arrayBuffer();
  if (body.byteLength > maxBytes) return new Response(null, { status: 502 });
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "no-store" },
  });
}

async function tokenMatchesInConstantTime(presented: string, expected: string): Promise<boolean> {
  const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([sha256(presented), sha256(expected)]);
  let differingBits = 0;
  for (let i = 0; i < x.length; i++) differingBits |= x[i] ^ y[i];
  return differingBits === 0;
}
