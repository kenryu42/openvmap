import { describe, expect, it } from "vitest";
import { loadProviders } from "@/lib/provider";
import { checkEvidence, holdBack, type Evidence } from "@/scripts/check-evidence";
import type { Manifest } from "@/scripts/check-sources";

const yaml = (alphaStatus: string, alphaSummary: string, updated = "2026-10-24") => `incident: php2shell
updated_at: "${updated}"
providers:
  - id: alpha
    name: Alpha Hosting
    name_ja: アルファ
    kind: hosting
    incidents:
      php2shell:
        status: ${alphaStatus}
        confidence: official
        summary: "${alphaSummary}"
        summary_en: s
        source: https://alpha.test/news/1
        verified_at: "2026-10-24"
  - id: beta
    name: Beta Server
    name_ja: ベータ
    kind: hosting
    incidents:
      php2shell:
        status: unknown
        summary: s
        summary_en: s
        verified_at: "2026-10-24"
`;
const before = loadProviders(yaml("in_progress", "作業中"));
const progressed = loadProviders(yaml("in_progress", "大半のサーバーで完了", "2026-10-26"));
const patched = loadProviders(yaml("patched", "全サーバーで完了", "2026-10-26"));

const manifest: Manifest = {
  date: "2026-10-26",
  items: [
    { kind: "page", url: "https://alpha.test/news/1", providers: ["alpha"], file: "0.txt", hash: "h0" },
    { kind: "post", url: "https://beta.test/n/9", title: "年末年始の営業について", providers: ["beta"], file: "1.txt", list: "https://beta.test/news/" },
  ],
};
const texts = {
  "https://alpha.test/news/1": "PHPの脆弱性への対応 10月26日 6:20 すべてのサーバーへの修正パッチ適用が完了しました。",
  "https://beta.test/n/9": "年末年始の営業について 12月29日から休業します。",
};
const alphaUpdated = {
  provider: "alpha",
  url: "https://alpha.test/news/1",
  change: "updated",
  quotes: ["10月26日 6:20 すべてのサーバーへの修正パッチ適用が完了しました。"],
} as const;
const betaRead = { provider: "beta", url: "https://beta.test/n/9", change: "unchanged", quotes: [] } as const;

describe("checkEvidence", () => {
  it("accepts an edit backed by quotes from the saved page, and returns every page and post handled", () => {
    const evidence: Evidence = { handled: [alphaUpdated, betaRead] };
    expect(checkEvidence(manifest, texts, evidence, before, progressed)).toEqual({
      accept: ["https://alpha.test/news/1", "https://beta.test/n/9"],
      errors: [],
      held: [],
    });
  });

  it("holds back a move to patched for a person, leaving its pages unread, and accepts the rest", () => {
    const evidence: Evidence = { handled: [alphaUpdated, betaRead] };
    expect(checkEvidence(manifest, texts, evidence, before, patched)).toEqual({ accept: ["https://beta.test/n/9"], errors: [], held: ["alpha"] });
  });

  it("leaves for a person every item not handled for each provider that cites it, and every item it could not fetch", () => {
    const shared: Manifest = {
      date: "2026-10-26",
      items: [
        { kind: "page", url: "https://alpha.test/news/1", providers: ["alpha", "beta"], file: "0.txt", hash: "h0" },
        { kind: "post", url: "https://beta.test/n/9", title: "年末年始の営業について", providers: ["beta"], file: "1.txt", list: "https://beta.test/news/" },
        { kind: "post", url: "https://alpha.test/news/12", title: "PHPについて", providers: ["alpha"], error: "HTTP 404", list: "https://alpha.test/news/" },
      ],
    };
    const r = checkEvidence(shared, texts, { handled: [alphaUpdated, betaRead] }, before, patched);
    expect(r).toEqual({ accept: ["https://beta.test/n/9"], errors: [], held: ["alpha"] });
  });

  it("matches a quote across differences in spacing and line breaks", () => {
    const evidence: Evidence = { handled: [{ ...alphaUpdated, quotes: ["10月26日  6:20\nすべてのサーバーへの修正パッチ適用が完了しました。"] }] };
    expect(checkEvidence(manifest, texts, evidence, before, patched).errors).toEqual([]);
  });

  it("rejects a quote that is not on the page", () => {
    const evidence: Evidence = { handled: [{ ...alphaUpdated, quotes: ["PHP 5.1〜8.5 のすべてに修正版を適用しました。"] }] };
    expect(checkEvidence(manifest, texts, evidence, before, patched).errors).toEqual([
      'alpha: quote not found on https://alpha.test/news/1: "PHP 5.1〜8.5 のすべてに修正版を適用しました。"',
    ]);
  });

  it("rejects an edit with no quote, or with only a fragment too short to show what the page says", () => {
    for (const quotes of [[], ["完了しました。"]]) {
      const errors = checkEvidence(manifest, texts, { handled: [{ ...alphaUpdated, quotes }] }, before, patched).errors;
      expect(errors, JSON.stringify(quotes)).toEqual(["alpha: an update needs at least one quote of 15 characters or more from the page"]);
    }
  });

  it("rejects an edited provider with no evidence, and evidence for a page that was not flagged", () => {
    const evidence: Evidence = { handled: [{ ...betaRead, url: "https://beta.test/elsewhere" }] };
    expect(checkEvidence(manifest, texts, evidence, before, patched).errors).toEqual([
      "beta: https://beta.test/elsewhere was not among the flagged pages",
      "alpha: edited without evidence",
    ]);
  });

  it("rejects a provider claimed for a page that does not cite it", () => {
    const evidence: Evidence = { handled: [alphaUpdated, { ...betaRead, url: "https://alpha.test/news/1" }] };
    expect(checkEvidence(manifest, texts, evidence, before, patched).errors).toEqual(["beta: https://alpha.test/news/1 is not one of its pages"]);
  });

  it("rejects a change that is neither updated nor unchanged", () => {
    const evidence = { handled: [{ ...betaRead, change: "skipped" }] } as unknown as Evidence;
    expect(checkEvidence(manifest, texts, evidence, before, before).errors).toEqual(['beta: change must be "updated" or "unchanged", not "skipped"']);
  });

  it("rejects an added or removed provider, or a change of incident", () => {
    const added = loadProviders(yaml("in_progress", "作業中") + `  - id: gamma\n    name: G\n    name_ja: G\n    kind: cdn\n`);
    expect(checkEvidence(manifest, texts, { handled: [] }, before, added).errors).toEqual(["gamma: providers may not be added or removed"]);
    const other = loadProviders(yaml("in_progress", "作業中").replace("incident: php2shell", "incident: other"));
    expect(checkEvidence(manifest, texts, { handled: [] }, before, other).errors).toEqual(["the incident key may not change"]);
  });
});

describe("holdBack", () => {
  it("restores the held provider's entry as committed and keeps every other edit", () => {
    const committed = yaml("in_progress", "作業中");
    const edited = yaml("patched", "全サーバーで完了", "2026-10-26").replace("status: unknown", "status: in_progress");
    const out = holdBack(committed, edited, ["alpha"]);
    const t = loadProviders(out);
    expect(t.get("alpha")).toEqual(before.get("alpha"));
    expect(t.get("beta")?.incidents.php2shell.status).toBe("in_progress");
    expect(t.updated_at).toBe("2026-10-26");
  });

  it("restores the whole file when nothing else was edited", () => {
    const committed = yaml("in_progress", "作業中");
    expect(holdBack(committed, yaml("patched", "全サーバーで完了", "2026-10-26"), ["alpha"])).toBe(committed);
  });
});
