import { describe, expect, it } from "vitest";
import { checkPage, runCheck, type PageResponse, type Transport } from "@/lib/check";
import type { Resolver } from "@/lib/dns";
import { loadProviders } from "@/lib/provider";
import { addPage, reportJson } from "@/lib/report";
import { table } from "@/lib/table";
import type { CertProbe, TlsCert } from "@/lib/tls";
import { validateTable } from "@/scripts/validate-providers";

const notFound = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));

function dns(a: Record<string, string[]>, cname: Record<string, string> = {}): Resolver {
  const cymru: Record<string, string> = {
    "46.46.46.69.origin.asn.cymru.com": "400940 | 69.46.46.0/24 | US | arin | 2026-01-22",
    "AS400940.asn.cymru.com": "400940 | US | arin | 2024-02-17 | RAILWAY - Railway, US",
    "229.132.16.104.origin.asn.cymru.com": "13335 | 104.16.0.0/12 | US | arin | 2014-03-28",
    "AS13335.asn.cymru.com": "13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US",
    "65.87.231.13.origin.asn.cymru.com": "16509 | 13.230.0.0/15 | JP | apnic | 2017-11-21",
    "AS16509.asn.cymru.com": "16509 | US | arin | 2000-05-04 | AMAZON-02 - Amazon.com, Inc., US",
  };
  return {
    resolve4: (h) => (a[h] ? Promise.resolve(a[h]) : notFound()),
    resolve6: () => notFound(),
    resolveCname: (h) => (cname[h] ? Promise.resolve([cname[h]]) : notFound()),
    resolveNs: () => notFound(),
    resolveMx: () => notFound(),
    resolvePtr: () => notFound(),
    resolveTxt: (name) => (name in cymru ? Promise.resolve([[cymru[name]]]) : notFound()),
  };
}

const site =
  (headers: Record<string, string>): Transport =>
  () =>
    Promise.resolve({ status: 200, headers: new Headers(headers), body: "<html><body>hello</body></html>" } satisfies PageResponse);

async function check(domain: string, resolver: Resolver, transport: Transport, certs?: CertProbe) {
  const r = await runCheck(domain, { table, resolver, version: "test", lang: "ja" });
  addPage(r, await checkPage(domain, { transport, userAgent: "vmap/test", certs }), "ja", table);
  return r;
}

describe("a provider's own security incident", () => {
  it("names Railway behind Cloudflare from its response header, with Railway's incident and what to do", async () => {
    const r = await check(
      "app.example.jp",
      dns({ "app.example.jp": ["104.16.132.229"] }),
      site({ server: "cloudflare", "x-railway-request-id": "abc", "x-railway-edge": "hnd1", "cf-ray": "1" }),
    );
    const railway = r.providers.find((p) => p.id === "railway");
    expect(railway?.roles).toEqual(["http"]);
    expect(railway?.evidence).toEqual(["app.example.jp response header x-railway-request-id", "app.example.jp response header x-railway-edge"]);
    expect(railway?.other_incidents?.map((i) => [i.key, i.status])).toEqual([["railway-2026-10", "in_progress"]]);

    const action = r.actions.find((a) => a.startsWith("【Railway】は「2026年10月のセキュリティ事故"));
    expect(action).toContain("提供元で失効させてから新しい値に入れ替えて再デプロイ");
    expect(r.actions.some((a) => a.startsWith("【Railway】はアプリ実行基盤（PaaS）です"))).toBe(true);
    expect(r.actions.some((a) => a.includes("（CDN）経由で配信"))).toBe(false);

    const json = reportJson(r).providers as { id: string; other_incidents?: { key: string; title: string; source: string }[] }[];
    expect(json.find((p) => p.id === "railway")?.other_incidents?.[0]).toMatchObject({
      key: "railway-2026-10",
      title: "2026年10月のセキュリティ事故（環境変数の漏えい）",
      source: "https://blog.railway.com/p/preliminary-report-october-security-incident",
    });
  });

  it("names Railway from DNS alone when the page request fails", async () => {
    const r = await check("example.jp", dns({ "www.example.jp": ["69.46.46.46"] }, { "www.example.jp": "g05ns7.up.railway.app" }), () =>
      Promise.reject(new Error("connection refused")),
    );
    expect(r.providers.find((p) => p.id === "railway")?.roles).toEqual(["cname", "web"]);
    expect(r.actions.some((a) => a.includes("2026年10月のセキュリティ事故"))).toBe(true);
  });

  it("reports Zeabur, not the AWS addresses it runs on, for a site bound by CNAME", async () => {
    const r = await check(
      "shop.example.jp",
      dns({ "shop.example.jp": ["13.231.87.65"] }, { "shop.example.jp": "hnd1.clusters.zeabur.com" }),
      site({ "x-zeabur-request-id": "hnd1::1" }),
    );
    expect(r.providers.find((p) => p.id === "zeabur")?.roles).toEqual(["cname", "http"]);
    expect(r.actions.some((a) => a.startsWith("【Zeabur】は「2026年10月のセキュリティ事故（環境変数の漏えい）とサービス終了」"))).toBe(true);
    expect(r.actions.some((a) => a.startsWith("【Zeabur】はアプリ実行基盤（PaaS）です"))).toBe(true);
    expect(r.actions.some((a) => a.startsWith("【AWS】はIaaSです"))).toBe(false);
  });

  it("adds nothing for a site whose providers have no other incident", async () => {
    const r = await check("plain.example.jp", dns({ "plain.example.jp": ["104.16.132.229"] }), site({ server: "cloudflare" }));
    expect(r.providers.map((p) => p.id)).toEqual(["cloudflare"]);
    expect(r.actions.some((a) => a.includes("セキュリティ事故"))).toBe(false);
    expect(JSON.stringify(reportJson(r))).not.toContain("other_incidents");
  });
});

