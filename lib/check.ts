import { lookupAsn, reverseName, txtLookup, type AsnResult } from "./asn";
import { normalizeDomain, resolveZone, untilAborted, webHosts, type Resolver, type Zone } from "./dns";
import { analyzePhp, type PhpResult } from "./phpsig";
import type { Provider, Table } from "./provider";
import type { Lang } from "./lang";
import { addProvider, finalize, sortProviders, type HostInfo, type HttpInfo, type IpInfo, type Report } from "./report";
import { isPublicAddress } from "./safety";
import type { CertProbe, TlsInfo } from "./tls";

export interface PageResponse {
  status: number;
  headers: Headers;
  body: string;
}

export type Transport = (url: URL, headers: Record<string, string>, signal: AbortSignal) => Promise<PageResponse>;

export interface CheckOptions {
  table: Table;
  resolver: Resolver;
  version: string;
  lang: Lang;
  now?: () => Date;
  checkMs?: number;
}

export interface PageOptions {
  transport: Transport;
  userAgent: string;
  certs?: CertProbe;
  limits?: Partial<Limits>;
}

interface Limits {
  redirectsPerCandidate: number;
  requestsPerCheck: number;
  checkMs: number;
}

const defaultLimits: Limits = { redirectsPerCandidate: 5, requestsPerCheck: 8, checkMs: 15_000 };

export interface PageResult {
  http?: HttpInfo;
  php?: PhpResult;
  headers?: string[];
  tls?: TlsInfo;
}

const maxAddresses = 16;

export async function runCheck(domain: string, o: CheckOptions): Promise<Report> {
  const checkMs = o.checkMs ?? defaultLimits.checkMs;
  const deadline = AbortSignal.timeout(checkMs);
  const stopped = `stopped after ${checkMs / 1000} s`;
  const resolver = withDeadline(o.resolver, deadline, stopped);
  const r: Report = {
    tool: "OpenVMap",
    version: o.version,
    incident: o.table.incident,
    domain: normalizeDomain(domain),
    checked_at: rfc3339((o.now ?? (() => new Date()))()),
    ns: [],
    mx: [],
    hosts: [],
    providers: [],
    actions: [],
    message_template: "",
  };
  const warnings: string[] = [];

  const { zone, warnings: dnsWarnings } = await resolveZone(resolver, r.domain);
  warnings.push(...dnsWarnings);
  for (const h of zone.hosts) {
    if (h.ips.length <= maxAddresses) continue;
    warnings.push(`A/AAAA ${h.name}: ${h.ips.length} addresses, only the first ${maxAddresses} checked`);
    h.ips = h.ips.slice(0, maxAddresses);
  }

  for (const ns of zone.ns) {
    const p = o.table.byNs(ns);
    r.ns.push({ host: ns, provider_id: p?.id });
    addProvider(r, p, "ns", "NS " + ns);
  }
  for (const mx of zone.mx) {
    const p = o.table.byMx(mx);
    r.mx.push({ host: mx, provider_id: p?.id });
    addProvider(r, p, "mx", "MX " + mx);
  }

  const asns = await lookupAll(resolver, zone, o.table);
  const byName = new Set(r.ns.flatMap((n) => (n.provider_id ? [n.provider_id] : [])));
  for (const h of zone.hosts) {
    const hi: HostInfo = { name: h.name, cname: h.cname, ips: [] };
    if (h.cname) {
      const p = o.table.byCname(h.cname);
      hi.cname_provider_id = p?.id;
      addProvider(r, p, "cname", `${h.name} CNAME ${h.cname}`);
    }
    for (const ip of h.ips) {
      const info: IpInfo = { ip };
      const res = asns.get(ip);
      if (res === undefined) {
        info.error = "not a public address";
      } else if (res instanceof Error) {
        info.error = res.message;
        if (!warnings.includes(`ASN ${ip}: ${res.message}`)) warnings.push(`ASN ${ip}: ${res.message}`);
      } else {
        info.asn = res.asn;
        info.as_name = res.as_name;
        info.prefix = res.prefix;
        const prefer = hi.cname_provider_id ? new Set([...byName, hi.cname_provider_id]) : byName;
        if (res.ptr) info.ptr = res.ptr;
        const p: Provider | undefined = o.table.byAsn(res.asn, res.as_name, prefer, res.ptr);
        info.provider_id = p?.id;
        addProvider(r, p, "web", `${h.name} ${ip} AS${res.asn} ${res.as_name}${res.ptr ? ` PTR ${res.ptr}` : ""}`);
      }
      hi.ips.push(info);
    }
    r.hosts.push(hi);
  }
  sortProviders(r);

  if (warnings.length > 0) r.warnings = warnings;
  finalize(r, o.lang);
  return r;
}

function withDeadline(r: Resolver, signal: AbortSignal, message: string): Resolver {
  const until = <T>(p: () => Promise<T>) => (signal.aborted ? Promise.reject(new Error(message)) : untilAborted(p(), signal, message));
  return {
    resolve4: (h) => until(() => r.resolve4(h)),
    resolve6: (h) => until(() => r.resolve6(h)),
    resolveCname: (h) => until(() => r.resolveCname(h)),
    resolveNs: (h) => until(() => r.resolveNs(h)),
    resolveMx: (h) => until(() => r.resolveMx(h)),
    resolveTxt: (h) => until(() => r.resolveTxt(h)),
    resolvePtr: (n) => until(() => r.resolvePtr(n)),
  };
}

