import { load } from "js-yaml";
import { kinds, type Kind } from "./provider";
import { fieldReaders } from "./yaml-fields";

const { obj, list_, strs, str } = fieldReaders("advisories");

export type FixState = "patched" | "testing" | "none";
export const fixStates: readonly FixState[] = ["patched", "testing", "none"];

export type SiteCheck = "php";
const siteChecks: readonly string[] = ["php"];

interface FixStatus {
  name: string;
  state: FixState;
  detail: string;
  detail_en: string;
  source: string;
  checked_at: string;
}

export interface Advisory {
  id: string;
  title: string;
  title_en: string;
  cves: string[];
  cvss: string;
  cvss_version: string;
  cvss_source: string;
  published: string;
  summary: string;
  summary_en: string;
  upstream: { label: string; url: string; checked_at: string };
  fixes: FixStatus[];
  stopgap: string;
  stopgap_en: string;
  fix_note: string;
  fix_note_en: string;
  references: string;
  references_en: string;
  ask: string;
  ask_en: string;
  kinds: Kind[];
  required_for: Kind[];
  site_check?: SiteCheck;
  guide: boolean;
  providers_checked_at: string;
}

export function loadAdvisories(yamlText: string): Advisory[] {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (err) {
    throw new Error(`advisories: ${err instanceof Error ? err.message : String(err)}`);
  }
  const seen = new Set<string>();
  const advisories = list_(obj(raw, "file").advisories, "advisories").map((entry, i): Advisory => {
    const e = obj(entry, `entry ${i}`);
    const id = str(e.id);
    if (id === "") throw new Error(`advisories: entry ${i} has no id`);
    if (seen.has(id)) throw new Error(`advisories: duplicate id ${JSON.stringify(id)}`);
    seen.add(id);
    const kindList = (v: unknown, what: string) =>
      strs(v, `${id}: ${what}`).map((k) => {
        if (!kinds.includes(k as Kind)) throw new Error(`advisories: ${id}: ${what}: unknown kind ${JSON.stringify(k)}`);
        return k as Kind;
      });
    const siteCheck = str(e.site_check);
    if (siteCheck && !siteChecks.includes(siteCheck)) throw new Error(`advisories: ${id}: unknown site_check ${JSON.stringify(siteCheck)}`);
    const upstream = obj(e.upstream, `${id}: upstream`);
    return {
      id,
      title: str(e.title),
      title_en: str(e.title_en),
      cves: strs(e.cves, `${id}: cves`),
      cvss: str(e.cvss),
      cvss_version: str(e.cvss_version),
      cvss_source: str(e.cvss_source),
      published: str(e.published),
      summary: str(e.summary),
      summary_en: str(e.summary_en),
      upstream: { label: str(upstream.label), url: str(upstream.url), checked_at: str(upstream.checked_at) },
      fixes: list_(e.fixes, `${id}: fixes`).map((f, k) => fixStatus(obj(f, `${id}: fix ${k}`), id)),
      stopgap: str(e.stopgap),
      stopgap_en: str(e.stopgap_en),
      fix_note: str(e.fix_note),
      fix_note_en: str(e.fix_note_en),
      references: str(e.references),
      references_en: str(e.references_en),
      ask: str(e.ask),
      ask_en: str(e.ask_en),
      kinds: kindList(e.kinds, "kinds"),
      required_for: kindList(e.required_for, "required_for"),
      ...(siteCheck && { site_check: siteCheck as SiteCheck }),
      guide: e.guide === true,
      providers_checked_at: str(e.providers_checked_at),
    };
  });
  return advisories.sort((a, b) => b.published.localeCompare(a.published));
}

function fixStatus(f: Record<string, unknown>, id: string): FixStatus {
  const state = str(f.state) as FixState;
  if (!fixStates.includes(state)) throw new Error(`advisories: ${id}: ${str(f.name)}: unknown state ${JSON.stringify(state)}`);
  return {
    name: str(f.name),
    state,
    detail: str(f.detail),
    detail_en: str(f.detail_en),
    source: str(f.source),
    checked_at: str(f.checked_at),
  };
}

export function fillAsk(template: string, vendor: string, domain: string): string {
  return template.replaceAll("{vendor}", vendor).replaceAll("{domain}", domain).trim();
}