describe("table rules for other incidents", () => {
  const entry = (id: string, extra: string) =>
    `  - id: ${id}\n    name: ${id}\n    name_ja: ${id}\n    kind: paas\n${extra}\n    incidents:\n      php2shell:\n        status: n/a\n        summary: s\n        summary_en: s\n        verified_at: "2026-10-24"\n      leak-2026:\n        status: in_progress\n        summary: s\n        summary_en: s\n        verified_at: "2026-10-24"`;
  const t = (body: string) => loadProviders(`incident: php2shell\nupdated_at: "2026-10-24"\nproviders:\n${body}`);

  it("requires a title for an incident other than the main one", () => {
    expect(validateTable(t(entry("a", "    cname_suffixes: [a.example]")))).toEqual([
      "a: leak-2026: title and title_en are required for an incident other than php2shell",
    ]);
  });

  it("refuses one response header under two providers", () => {
    const errors = validateTable(t(entry("a", "    http_headers: [X-Edge-Id]") + "\n" + entry("b", "    http_headers: [x-edge-id]")));
    expect(errors).toContain("http header x-edge-id is listed under both a and b");
  });
});

describe("the certificate authority behind a site's certificate", () => {
  const cf = () => dns({ "shop.example.jp": ["104.16.132.229"] });
  const page = site({ server: "cloudflare" });
  const chain =
    (...certs: TlsCert[]): CertProbe =>
    () =>
      Promise.resolve(certs);
  const emudhraLeaf = (issuer: string): TlsCert => ({ subject_cn: "shop.example.jp", issuer_cn: issuer, issuer_o: "eMudhra Inc" });

  it("warns that a certificate chaining to the root browsers removed already fails, with eMudhra's incident", async () => {
    const r = await check(
      "shop.example.jp",
      cf(),
      page,
      chain(emudhraLeaf("EM DV TLS CA - G3"), {
        subject_cn: "EM DV TLS CA - G3",
        issuer_cn: "emSign ECC Root CA - G3",
        issuer_o: "eMudhra Technologies Limited",
      }),
    );
    const ca = r.providers.find((p) => p.id === "emudhra");
    expect(ca?.roles).toEqual(["tls"]);
    expect(ca?.evidence).toEqual(["shop.example.jp certificate issued by EM DV TLS CA - G3 (eMudhra Inc)"]);
    expect(r.tls?.distrusted_root).toBe("emSign ECC Root CA - G3");
    expect(r.actions).toContain(
      "警告: shop.example.jp の証明書は「emSign ECC Root CA - G3」につながっています。このルート証明書は Firefox などで信頼されなくなっており、閲覧者のブラウザでエラーになります。至急、別の認証局の証明書に入れ替えてください。",
    );
    expect(
      r.actions.some((a) =>
        a.startsWith("このサイトの証明書は【eMudhra（emSign）】の発行です。eMudhra（emSign） は「2026年10月の中間CA秘密鍵の問題（CVE-2026-111943）」"),
      ),
    ).toBe(true);
    expect(reportJson(r).tls).toMatchObject({ host: "shop.example.jp", distrusted_root: "emSign ECC Root CA - G3" });
  });

  it("shows eMudhra's incident without the warning for a certificate under a root browsers still trust", async () => {
    const r = await check(
      "shop.example.jp",
      cf(),
      page,
      chain(emudhraLeaf("EM DV TLS CA - G2A-1"), {
        subject_cn: "EM DV TLS CA - G2A-1",
        issuer_cn: "emSign Root TLS CA - G1",
        issuer_o: "eMudhra Technologies Limited",
      }),
    );
    expect(r.providers.some((p) => p.id === "emudhra")).toBe(true);
    expect(r.tls?.distrusted_root).toBeUndefined();
    expect(r.actions.some((a) => a.startsWith("警告:"))).toBe(false);
    expect(r.actions.some((a) => a.includes("CVE-2026-111943"))).toBe(true);
  });

  it("names no certificate authority for an unaffected certificate", async () => {
    const r = await check("shop.example.jp", cf(), page, chain({ subject_cn: "shop.example.jp", issuer_cn: "YR1", issuer_o: "Let's Encrypt" }));
    expect(r.providers.map((p) => p.id)).toEqual(["cloudflare"]);
    expect(r.tls?.chain?.[0].issuer_o).toBe("Let's Encrypt");
    expect(r.actions.some((a) => a.includes("証明書"))).toBe(false);
  });

  it("reads the certificate of www when the bare domain has none, and reports a probe that fails as unchecked", async () => {
    const asked: string[] = [];
    const www: CertProbe = (host) => {
      asked.push(host);
      if (host !== "www.example.jp") return Promise.reject(new Error("example.jp: no such host"));
      return Promise.resolve([{ subject_cn: "www.example.jp", issuer_cn: "YR1", issuer_o: "Let's Encrypt" }]);
    };
    const r = await check("example.jp", dns({ "www.example.jp": ["104.16.132.229"] }), page, www);
    expect(asked).toEqual(["example.jp", "www.example.jp"]);
    expect(r.tls?.host).toBe("www.example.jp");

    const failing = await check("shop.example.jp", cf(), page, () => Promise.reject(new Error("TLS alert 70")));
    expect(failing.tls).toEqual({ host: "shop.example.jp", error: "TLS alert 70" });
    expect(failing.warnings).toContain("TLS shop.example.jp: TLS alert 70");
  });
});
