import { load } from "js-yaml";
import { fieldReaders } from "./yaml-fields";

const { obj, list_, strs, str } = fieldReaders("providers");

export type Kind = "hosting" | "saas" | "paas" | "cloud" | "cdn" | "dns" | "mail" | "ca";
const kinds: readonly Kind[] = ["hosting", "saas", "paas", "cloud", "cdn", "dns", "mail", "ca"];

export type Confidence = "official" | "secondary" | "";
const confidences: readonly string[] = ["official", "secondary", ""];

export type Status = "patched" | "in_progress" | "unknown" | "conflicting" | "n/a";
const statuses: readonly Status[] = ["patched", "in_progress", "unknown", "conflicting", "n/a"];

export interface Incident {
  title?: string;
  title_en?: string;
  status: Status;
  confidence: Confidence;
  date?: string;
  summary: string;
  summary_en: string;
  customer_action: string;
  customer_action_en: string;
  source?: string;
  verified_at: string;
}

export interface Provider {
  id: string;
  name: string;
  name_ja: string;
  kind: Kind;
  asns: number[];
  as_name_contains: string[];
  ns_suffixes: string[];
  ns_contains: string[];
  cname_suffixes: string[];
  ptr_suffixes: string[];
  mx_suffixes: string[];
  http_headers: string[];
  cert_issuers: string[];
  distrusted_roots: string[];
  notes: string;
  notes_ja: string;
  news?: string;
  incidents: Record<string, Incident>;
}

export function incidentOf(p: Provider | undefined, key: string): Incident | undefined {
  return p && Object.hasOwn(p.incidents, key) ? p.incidents[key] : undefined;
}

export function otherIncidents(p: Provider, main: string): (Incident & { key: string })[] {
  return Object.entries(p.incidents)
    .filter(([k]) => k !== main)
    .map(([key, i]) => ({ key, ...i }));
}

export class Table {
  constructor(
    readonly incident: string,
    readonly incident_cves: string[],
    readonly updated_at: string,
    readonly providers: Provider[],
  ) {}

  get(id: string): Provider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  byAsn(asn: number, asName: string, prefer?: ReadonlySet<string>, ptr?: string): Provider | undefined {
    const exact = this.providers.filter((p) => p.asns.includes(asn));
    if (exact.length > 0) {
      const host = normalize(ptr ?? "");
      const namedByReverseName = host === "" ? undefined : exact.find((p) => p.ptr_suffixes.some((suf) => host === suf || host.endsWith("." + suf)));
      const preferredWithoutPtr = exact.find((p) => p.ptr_suffixes.length === 0 && prefer?.has(p.id));
      return namedByReverseName ?? preferredWithoutPtr ?? exact[0];
    }
    if (asName === "") return undefined;
    const upper = asName.toUpperCase();
    return this.providers.find((p) => p.as_name_contains.some((n) => n !== "" && upper.includes(n.toUpperCase())));
  }

  namedByPtr(asn: number): boolean {
    return this.providers.some((p) => p.asns.includes(asn) && p.ptr_suffixes.length > 0);
  }

  byNs(host: string): Provider | undefined {
    const p = this.bySuffix(host, (p) => p.ns_suffixes);
    if (p) return p;
    host = normalize(host);
    return this.providers.find((p) => p.ns_contains.some((n) => n !== "" && host.includes(normalize(n))));
  }

  byCname(host: string): Provider | undefined {
    return this.bySuffix(host, (p) => p.cname_suffixes);
  }

  byHeaders(names: readonly string[]): Provider[] {
    const seen = new Set(names.map((n) => n.toLowerCase()));
    return this.providers.filter((p) => p.http_headers.some((h) => seen.has(h)));
  }

  byCertIssuer(org: string): Provider | undefined {
    const upper = org.toUpperCase();
    if (upper === "") return undefined;
    return this.providers.find((p) => p.cert_issuers.some((n) => n !== "" && upper.includes(n.toUpperCase())));
  }

  byMx(host: string): Provider | undefined {
    return this.bySuffix(host, (p) => p.mx_suffixes);
  }

