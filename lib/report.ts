import type { PageResult } from "./check";
import { messages, type Lang } from "./lang";
import type { Messages } from "./messages/ja";
import { fixedFor, type PhpResult } from "./phpsig";
import { incidentOf, otherIncidents, type Incident, type Kind, type Provider, type Table } from "./provider";
import type { TlsInfo } from "./tls";

export { phpAdvisory } from "./meta";
export const ipaAlert = "https://www.ipa.go.jp/security/security-alert/2026/alert20261022.html";
const jpcertAlert = "https://www.jpcert.or.jp/at/2026/at260033.html";

export type Role = "web" | "cname" | "http" | "ns" | "mx" | "tls";

export interface IpInfo {
  ip: string;
  asn?: number;
  as_name?: string;
  prefix?: string;
  ptr?: string;
  provider_id?: string;
  error?: string;
}

export interface HostInfo {
  name: string;
  cname?: string;
  cname_provider_id?: string;
  ips: IpInfo[];
}

interface NameInfo {
  host: string;
  provider_id?: string;
}

interface ProviderHit {
  id: string;
  name: string;
  name_ja: string;
  kind: Kind;
  roles: Role[];
  evidence: string[];
  notes?: string;
  notes_ja?: string;
  incident?: Incident;
  other_incidents?: (Incident & { key: string })[];
}

export interface HttpInfo {
  url: string;
  final_url?: string;
  status?: number;
  server?: string;
  error?: string;
}

export interface Report {
  tool: string;
  version: string;
  incident: string;
  domain: string;
  checked_at: string;
  ns: NameInfo[];
  mx: NameInfo[];
  hosts: HostInfo[];
  providers: ProviderHit[];
  http?: HttpInfo;
  php?: PhpResult;
  tls?: TlsInfo;
  warnings?: string[];
  actions: string[];
  message_template: string;
}

export function addProvider(r: Report, p: Provider | undefined, role: Role, evidence: string): void {
  if (!p) return;
  const h = r.providers.find((x) => x.id === p.id);
  if (h) {
    if (!h.roles.includes(role)) h.roles.push(role);
    if (!h.evidence.includes(evidence)) h.evidence.push(evidence);
    return;
  }
  const inc = incidentOf(p, r.incident);
  const others = otherIncidents(p, r.incident);
  r.providers.push({
    id: p.id,
    name: p.name,
    name_ja: p.name_ja,
    kind: p.kind,
    roles: [role],
    evidence: [evidence],
    ...(p.notes && { notes: p.notes }),
    ...(p.notes_ja && { notes_ja: p.notes_ja }),
    ...(inc && { incident: inc }),
    ...(others.length > 0 && { other_incidents: others }),
  });
}

const rank: Record<Kind, number> = { hosting: 0, saas: 1, paas: 2, cloud: 3, cdn: 4, dns: 5, mail: 6, ca: 7 };

