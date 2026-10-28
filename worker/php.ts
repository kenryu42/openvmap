import { checkPage, type PageResult, type Transport } from "../lib/check";
import { parseDomain } from "../lib/dns";
import type { CertProbe } from "../lib/tls";

export interface PhpDeps {
  transport: Transport;
  certs?: CertProbe;
  userAgent: string;
  salt: string;
  limiter: { limit(o: { key: string }): Promise<{ success: boolean }> };
  cache: { match(key: Request): Promise<Response | undefined>; put(key: Request, res: Response): Promise<void> };
  now?: () => number;
}

interface PhpAnswer extends PageResult {
  age_s: number;
}

const cacheSeconds = 3600;
const maxBodyBytes = 2048;

export async function handlePhp(request: Request, d: PhpDeps): Promise<Response> {
  const now = d.now ?? Date.now;
  if (request.method !== "POST") return json({ error: "method" }, 405, { Allow: "POST" });
  // A cross-site form can send text/plain without a preflight; requiring
  // JSON means another site's page cannot make a visitor's browser call us.
  if (mediaType(request.headers.get("content-type")) !== "application/json") return json({ error: "content-type" }, 415);
  if (!fromOwnPage(request)) return json({ error: "origin" }, 403);
  const text = await request.text();
  if (text.length > maxBodyBytes) return json({ error: "invalid" }, 400);
  let domainInBody: unknown;
  try {
    domainInBody = (JSON.parse(text) as { domain?: unknown }).domain;
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const domain = typeof domainInBody === "string" ? parseDomain(domainInBody) : null;
  if (!domain) return json({ error: "invalid" }, 400);

  const client = request.headers.get("cf-connecting-ip") ?? "";
  if (!(await d.limiter.limit({ key: await hash(d.salt, "client", client) })).success) {
    return json({ error: "limited" }, 429, { "Retry-After": "60" });
  }

  const key = new Request(new URL(`/api/php-cache/${await hash(d.salt, "domain", domain)}`, request.url));
  const hit = await d.cache.match(key);
  if (hit) {
    const at = Number(hit.headers.get("x-checked-at"));
    const page = (await hit.json()) as PageResult;
    return json({ ...page, age_s: Math.max(0, Math.floor((now() - at) / 1000)) } satisfies PhpAnswer);
  }

  const page = await checkPage(domain, { transport: d.transport, userAgent: d.userAgent, certs: d.certs });
  await d.cache.put(
    key,
    new Response(JSON.stringify(page), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${cacheSeconds}`, "x-checked-at": String(now()) },
    }),
  );
  return json({ ...page, age_s: 0 } satisfies PhpAnswer);
}

function mediaType(contentType: string | null): string {
  const withoutParameters = (contentType ?? "").split(";")[0];
  return withoutParameters.trim().toLowerCase();
}

function fromOwnPage(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const pageHost = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  return host === pageHost;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

async function hash(salt: string, kind: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}\n${kind}\n${value}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
