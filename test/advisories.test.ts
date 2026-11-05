import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillAsk, loadAdvisories } from "@/lib/advisory";
import { loadProviders } from "@/lib/provider";
import { validateAdvisories, validateTable } from "@/scripts/validate-providers";

const shipped = loadAdvisories(readFileSync("data/advisories.yaml", "utf8"));

const advisory = (extra = "") => `advisories:
  - id: kernel-bug
    title: カーネルの不具合
    title_en: Kernel bug
    cves: [CVE-2026-1234]
    cvss: "9.8"
    cvss_version: "3.1"
    cvss_source: https://cve.example/CVE-2026-1234
    published: "2026-10-15"
    summary: s
    summary_en: s
    upstream: { label: fix, url: "https://git.example/fix", checked_at: "2026-11-02" }
    fixes:
      - { name: Distro, state: testing, detail: d, detail_en: d, source: "https://distro.example/cve", checked_at: "2026-11-02" }
    stopgap: s
    stopgap_en: s
    ask: "{vendor} 様 {domain}"
    ask_en: "To {vendor}: {domain}"
    kinds: [hosting, cloud]
    required_for: [hosting]
    providers_checked_at: "2026-11-02"
${extra}`;

describe("the shipped advisories", () => {
  it("lists php2shell, tied to the PHP check and its guide, the Linux kernel advisory and the OpenSSH musl bypass", () => {
    expect(shipped.map((a) => a.id)).toEqual(["php2shell", "cve-2026-98432", "cve-2026-123158"]);
    const [php, kernel, openssh] = shipped;
    expect(php).toMatchObject({ cves: ["CVE-2026-109618", "CVE-2026-109619"], site_check: "php", guide: true });
    expect(kernel).toMatchObject({ cves: ["CVE-2026-98432"], cvss: "9.8", guide: false });
    expect(kernel.site_check).toBeUndefined();
    expect(kernel.upstream.url).toContain("e3f33b0a1d89");
    expect(openssh).toMatchObject({ cves: ["CVE-2026-123158"], cvss: "8.1", guide: false, required_for: [] });
    expect(openssh.site_check).toBeUndefined();
    expect(openssh.upstream.label).toBe("OpenSSH 10.6p2");
  });

  it("passes validation, with a source and a checked date on every fix status", () => {
    expect(validateAdvisories(shipped)).toEqual([]);
    for (const a of shipped) {
      for (const f of a.fixes) {
        expect(f.source, `${a.id} ${f.name}`).toMatch(/^https:\/\//);
        expect(f.checked_at, `${a.id} ${f.name}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("keeps the provider table valid against them", () => {
    expect(validateTable(loadProviders(readFileSync("data/providers.yaml", "utf8"), shipped))).toEqual([]);
  });
});

describe("loadAdvisories", () => {
  it("reads every field of an entry", () => {
    const [a] = loadAdvisories(advisory());
    expect(a).toMatchObject({
      id: "kernel-bug",
      title_en: "Kernel bug",
      upstream: { label: "fix", url: "https://git.example/fix", checked_at: "2026-11-02" },
      fixes: [{ name: "Distro", state: "testing", source: "https://distro.example/cve" }],
      kinds: ["hosting", "cloud"],
      required_for: ["hosting"],
      guide: false,
    });
  });

  it.each([
    ["an unknown fix state", advisory().replace("state: testing", "state: shipped"), /unknown state "shipped"/],
    ["an unknown provider kind", advisory().replace("kinds: [hosting, cloud]", "kinds: [hosting, isp]"), /unknown kind "isp"/],
    ["an unknown site check", advisory("    site_check: ruby\n"), /unknown site_check "ruby"/],
    ["two entries with one id", advisory() + advisory().replace("advisories:\n", ""), /duplicate id "kernel-bug"/],
    ["broken YAML", "advisories: [", /^advisories: /],
  ])("rejects %s", (_name, text, want) => {
    expect(() => loadAdvisories(text)).toThrow(want);
  });
});

describe("validateAdvisories", () => {
  it.each([
    [
      "a fix without an https source",
      advisory().replace('source: "https://distro.example/cve"', 'source: "http://distro.example/cve"'),
      "advisory kernel-bug: Distro: source is not an https URL",
    ],
    [
      "a fix checked on no real date",
      advisory().replace('checked_at: "2026-11-02" }\n    stopgap', 'checked_at: "2026-11-31" }\n    stopgap'),
      'advisory kernel-bug: Distro: checked_at "2026-11-31" is not a date',
    ],
    ["a CVE id that is not one", advisory().replace("CVE-2026-1234]", "cve 1234]"), 'advisory kernel-bug: "cve 1234" is not a CVE id'],
    [
      "a message without the domain",
      advisory().replace('ask_en: "To {vendor}: {domain}"', 'ask_en: "To {vendor}"'),
      "advisory kernel-bug: ask and ask_en need {domain}",
    ],
    [
      "a site check without the report's wording",
      advisory("    site_check: php\n"),
      "advisory kernel-bug: site_check needs fix_note, fix_note_en, references and references_en",
    ],
  ])("rejects %s", (_name, text, want) => {
    expect(validateAdvisories(loadAdvisories(text))).toContain(want);
  });
});

describe("provider entries against the advisories", () => {
  const advisories = loadAdvisories(advisory());
  const table = (body: string) => loadProviders(`updated_at: "2026-11-02"\nproviders:\n${body}`, advisories);
  const host = (id: string, kind: string, entry = "") => `  - id: ${id}\n    name: ${id}\n    name_ja: ${id}\n    kind: ${kind}\n${entry}`;
  const entry = (status: string) =>
    `    incidents:\n      kernel-bug:\n        status: ${status}\n        confidence: secondary\n        summary: s\n        summary_en: s\n        verified_at: "2026-11-02"\n`;

  it("requires an entry from each kind the advisory names in required_for, and nothing from the others", () => {
    expect(validateTable(table(host("a", "hosting") + host("b", "cloud")))).toEqual(["a: hosting provider without a kernel-bug entry"]);
  });

  it("allows n/a only on kinds outside required_for", () => {
    expect(validateTable(table(host("a", "hosting", entry("n/a")) + host("b", "cloud", entry("n/a"))))).toEqual(["a: kernel-bug: n/a on a hosting provider"]);
  });

  it("links a provider to an advisory that names its kind, with or without an entry, and to one it has an entry for", () => {
    const t = table(host("a", "hosting", entry("patched")) + host("b", "cloud") + host("c", "dns"));
    expect(t.advisoriesOf(t.get("a")!).map((x) => [x.advisory.id, x.entry?.status])).toEqual([["kernel-bug", "patched"]]);
    expect(t.advisoriesOf(t.get("b")!).map((x) => [x.advisory.id, x.entry])).toEqual([["kernel-bug", undefined]]);
    expect(t.advisoriesOf(t.get("c")!)).toEqual([]);
    expect(t.ownIncidents(t.get("a")!)).toEqual([]);
  });
});

describe("fillAsk", () => {
  it("puts the host and the domain into the message", () => {
    expect(fillAsk("To {vendor}:\nour site {domain}, again {domain}\n", "Xserver", "example.jp")).toBe("To Xserver:\nour site example.jp, again example.jp");
  });
});
