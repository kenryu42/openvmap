import { isIP } from "./ip";

export interface Resolver {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  resolveCname(host: string): Promise<string[]>;
  resolveNs(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolveTxt(host: string): Promise<string[][]>;
  resolvePtr(name: string): Promise<string[]>;
}

export function untilAborted<T>(p: Promise<T>, signal: AbortSignal, message: string): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error(message));
  return new Promise((resolve, reject) => {
    const stop = () => reject(new Error(message));
    signal.addEventListener("abort", stop, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

interface Host {
  name: string;
  cname?: string;
  ips: string[];
}

export interface Zone {
  domain: string;
  ns: string[];
  mx: string[];
  hosts: Host[];
}

export async function resolveZone(r: Resolver, domain: string, hosts: string[] = []): Promise<{ zone: Zone; warnings: string[] }> {
  domain = normalizeDomain(domain);
  let zoneName = domain;
  if (domain.startsWith("www.") && domain.slice(4).includes(".")) zoneName = domain.slice(4);
  if (hosts.length === 0) hosts = webHosts(domain);

  const [ns, mx, hostResults] = await Promise.all([
    settle(r.resolveNs(zoneName)),
    settle(r.resolveMx(zoneName)),
    Promise.all(hosts.map((h) => resolveHost(r, normalizeDomain(h)))),
  ]);

  const zone: Zone = { domain, ns: [], mx: [], hosts: [] };
  const warnings: string[] = [];
  if (ns.ok) {
    zone.ns = ns.value.map(normalizeDomain).sort();
  } else {
    warnings.push(`NS ${zoneName}: ${describe(ns.error)}`);
  }
  if (mx.ok) {
    zone.mx = [...mx.value]
      .map((m) => ({ host: normalizeDomain(m.exchange), pref: m.priority }))
      .sort((a, b) => a.pref - b.pref || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
      .map((m) => m.host)
      .filter((h) => h !== "");
  } else {
    warnings.push(`MX ${zoneName}: ${describe(mx.error)}`);
  }
  for (const h of hostResults) {
    if ("warning" in h) warnings.push(h.warning);
    else zone.hosts.push(h);
  }
  return { zone, warnings };
}

export function webHosts(domain: string): string[] {
  return domain.startsWith("www.") && domain.slice(4).includes(".") ? [domain] : [domain, "www." + domain];
}

async function resolveHost(r: Resolver, name: string): Promise<Host | { warning: string }> {
  const [cname, v4, v6] = await Promise.all([followCname(r, name), settle(r.resolve4(name)), settle(r.resolve6(name))]);
  const ips = [...(v4.ok ? v4.value : []), ...(v6.ok ? v6.value : [])];
  if (ips.length === 0) {
    const err = v4.ok ? (v6.ok ? undefined : v6.error) : v4.error;
    return { warning: `A/AAAA ${name}: ${describe(err)}` };
  }
  const host: Host = { name, ips };
  if (cname && cname !== name) host.cname = cname;
  return host;
}

async function followCname(r: Resolver, name: string): Promise<string> {
  let cur = name;
  for (let i = 0; i < 8; i++) {
    const res = await settle(r.resolveCname(cur));
    if (!res.ok || res.value.length === 0) break;
    const next = normalizeDomain(res.value[0]);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

export function normalizeDomain(h: string): string {
  h = h.toLowerCase().trim();
  const i = h.indexOf("://");
  if (i >= 0) h = h.slice(i + 3);
  const j = h.search(/[/?#]/);
  if (j >= 0) h = h.slice(0, j);
  return h.endsWith(".") ? h.slice(0, -1) : h;
}

export function parseDomain(input: string): string | null {
  if (input.length > 1024) return null;
  const h = normalizeDomain(input);
  if (h === "" || isIP(h) || isIP(h.replace(/^\[|\]$/g, ""))) return null;
  const ascii = toASCII(h);
  if (ascii === "" || ascii.length > 253 || !/^[a-z0-9.-]+$/.test(ascii)) return null;
  const labels = ascii.split(".");
  if (labels.length < 2) return null;
  for (const l of labels) {
    if (l.length < 1 || l.length > 63 || l.startsWith("-") || l.endsWith("-")) return null;
  }
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  if (labels[labels.length - 1] === "localhost") return null;
  return ascii;
}

const urlReinterpretedChars = /[%@:\\/\s]/;

function toASCII(h: string): string {
  if (urlReinterpretedChars.test(h)) return "";
  try {
    return new URL(`http://${h}/`).hostname;
  } catch {
    return "";
  }
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

export function describe(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  switch (code) {
    case "ENOTFOUND":
      return "no such host";
    case "ENODATA":
      return "no records";
    case "ETIMEOUT":
      return "timeout";
    case "ESERVFAIL":
      return "server failure";
    case "EREFUSED":
      return "refused";
  }
  if (code) return code;
  return err instanceof Error ? err.message : "lookup failed";
}