export function sortProviders(r: Report): void {
  r.providers.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function webProviders(r: Report): ProviderHit[] {
  return r.providers.filter((h) => h.roles.includes("web") || h.roles.includes("cname") || h.roles.includes("http"));
}

function unmatchedWebAs(r: Report): string[] {
  const out: string[] = [];
  for (const h of r.hosts) {
    for (const ip of h.ips) {
      if (ip.provider_id || !ip.asn) continue;
      const key = `AS${ip.asn} ${ip.as_name ?? ""}`;
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

export interface IncidentCheck {
  provider: Provider;
  incident: Incident & { key: string };
  result: "found" | "clear" | "unchecked";
  missing?: "page" | "cert";
}

export function incidentChecks(r: Report, table: Table): IncidentCheck[] {
  const out: IncidentCheck[] = [];
  for (const p of table.providers) {
    for (const incident of otherIncidents(p, table.incident)) {
      if (r.providers.some((h) => h.id === p.id)) {
        out.push({ provider: p, incident, result: "found" });
        continue;
      }
      const missing = p.http_headers.length > 0 && !r.http?.status ? "page" : p.cert_issuers.length > 0 && !r.tls?.chain?.length ? "cert" : undefined;
      out.push({ provider: p, incident, result: missing ? "unchecked" : "clear", ...(missing && { missing }) });
    }
  }
  return out;
}

export function addPage(r: Report, page: PageResult, lang: Lang, table: Table): void {
  if (page.http) r.http = page.http;
  if (page.php) r.php = page.php;
  const names = page.headers ?? [];
  const at = r.http?.final_url ?? r.http?.url;
  const host = at ? new URL(at).host : r.domain;
  for (const p of table.byHeaders(names)) {
    for (const h of p.http_headers.filter((x) => names.includes(x))) addProvider(r, p, "http", `${host} response header ${h}`);
  }
  if (page.tls) {
    r.tls = { ...page.tls };
    const leaf = page.tls.chain?.[0];
    const ca = leaf ? table.byCertIssuer(leaf.issuer_o ?? "") : undefined;
    if (ca && leaf) {
      addProvider(r, ca, "tls", `${page.tls.host} certificate issued by ${leaf.issuer_cn ?? ""} (${leaf.issuer_o ?? ""})`);
      const names = page.tls.chain!.flatMap((c) => [c.subject_cn, c.issuer_cn]);
      const root = ca.distrusted_roots.find((n) => names.includes(n));
      if (root) r.tls.distrusted_root = root;
    }
    if (page.tls.error) (r.warnings ??= []).push(`TLS ${page.tls.host}: ${page.tls.error}`);
  }
  sortProviders(r);
  finalize(r, lang);
}

export function finalize(r: Report, lang: Lang): void {
  const s = messages(lang);
  r.actions = buildActions(r, s);
  r.message_template = buildMessage(r, s);
}

function buildActions(r: Report, s: Messages): string[] {
  const out: string[] = [];
  const ja = s.lang === "ja";
  const web = webProviders(r);
  const hosting = web.filter((h) => h.kind === "hosting" || h.kind === "saas");
  const paas = web.filter((h) => h.kind === "paas");
  const platformHidesCloud = web.some((h) => h.kind === "saas" || h.kind === "paas");
  const cloud = platformHidesCloud ? [] : web.filter((h) => h.kind === "cloud");
  const cdn = web.filter((h) => h.kind === "cdn");

  if (r.hosts.length === 0) out.push(s.actNoHosts);
  for (const h of hosting) {
    const name = pick(ja, h.name_ja, h.name);
    if (!h.incident) {
      out.push(s.actHostingUnlisted(name, r.incident));
      continue;
    }
    const ca = pick(ja, h.incident.customer_action, h.incident.customer_action_en);
    switch (h.incident.status) {
      case "n/a":
        out.push(s.actSaas(name, ca));
        break;
      case "patched":
        out.push(s.actPatched(name, s.confLabels[h.incident.confidence], h.incident.date ?? "", ca));
        break;
      case "in_progress":
        out.push(s.actInProgress(name, ca));
        break;
      default:
        out.push(s.actUnknown(name, ca));
    }
  }
  for (const h of paas) out.push(s.actPaas(pick(ja, h.name_ja, h.name)));
  for (const h of cloud) out.push(s.actCloud(pick(ja, h.name_ja, h.name)));
  if (cdn.length > 0 && hosting.length === 0 && paas.length === 0 && cloud.length === 0) {
    out.push(s.actCDN(pick(ja, cdn[0].name_ja, cdn[0].name)));
  }
  if (r.tls?.distrusted_root) out.push(s.actDistrustedRoot(r.tls.host, r.tls.distrusted_root));
  for (const h of r.providers) {
    for (const i of h.other_incidents ?? []) {
      const say = h.kind === "ca" ? s.actCaIncident : s.actOtherIncident;
      out.push(say(pick(ja, h.name_ja, h.name), pick(ja, i.title, i.title_en), s.statusLabels[i.status], pick(ja, i.customer_action, i.customer_action_en)));
    }
  }
  const un = unmatchedWebAs(r);
  if (un.length > 0) out.push(s.actUnmatched(un.join("; ")));

  if (r.http && !r.php) {
    if (r.http.status && r.http.status >= 400) out.push(s.actHTTPStatus(r.http.status));
    else out.push(s.actHTTPFailed(r.http.error ?? ""));
  } else if (r.php) {
    const evs = r.php.signals
      .filter((sig) => sig.weight > 0)
      .map((sig) => sig.evidence)
      .join(", ");
    switch (r.php.verdict) {
      case "likely":
        out.push(s.actPHPLikely(evs));
        break;
      case "possible":
        out.push(s.actPHPPossible(evs));
        break;
      case "unlikely":
        out.push(s.actPHPUnlikely);
        break;
      default:
        out.push(s.actPHPNone);
    }
    const v = r.php.php_version;
    if (v) {
      switch (r.php.version_status) {
        case "fixed_or_later":
          out.push(s.actVersionFixed(v));
          break;
        case "below_fixed_release":
          out.push(s.actVersionBelow(v, fixedFor(v)));
          break;
        case "no_official_fix":
          out.push(s.actVersionUnfixed(v));
          break;
      }
    }
    if (r.php.long_session_cookie) out.push(s.actLongCookie);
  }
  out.push(s.actOnlyFix, s.actRefs(ipaAlert, jpcertAlert));
  return out;
}

function buildMessage(r: Report, s: Messages): string {
  const ja = s.lang === "ja";
  const web = webProviders(r);
  const vendor = web.find((h) => h.kind === "hosting" || h.kind === "saas") ?? web.find((h) => h.kind === "paas" || h.kind === "cloud");
  const name = vendor ? pick(ja, vendor.name_ja, vendor.name) : s.vendorPlaceholder;
  return s.template(name, r.domain, ipaAlert, jpcertAlert).trim();
}

export function pick(ja: boolean, jaText: string | undefined, enText: string | undefined): string {
  if (ja && jaText) return jaText;
  if (enText) return enText;
  return jaText ?? "";
}

export function reportJson(r: Report): Record<string, unknown> {
  const withoutEmpty = <T extends object>(x: T) =>
    Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== "" && v !== 0 && v !== false));
  return {
    tool: r.tool,
    version: r.version,
    incident: r.incident,
    domain: r.domain,
    checked_at: r.checked_at,
    ns: r.ns.map((n) => withoutEmpty({ host: n.host, provider_id: n.provider_id })),
    mx: r.mx.map((n) => withoutEmpty({ host: n.host, provider_id: n.provider_id })),
    hosts: r.hosts.map((h) => ({
      ...withoutEmpty({ name: h.name, cname: h.cname, cname_provider_id: h.cname_provider_id }),
      ips: h.ips.map((ip) => withoutEmpty({ ip: ip.ip, asn: ip.asn, as_name: ip.as_name, prefix: ip.prefix, provider_id: ip.provider_id, error: ip.error })),
    })),
    providers: r.providers.map((h) => ({
      id: h.id,
      name: h.name,
      name_ja: h.name_ja,
      kind: h.kind,
      roles: h.roles,
      evidence: h.evidence,
      ...withoutEmpty({ notes: h.notes, notes_ja: h.notes_ja }),
      ...(h.incident && { incident: incidentJson(h.incident) }),
      ...(h.other_incidents?.length && { other_incidents: h.other_incidents.map((i) => ({ key: i.key, ...incidentJson(i) })) }),
    })),
    ...(r.http && { http: withoutEmpty({ url: r.http.url, final_url: r.http.final_url, status: r.http.status, server: r.http.server, error: r.http.error }) }),
    ...(r.php && {
      php: {
        verdict: r.php.verdict,
        score: r.php.score,
        signals: r.php.signals.map((s) => ({ kind: s.kind, evidence: s.evidence, weight: s.weight })),
        ...withoutEmpty({
          cms: r.php.cms?.length ? r.php.cms : undefined,
          php_version: r.php.php_version,
          version_status: r.php.version_status,
          long_session_cookie: r.php.long_session_cookie,
        }),
      },
    }),
    ...(r.tls && {
      tls: withoutEmpty({
        host: r.tls.host,
        chain: r.tls.chain?.map((c) => withoutEmpty({ subject_cn: c.subject_cn, subject_o: c.subject_o, issuer_cn: c.issuer_cn, issuer_o: c.issuer_o })),
        error: r.tls.error,
        distrusted_root: r.tls.distrusted_root,
      }),
    }),
    ...(r.warnings?.length && { warnings: r.warnings }),
    actions: r.actions,
    message_template: r.message_template,
  };
}

function incidentJson(i: Incident): Record<string, unknown> {
  return {
    ...(i.title && { title: i.title }),
    ...(i.title_en && { title_en: i.title_en }),
    status: i.status,
    confidence: i.confidence,
    ...(i.date && { date: i.date }),
    summary: i.summary,
    summary_en: i.summary_en,
    customer_action: i.customer_action,
    customer_action_en: i.customer_action_en,
    ...(i.source && { source: i.source }),
    verified_at: i.verified_at,
  };
}