  private bySuffix(host: string, get: (p: Provider) => string[]): Provider | undefined {
    host = normalize(host);
    if (host === "") return undefined;
    return this.providers.find((p) => get(p).some((suf) => host === suf || host.endsWith("." + suf)));
  }
}

export function loadProviders(yamlText: string): Table {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (err) {
    throw new Error(`providers: ${err instanceof Error ? err.message : String(err)}`);
  }
  const doc = obj(raw, "file");
  const list = doc.providers ?? [];
  if (!Array.isArray(list)) throw new Error("providers: providers is not a list");
  const seen = new Set<string>();
  const providers = list.map((entry, i): Provider => {
    const e = obj(entry, `entry ${i}`);
    const id = str(e.id);
    if (id === "") throw new Error(`providers: entry ${i} has no id`);
    if (seen.has(id)) throw new Error(`providers: duplicate id ${JSON.stringify(id)}`);
    seen.add(id);
    const kind = str(e.kind) as Kind;
    if (!kinds.includes(kind)) throw new Error(`providers: ${id}: unknown kind ${JSON.stringify(kind)}`);
    const asns = list_(e.asns, `${id}: asns`).map((a) => {
      if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a > 0xffffffff) {
        throw new Error(`providers: ${id}: bad ASN ${JSON.stringify(a)}`);
      }
      return a;
    });
    const incidents: Record<string, Incident> = {};
    for (const [k, v] of Object.entries(obj(e.incidents ?? {}, `${id}: incidents`))) {
      incidents[k] = incident(obj(v, `${id}: incident ${k}`), id, k);
    }
    return {
      id,
      name: str(e.name),
      name_ja: str(e.name_ja),
      kind,
      asns,
      as_name_contains: strs(e.as_name_contains, `${id}: as_name_contains`),
      ns_suffixes: strs(e.ns_suffixes, `${id}: ns_suffixes`).map(normalize),
      ns_contains: strs(e.ns_contains, `${id}: ns_contains`),
      cname_suffixes: strs(e.cname_suffixes, `${id}: cname_suffixes`).map(normalize),
      ptr_suffixes: strs(e.ptr_suffixes, `${id}: ptr_suffixes`).map(normalize),
      mx_suffixes: strs(e.mx_suffixes, `${id}: mx_suffixes`).map(normalize),
      http_headers: strs(e.http_headers, `${id}: http_headers`).map((h) => h.trim().toLowerCase()),
      cert_issuers: strs(e.cert_issuers, `${id}: cert_issuers`),
      distrusted_roots: strs(e.distrusted_roots, `${id}: distrusted_roots`),
      notes: str(e.notes),
      notes_ja: str(e.notes_ja),
      ...(str(e.news) && { news: str(e.news) }),
      incidents,
    };
  });
  return new Table(str(doc.incident), strs(doc.incident_cves, "incident_cves"), str(doc.updated_at), providers);
}

function incident(v: Record<string, unknown>, id: string, key: string): Incident {
  const status = str(v.status) as Status;
  if (!statuses.includes(status)) {
    throw new Error(`providers: ${id}: incident ${key}: unknown status ${JSON.stringify(status)}`);
  }
  const confidence = str(v.confidence) as Confidence;
  if (!confidences.includes(confidence)) {
    throw new Error(`providers: ${id}: incident ${key}: unknown confidence ${JSON.stringify(confidence)}`);
  }
  const date = str(v.date);
  const source = str(v.source);
  const title = str(v.title);
  const title_en = str(v.title_en);
  return {
    ...(title && { title }),
    ...(title_en && { title_en }),
    status,
    confidence,
    ...(date && { date }),
    summary: str(v.summary),
    summary_en: str(v.summary_en),
    customer_action: str(v.customer_action),
    customer_action_en: str(v.customer_action_en),
    ...(source && { source }),
    verified_at: str(v.verified_at),
  };
}

function normalize(h: string): string {
  h = h.trim().toLowerCase();
  return h.endsWith(".") ? h.slice(0, -1) : h;
}
