import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/check";
import { daysSince } from "@/lib/stale";
import type { Resolver } from "@/lib/dns";
import { loadProviders } from "@/lib/provider";

const table = loadProviders(`
incident: php2shell
providers:
  - id: vercel
    name: Vercel
    name_ja: Vercel
    kind: saas
    ns_suffixes: [vercel-dns.com]
    cname_suffixes: [vercel-dns.com]
    incidents:
      php2shell:
        status: n/a
        confidence: secondary
        summary: PHPなし
        summary_en: no PHP
        customer_action: 対応不要
        customer_action_en: Nothing to do.
        verified_at: "2026-10-24"
  - id: aws
    name: Amazon Web Services
    name_ja: AWS
    kind: cloud
    asns: [16509]
`);

const resolver: Resolver = {
  resolve4: (h) => Promise.resolve(h === "nextjs.org" ? ["64.239.109.1"] : h === "www.nextjs.org" ? ["64.239.109.65"] : []),
  resolve6: () => Promise.resolve([]),
  resolveCname: (h) => Promise.resolve(h === "www.nextjs.org" ? ["7db0c515ced5a8a7.vercel-dns.com"] : []),
  resolveNs: () => Promise.resolve(["ns1.vercel-dns.com", "ns2.vercel-dns.com"]),
  resolveMx: () => Promise.resolve([]),
  resolvePtr: () => Promise.resolve([]),
  resolveTxt: (name) =>
    Promise.resolve(
      name.startsWith("AS") ? [["16509 | US | arin | 2000-05-04 | AMAZON-02 - Amazon.com, Inc., US"]] : [["16509 | 64.239.109.0/24 | US | arin | 2025-01-01"]],
    ),
};

describe("a site platform on cloud addresses", () => {
  it("names the platform, not the cloud, in the actions and the template", async () => {
    const r = await runCheck("nextjs.org", { table, resolver, version: "t", lang: "ja" });
    expect(r.providers.map((p) => p.id)).toEqual(["vercel", "aws"]);
    const joined = r.actions.join("\n");
    expect(joined).toContain("【Vercel】がサイトを自社の基盤で運用しています");
    expect(joined).not.toContain("IaaS");
    expect(r.message_template).toContain("Vercel ご担当者様");
  });

  it("still gives the IaaS advice when only the cloud matched", async () => {
    const plain = loadProviders("incident: php2shell\nproviders:\n  - id: aws\n    name: AWS\n    name_ja: AWS\n    kind: cloud\n    asns: [16509]\n");
    const r = await runCheck("nextjs.org", { table: plain, resolver, version: "t", lang: "en" });
    expect(r.actions[0]).toContain("AWS is IaaS");
    expect(r.message_template).toContain("To: AWS");
  });
});

describe("a network shared by several services of one operator", () => {
  const shared = loadProviders(`
incident: php2shell
providers:
  - id: xserver
    name: Xserver
    name_ja: エックスサーバー
    kind: hosting
    asns: [131965]
    ns_suffixes: [xserver.jp]
    incidents:
      php2shell: {status: patched, confidence: secondary, date: "2026-10-22", summary: x, summary_en: x, customer_action: x, customer_action_en: x, verified_at: "2026-10-24"}
  - id: starserver
    name: Star Rental Server
    name_ja: スターレンタルサーバー
    kind: hosting
    asns: [131965]
    ns_suffixes: [star-domain.jp]
    incidents:
      php2shell: {status: patched, confidence: secondary, date: "2026-10-23", summary: x, summary_en: x, customer_action: x, customer_action_en: x, verified_at: "2026-10-24"}
`);
  const on = (ns: string): Resolver => ({
    resolve4: (h) => Promise.resolve(h === "example.jp" ? ["162.43.112.88"] : []),
    resolve6: () => Promise.resolve([]),
    resolveCname: () => Promise.resolve([]),
    resolveNs: () => Promise.resolve([ns]),
    resolveMx: () => Promise.resolve([]),
    resolvePtr: () => Promise.resolve([]),
    resolveTxt: (name) =>
      Promise.resolve(
        name.startsWith("AS") ? [["131965 | JP | apnic | 2011-08-04 | XSERVER - Xserver Inc., JP"]] : [["131965 | 162.43.112.0/20 | JP | apnic | 2020-01-01"]],
      ),
  });
  const check = (ns: string) => runCheck("example.jp", { table: shared, resolver: on(ns), version: "t", lang: "ja" });

  it("names the service the name servers identify", async () => {
    const r = await check("ns1.star-domain.jp");
    expect(r.hosts[0].ips[0].provider_id).toBe("starserver");
    expect(r.providers.map((p) => p.id)).toEqual(["starserver"]);
    expect(r.actions[0]).toContain("【スターレンタルサーバー】");
  });

  it("names the first listed operator when nothing else identifies the service", async () => {
    const r = await check("ns1.example-dns.test");
    expect(r.hosts[0].ips[0].provider_id).toBe("xserver");
  });
});

describe("daysSince", () => {
  const jst = (s: string) => Date.parse(s + "+09:00");
  it("counts whole days in Japan time", () => {
    expect(daysSince("2026-10-24", jst("2026-10-24T23:59:00"))).toBe(0);
    expect(daysSince("2026-10-24", jst("2026-10-25T00:00:00"))).toBe(1);
    expect(daysSince("2026-10-24", jst("2026-11-01T09:00:00"))).toBe(8);
  });

  it("gives null for a date that does not parse", () => {
    expect(daysSince("soon", Date.now())).toBeNull();
  });
});
