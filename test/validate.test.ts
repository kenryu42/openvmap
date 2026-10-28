import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProviders } from "@/lib/provider";
import { validateTable } from "@/scripts/validate-providers";

const inc = (extra: string) => `
    incidents:
      php2shell:
        summary: s
        summary_en: s
        verified_at: "2026-10-24"
${extra}`;

const table = (body: string, updated = '"2026-10-24"') => loadProviders(`incident: php2shell\nupdated_at: ${updated}\nproviders:\n${body}`);

describe("validateTable", () => {
  it("accepts the shipped table", () => {
    expect(validateTable(loadProviders(readFileSync("data/providers.yaml", "utf8")))).toEqual([]);
  });

  it.each([
    [
      "official without a source",
      `  - id: a\n    name: A\n    name_ja: A\n    kind: hosting${inc("        status: patched\n        confidence: official")}`,
      "a: php2shell: official without a source",
    ],
    [
      "a suffix under two providers",
      `  - id: a\n    name: A\n    name_ja: A\n    kind: dns\n    ns_suffixes: [dns.example]\n  - id: b\n    name: B\n    name_ja: B\n    kind: dns\n    ns_suffixes: [DNS.example.]`,
      "ns suffix dns.example is listed under both a and b",
    ],
    [
      "a shared ASN on a service with nothing else to identify it",
      `  - id: a\n    name: A\n    name_ja: A\n    kind: cdn\n    asns: [13335]\n  - id: b\n    name: B\n    name_ja: B\n    kind: cdn\n    asns: [13335]`,
      "b: shares AS13335 with a but has no name-server, CNAME or reverse-name suffix to tell them apart",
    ],
    [
      "n/a on hosting",
      `  - id: a\n    name: A\n    name_ja: A\n    kind: hosting${inc("        status: n/a\n        confidence: secondary")}`,
      "a: php2shell: n/a on a hosting provider",
    ],
    [
      "a date that is not a date",
      `  - id: a\n    name: A\n    name_ja: A\n    kind: hosting${inc('        status: patched\n        confidence: secondary\n        date: "2026-02-30"')}`,
      'a: php2shell: date "2026-02-30" is not a date',
    ],
    ["hosting without an entry", `  - id: a\n    name: A\n    name_ja: A\n    kind: hosting`, "a: hosting provider without a php2shell entry"],
  ])("rejects %s", (_name, body, want) => {
    expect(validateTable(table(body))).toContain(want);
  });

  it("rejects an updated_at that is not a date", () => {
    expect(validateTable(table("  - id: a\n    name: A\n    name_ja: A\n    kind: dns", "yesterday"))).toContain('updated_at "yesterday" is not a date');
  });
});