async function lookupAll(resolver: Resolver, zone: Zone, table: Table): Promise<Map<string, (AsnResult & { ptr?: string }) | Error>> {
  const ips = [...new Set(zone.hosts.flatMap((h) => h.ips))].filter(isPublicAddress);
  const asked = new Map<string, Promise<string[]>>();
  const lookup = txtLookup(resolver);
  const txt = (name: string) => {
    let p = asked.get(name);
    if (!p) asked.set(name, (p = lookup(name)));
    return p;
  };
  const results = await Promise.all(
    ips.map(async (ip): Promise<(AsnResult & { ptr?: string }) | Error> => {
      let res: AsnResult;
      try {
        res = await lookupAsn(txt, ip);
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
      if (!table.namedByPtr(res.asn)) return res;
      try {
        const [ptr] = await resolver.resolvePtr(reverseName(ip));
        return ptr ? { ...res, ptr } : res;
      } catch {
        return res;
      }
    }),
  );
  return new Map(ips.map((ip, i) => [ip, results[i]]));
}

export async function checkPage(domain: string, o: PageOptions): Promise<PageResult> {
  const limits = { ...defaultLimits, ...o.limits };
  const deadline = AbortSignal.timeout(limits.checkMs);
  const hosts = webHosts(normalizeDomain(domain));
  const page = await fetchPage(o, hosts, limits, deadline, `stopped after ${limits.checkMs / 1000} s`);
  if (!o.certs) return page;
  const final = page.http?.final_url ? new URL(page.http.final_url).hostname : "";
  const order = hosts.includes(final) ? [final, ...hosts.filter((h) => h !== final)] : hosts;
  let tls: TlsInfo = { host: order[0], error: "not tried" };
  for (const host of order) {
    if (deadline.aborted) break;
    try {
      return { ...page, tls: { host, chain: await o.certs(host, deadline) } };
    } catch (err) {
      if (host === order[0]) tls = { host, error: errText(err) };
    }
  }
  return { ...page, tls };
}

async function fetchPage(o: PageOptions, hosts: string[], limits: Limits, deadline: AbortSignal, stopped: string): Promise<PageResult> {
  const candidates = [...hosts.map((h) => `https://${h}/`), ...hosts.map((h) => `http://${h}/`)];
  const reqHeaders = {
    "User-Agent": o.userAgent,
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en;q=0.5",
  };
  let requests = 0;
  let last: HttpInfo | undefined;
  let lastAnswered: PageResult | undefined;

  candidates: for (const candidate of candidates) {
    const info: HttpInfo = { url: candidate };
    last = info;
    const poweredBy: string[] = [];
    const cookies: string[] = [];
    let url = new URL(candidate);
    for (let redirects = 0; ; redirects++) {
      if (deadline.aborted) {
        info.error = stopped;
        break candidates;
      }
      if (requests >= limits.requestsPerCheck) {
        info.error = `stopped after ${limits.requestsPerCheck} requests`;
        break candidates;
      }
      requests++;
      let res: PageResponse;
      try {
        res = await o.transport(url, reqHeaders, deadline);
      } catch (err) {
        info.error = deadline.aborted ? stopped : errText(err);
        continue candidates;
      }
      for (const v of res.headers.get("x-powered-by")?.split(", ") ?? []) {
        if (!poweredBy.includes(v)) poweredBy.push(v);
      }
      cookies.push(...res.headers.getSetCookie());

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (redirects >= limits.redirectsPerCandidate) {
          info.error = `stopped after ${limits.redirectsPerCandidate} redirects`;
          continue candidates;
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          info.error = `bad redirect location ${JSON.stringify(location)}`;
          continue candidates;
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          info.error = `redirect to ${next.protocol} refused`;
          continue candidates;
        }
        url = next;
        continue;
      }

      info.final_url = url.href;
      info.status = res.status;
      const server = res.headers.get("server");
      if (server) info.server = server;
      const headers = [...new Set([...res.headers.keys()].map((k) => k.toLowerCase()))].sort().slice(0, 256);
      const errorPageSaysNothingAboutOrigin = res.status >= 400;
      if (errorPageSaysNothingAboutOrigin) {
        lastAnswered = { http: info, headers };
        continue candidates;
      }
      const merged = new Headers();
      for (const [k, v] of res.headers) {
        if (k !== "set-cookie" && k !== "x-powered-by") merged.append(k, v);
      }
      for (const v of poweredBy) merged.append("x-powered-by", v);
      for (const c of cookies) merged.append("set-cookie", c);
      return { http: info, php: analyzePhp(merged, res.body, url), headers };
    }
  }
  return lastAnswered ?? { http: last };
}

function errText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error && cause.message ? `${err.message}: ${cause.message}` : err.message;
}

export function defaultUserAgent(version: string, about: string): string {
  return `OpenVMap/${version} (+${about})`;
}

export function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.(\d*?)0*Z$/, (_, frac: string) => (frac ? `.${frac}Z` : "Z"));
}
