import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { incidentOf, loadProviders, type Provider } from "@/lib/provider";

const fixture = `
incident: php2shell
updated_at: "2026-10-23"
providers:
  - id: xserver
    name: Xserver
    name_ja: エックスサーバー
    kind: hosting
    asns: [131965]
    as_name_contains: [XSERVER]
    ns_suffixes: [xserver.jp]
    incidents:
      php2shell:
        status: patched
        confidence: official
        summary: done
        summary_en: done
        customer_action: none
        customer_action_en: none
        verified_at: "2026-10-23"
  - id: cloudflare
    name: Cloudflare
    name_ja: Cloudflare
    kind: cdn
    asns: [13335]
    ns_suffixes: [ns.cloudflare.com]
    cname_suffixes: [cdn.cloudflare.net]
  - id: google
    name: Google
    name_ja: Google
    kind: mail
    mx_suffixes: [google.com, googlemail.com]
  - id: aws
    name: AWS
    name_ja: AWS
    kind: cloud
    ns_contains: [awsdns]
`;

const tbl = loadProviders(fixture);

describe("byAsn", () => {
  it("matches the ASN, then the AS name", () => {
    expect(tbl.byAsn(131965, "")?.id).toBe("xserver");
    expect(tbl.byAsn(1, "XSERVER-AS XServer Inc., JP")?.id).toBe("xserver");
    expect(tbl.byAsn(1, "SAKURA-A SAKURA Internet Inc., JP")).toBeUndefined();
  });
});

describe("suffix matching", () => {
  it.each<[(h: string) => Provider | undefined, string, string]>([
    [(h) => tbl.byNs(h), "ns1.xserver.jp.", "xserver"],
    [(h) => tbl.byNs(h), "NS3.XSERVER.JP", "xserver"],
    [(h) => tbl.byNs(h), "notxserver.jp", ""],
    [(h) => tbl.byNs(h), "ns1.dns.ne.jp", ""],
    [(h) => tbl.byNs(h), "amy.ns.cloudflare.com", "cloudflare"],
    [(h) => tbl.byNs(h), "ns-1234.awsdns-27.org", "aws"],
    [(h) => tbl.byCname(h), "example.cdn.cloudflare.net", "cloudflare"],
    [(h) => tbl.byMx(h), "aspmx.l.google.com.", "google"],
    [(h) => tbl.byMx(h), "", ""],
  ])("%#: %s → %s", (fn, host, want) => {
    expect(fn(host)?.id ?? "").toBe(want);
  });
});

describe("incidentOf", () => {
  it("returns the entry, or nothing", () => {
    expect(incidentOf(tbl.get("xserver"), "php2shell")?.status).toBe("patched");
    expect(incidentOf(tbl.get("cloudflare"), "php2shell")).toBeUndefined();
    expect(incidentOf(undefined, "php2shell")).toBeUndefined();
  });
});

describe("loadProviders", () => {
  it.each([
    "providers:\n  - id: a\n    kind: nope\n",
    "providers:\n  - id: a\n    kind: hosting\n  - id: a\n    kind: hosting\n",
    "providers:\n  - id: a\n    kind: hosting\n    incidents:\n      x:\n        status: fixed\n",
    "providers:\n  - id: a\n    kind: hosting\n    incidents:\n      x:\n        status: patched\n        confidence: rumor\n",
    "providers:\n  - id: a\n    kind: hosting\n    asns: [AS13335]\n",
    "providers:\n  - kind: hosting\n",
    "providers:\n  - id: a\n    kind: hosting\n    notes: {ja: x}\n",
    "providers:\n  - id: a\n    kind: hosting\n    news: [https://a.example/]\n",
    "providers: [",
  ])("rejects %j", (bad) => {
    expect(() => loadProviders(bad)).toThrow(/^providers: /);
  });

  it("parses the shipped table and every hosting provider has a php2shell entry", () => {
    const t = loadProviders(readFileSync("data/providers.yaml", "utf8"));
    expect(t.incident).toBe("php2shell");
    for (const id of ["xserver", "sakura", "lolipop", "conoha", "cloudflare", "aws"]) {
      expect(t.get(id), id).toBeDefined();
    }
    for (const p of t.providers) {
      const inc = incidentOf(p, "php2shell");
      if (p.kind === "hosting") expect(inc, p.id).toBeDefined();
      if (inc?.confidence === "official") expect(inc.source, p.id).toBeTruthy();
    }
  });

  it("does not take another network of the same company for the cloud", () => {
    const t = loadProviders(readFileSync("data/providers.yaml", "utf8"));
    expect(t.byAsn(16591, "GOOGLE-FIBER - Google Fiber Inc., US")).toBeUndefined();
    expect(t.byAsn(19527, "GOOGLE-CLOUD-PLATFORM - Google LLC, US")?.id).toBe("google-cloud");
    expect(t.byAsn(8987, "AMAZON-EXPANSION - Amazon Data Services Ireland Ltd, IE")?.id).toBe("aws");
    expect(t.byAsn(64512, "AMAZONAS-TELECOM - Example, BR")).toBeUndefined();
  });
});
