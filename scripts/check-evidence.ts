import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadProviders, type Table } from "../lib/provider";
import type { Manifest } from "./check-sources";

export interface Evidence {
  handled: Handled[];
}

export interface Handled {
  provider: string;
  url: string;
  change: "updated" | "unchanged";
  quotes: readonly string[];
}

const minQuote = 15;

const squash = (t: string) => t.replace(/\s+/g, " ").trim();

export function checkEvidence(
  m: Manifest,
  texts: Record<string, string>,
  e: Evidence,
  before: Table,
  after: Table,
): { accept: string[]; errors: string[]; held: string[] } {
  const errors: string[] = [];
  for (const h of e.handled) {
    if (h.change !== "updated" && h.change !== "unchanged") {
      errors.push(`${h.provider}: change must be "updated" or "unchanged", not ${JSON.stringify(h.change)}`);
      continue;
    }
    const item = m.items.find((i) => i.url === h.url && i.file);
    if (!item) {
      errors.push(`${h.provider}: ${h.url} was not among the flagged pages`);
      continue;
    }
    if (!item.providers.includes(h.provider)) {
      errors.push(`${h.provider}: ${h.url} is not one of its pages`);
      continue;
    }
    const page = squash(texts[h.url] ?? "");
    for (const q of h.quotes) {
      if (!page.includes(squash(q))) errors.push(`${h.provider}: quote not found on ${h.url}: ${JSON.stringify(q)}`);
    }
    if (h.change === "updated" && !h.quotes.some((q) => squash(q).length >= minQuote)) {
      errors.push(`${h.provider}: an update needs at least one quote of ${minQuote} characters or more from the page`);
    }
  }

  if (after.incident !== before.incident) errors.push("the incident key may not change");
  const ids = new Set([...before.providers, ...after.providers].map((p) => p.id));
  const updated = new Set(e.handled.filter((h) => h.change === "updated").map((h) => h.provider));
  for (const id of ids) {
    const was = before.get(id);
    const now = after.get(id);
    if (!was || !now) errors.push(`${id}: providers may not be added or removed`);
    else if (JSON.stringify(was) !== JSON.stringify(now) && !updated.has(id)) errors.push(`${id}: edited without evidence`);
  }
  const status = (t: Table, id: string) => t.get(id)?.incidents[after.incident]?.status;
  const pendingPatchedMoves = [...ids].filter((id) => status(after, id) === "patched" && status(before, id) !== "patched");
  const accept = m.items
    .filter((i) => i.file && i.providers.every((p) => !pendingPatchedMoves.includes(p) && e.handled.some((h) => h.provider === p && h.url === i.url)))
    .map((i) => i.url);
  return { accept, errors, held: pendingPatchedMoves };
}

export function holdBack(committed: string, edited: string, held: readonly string[]): string {
  const was = entries(committed);
  const now = entries(edited);
  const out = now.blocks.map((b) => (held.includes(b.id) ? (was.blocks.find((w) => w.id === b.id)?.text ?? b.text) : b.text));
  const changed = out.some((t, i) => t !== was.blocks[i]?.text) || out.length !== was.blocks.length;
  return changed ? now.head + out.join("") : committed;
}

function entries(yaml: string): { head: string; blocks: { id: string; text: string }[] } {
  const starts = [...yaml.matchAll(/^ {2}- id: (\S+)$/gm)];
  const head = yaml.slice(0, starts[0]?.index ?? yaml.length);
  const blocks = starts.map((s, i) => ({ id: s[1], text: yaml.slice(s.index, starts[i + 1]?.index ?? yaml.length) }));
  return { head, blocks };
}

function heldReport(held: readonly string[], after: Table, e: Evidence): string {
  const lines = ["## Held for review: proposed moves to patched", ""];
  for (const id of held) {
    const inc = after.get(id)?.incidents[after.incident];
    lines.push(
      `### ${id}`,
      "",
      `- status: ${inc?.status}, date: ${inc?.date ?? ""}, source: ${inc?.source ?? ""}`,
      `- summary: ${inc?.summary}`,
      `- summary_en: ${inc?.summary_en}`,
    );
    for (const h of e.handled.filter((h) => h.provider === id)) {
      lines.push(`- quotes from ${h.url}:`, ...h.quotes.map((q) => `  > ${q.replace(/\s+/g, " ")}`));
    }
    lines.push("");
  }
  lines.push("Read the quotes against the page. To accept, apply the entry by hand and run `bun run check-sources --accept <id>`.");
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun scripts/check-evidence.ts <dir>");
    process.exit(2);
  }
  const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  const texts = Object.fromEntries(m.items.filter((i) => i.file).map((i) => [i.url, readFileSync(path.join(dir, i.file!), "utf8")]));
  const evidencePath = path.join(dir, "evidence.json");
  const e: Evidence = existsSync(evidencePath) ? (JSON.parse(readFileSync(evidencePath, "utf8")) as Evidence) : { handled: [] };
  const committed = execFileSync("git", ["show", "HEAD:data/providers.yaml"], { encoding: "utf8" });
  const edited = readFileSync("data/providers.yaml", "utf8");
  const after = loadProviders(edited);
  const { accept, errors, held } = checkEvidence(m, texts, e, loadProviders(committed), after);
  if (errors.length > 0) {
    for (const err of errors) console.error(err);
    process.exit(1);
  }
  if (held.length > 0) {
    writeFileSync("data/providers.yaml", holdBack(committed, edited, held));
    writeFileSync(path.join(dir, "held.md"), heldReport(held, after, e));
    console.error(`held for review: ${held.join(", ")}`);
  }
  for (const url of accept) console.log(url);
}
