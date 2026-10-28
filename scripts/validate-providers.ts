import { existsSync, readFileSync } from "node:fs";
import { incidentOf, loadProviders, type Table } from "../lib/provider";
import { runValidation } from "./run-validation";

const date = /^\d{4}-\d{2}-\d{2}$/;
const noPhpKinds = new Set(["saas", "paas", "cloud", "cdn", "dns", "mail", "ca"]);

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

    const inc = incidentOf(p, t.incident);
    if (p.kind === "hosting" && !inc) errors.push(`${p.id}: hosting provider without a ${t.incident} entry`);
    for (const [key, i] of Object.entries(p.incidents)) {
      const at = `${p.id}: ${key}`;
      if (i.confidence === "official" && !i.source) errors.push(`${at}: official without a source`);
      if (i.source && !i.source.startsWith("https://")) errors.push(`${at}: source is not an https URL`);
      if (i.date && !validDate(i.date)) errors.push(`${at}: date ${JSON.stringify(i.date)} is not a date`);
      if (!validDate(i.verified_at)) errors.push(`${at}: verified_at ${JSON.stringify(i.verified_at)} is not a date`);
      if (i.status === "n/a" && !noPhpKinds.has(p.kind)) errors.push(`${at}: n/a on a ${p.kind} provider`);
      if (!i.summary || !i.summary_en) errors.push(`${at}: summary and summary_en are required`);
      if (key !== t.incident && (!i.title || !i.title_en)) errors.push(`${at}: title and title_en are required for an incident other than ${t.incident}`);
    }
  }
  return errors;
}

function validDate(s: string): boolean {
  return date.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s);
}

function missingGuideFiles(incident: string): string[] {
  const files = [
    `content/guide/${incident}/en.md`,
    `content/guide/${incident}/ja.md`,
    `app/(en)/guide/${incident}/page.tsx`,
    `app/ja/guide/${incident}/page.tsx`,
  ];
  return files.filter((f) => !existsSync(f)).map((f) => `${f} is missing: the Guide link goes to the guide for ${incident}`);
}

if (import.meta.main) {
  const path = process.argv[2] ?? "data/providers.yaml";
  runValidation(`${path}: ok`, () => {
    const t = loadProviders(readFileSync(path, "utf8"));
    return [...validateTable(t), ...missingGuideFiles(t.incident)];
  });
}
