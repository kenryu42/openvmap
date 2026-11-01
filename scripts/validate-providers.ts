import { existsSync, readFileSync } from "node:fs";
import { fixStates, loadAdvisories, type Advisory } from "../lib/advisory";
import { incidentOf, loadProviders, type Table } from "../lib/provider";
import { runValidation } from "./run-validation";

const date = /^\d{4}-\d{2}-\d{2}$/;

export function validateTable(t: Table): string[] {
  const errors: string[] = [];
  if (!date.test(t.updated_at)) errors.push(`updated_at ${JSON.stringify(t.updated_at)} is not a date`);
  const owners = new Map<string, string>();
  const claim = (key: string, id: string) => {
    const other = owners.get(key);
    if (other && other !== id) errors.push(`${key} is listed under both ${other} and ${id}`);
    owners.set(key, id);
  };
  const asnFirst = new Map<number, string>();
  for (const p of t.providers) {
    for (const a of p.asns) {
      const first = asnFirst.get(a);
      if (first === undefined) asnFirst.set(a, p.id);
      else if (p.ns_suffixes.length + p.ns_contains.length + p.cname_suffixes.length + p.ptr_suffixes.length === 0) {
        errors.push(`${p.id}: shares AS${a} with ${first} but has no name-server, CNAME or reverse-name suffix to tell them apart`);
      }
    }
    for (const s of p.ns_suffixes) claim(`ns suffix ${s}`, p.id);
    for (const s of p.cname_suffixes) claim(`cname suffix ${s}`, p.id);
    for (const s of p.ptr_suffixes) claim(`ptr suffix ${s}`, p.id);
    for (const s of p.mx_suffixes) claim(`mx suffix ${s}`, p.id);
    for (const h of p.http_headers) claim(`http header ${h}`, p.id);
    for (const c of p.cert_issuers) claim(`certificate issuer ${c.toLowerCase()}`, p.id);
    if (p.name === "" || p.name_ja === "") errors.push(`${p.id}: name and name_ja are required`);
    if (p.news && !p.news.startsWith("https://")) errors.push(`${p.id}: news is not an https URL`);

    for (const a of t.advisories) {
      if (a.required_for.includes(p.kind) && !incidentOf(p, a.id)) errors.push(`${p.id}: ${p.kind} provider without a ${a.id} entry`);
    }
    for (const [key, i] of Object.entries(p.incidents)) {
      const at = `${p.id}: ${key}`;
      if (i.confidence === "official" && !i.source) errors.push(`${at}: official without a source`);
      if (i.source && !i.source.startsWith("https://")) errors.push(`${at}: source is not an https URL`);
      if (i.date && !validDate(i.date)) errors.push(`${at}: date ${JSON.stringify(i.date)} is not a date`);
      if (!validDate(i.verified_at)) errors.push(`${at}: verified_at ${JSON.stringify(i.verified_at)} is not a date`);
      const advisory = t.advisory(key);
      if (i.status === "n/a" && advisory?.required_for.includes(p.kind)) errors.push(`${at}: n/a on a ${p.kind} provider`);
      if (!i.summary || !i.summary_en) errors.push(`${at}: summary and summary_en are required`);
      if (!advisory && (!i.title || !i.title_en)) errors.push(`${at}: title and title_en are required for an incident that is not an advisory`);
    }
  }
  return errors;
}

function validDate(s: string): boolean {
  return date.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s);
}

const cve = /^CVE-\d{4}-\d{4,}$/;

export function validateAdvisories(advisories: readonly Advisory[]): string[] {
  const errors: string[] = [];
  const https = (at: string, url: string) => {
    if (!url.startsWith("https://")) errors.push(`${at} is not an https URL`);
  };
  for (const a of advisories) {
    const at = `advisory ${a.id}`;
    for (const [field, v] of Object.entries({
      title: a.title,
      title_en: a.title_en,
      summary: a.summary,
      summary_en: a.summary_en,
      stopgap: a.stopgap,
      stopgap_en: a.stopgap_en,
      ask: a.ask,
      ask_en: a.ask_en,
      cvss: a.cvss,
      cvss_version: a.cvss_version,
    })) {
      if (!v) errors.push(`${at}: ${field} is required`);
    }
    if (a.cves.length === 0) errors.push(`${at}: cves is empty`);
    for (const c of a.cves) if (!cve.test(c)) errors.push(`${at}: ${JSON.stringify(c)} is not a CVE id`);
    if (a.cvss && Number.isNaN(Number(a.cvss))) errors.push(`${at}: cvss ${JSON.stringify(a.cvss)} is not a score`);
    https(`${at}: cvss_source`, a.cvss_source);
    https(`${at}: upstream url`, a.upstream.url);
    if (!a.upstream.label) errors.push(`${at}: upstream label is required`);
    for (const [field, d] of [
      ["published", a.published],
      ["upstream checked_at", a.upstream.checked_at],
      ["providers_checked_at", a.providers_checked_at],
    ] as const) {
      if (!validDate(d)) errors.push(`${at}: ${field} ${JSON.stringify(d)} is not a date`);
    }
    for (const f of a.fixes) {
      const fat = `${at}: ${f.name || "fix without a name"}`;
      if (!f.name) errors.push(`${fat}: name is required`);
      if (!fixStates.includes(f.state)) errors.push(`${fat}: unknown state`);
      https(`${fat}: source`, f.source);
      if (!validDate(f.checked_at)) errors.push(`${fat}: checked_at ${JSON.stringify(f.checked_at)} is not a date`);
    }
    if (a.site_check && (!a.fix_note || !a.fix_note_en || !a.references || !a.references_en)) {
      errors.push(`${at}: site_check needs fix_note, fix_note_en, references and references_en`);
    }
    for (const ask of [a.ask, a.ask_en]) if (ask && !ask.includes("{domain}")) errors.push(`${at}: ask and ask_en need {domain}`);
    if (a.guide) errors.push(...missingGuideFiles(a.id));
  }
  return errors;
}

function missingGuideFiles(id: string): string[] {
  const files = [`content/guide/${id}/en.md`, `content/guide/${id}/ja.md`, `app/(en)/guide/${id}/page.tsx`, `app/ja/guide/${id}/page.tsx`];
  return files.filter((f) => !existsSync(f)).map((f) => `${f} is missing: advisory ${id} says it has a guide`);
}

if (import.meta.main) {
  const path = process.argv[2] ?? "data/providers.yaml";
  const advisoriesPath = process.argv[3] ?? "data/advisories.yaml";
  runValidation(`${path}, ${advisoriesPath}: ok`, () => {
    const advisories = loadAdvisories(readFileSync(advisoriesPath, "utf8"));
    return [...validateAdvisories(advisories), ...validateTable(loadProviders(readFileSync(path, "utf8"), advisories))];
  });
}
