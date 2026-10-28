import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkPage, defaultUserAgent, rfc3339, runCheck, type CheckOptions, type Transport } from "@/lib/check";
import type { Resolver } from "@/lib/dns";
import { loadProviders } from "@/lib/provider";
import { addPage, finalize, ipaAlert, phpAdvisory, reportJson } from "@/lib/report";

const notFound = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));

const resolver: Resolver = {
  resolve4: (h) => (h === "example.co.jp" ? Promise.resolve(["183.90.224.10"]) : h === "www.example.co.jp" ? Promise.resolve(["104.16.132.229"]) : notFound()),
  resolve6: () => notFound(),
  resolveCname: (h) => (h === "www.example.co.jp" ? Promise.resolve(["example-co-jp.cdn.cloudflare.net"]) : notFound()),
  resolveNs: (h) => (h === "example.co.jp" ? Promise.resolve(["ns1.xserver.jp", "ns2.xserver.jp"]) : notFound()),
  resolveMx: (h) => (h === "example.co.jp" ? Promise.resolve([{ exchange: "aspmx.l.google.com", priority: 1 }]) : notFound()),
  resolvePtr: () => notFound(),
  resolveTxt: (name) => {
    const answers: Record<string, string> = {
      "10.224.90.183.origin.asn.cymru.com": "131965 | 183.90.224.0/19 | JP | apnic | 2013-11-15",
      "AS131965.asn.cymru.com": "131965 | JP | apnic | 2013-11-15 | XSERVER-AS Xserver Inc., JP",
      "229.132.16.104.origin.asn.cymru.com": "13335 | 104.16.0.0/12 | US | arin | 2014-03-28",
      "AS13335.asn.cymru.com": "13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US",
    };
    return name in answers ? Promise.resolve([[answers[name]]]) : notFound();
  },
};

const table = loadProviders(readFileSync("test/fixtures/providers.golden.yaml", "utf8"));
const wordpress = readFileSync("test/fixtures/wordpress.html");

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.setHeader("Server", "LiteSpeed");
    res.setHeader("X-Powered-By", "PHP/8.3.35");
    res.setHeader("Set-Cookie", "PHPSESSID=abcdefghijklmnopqrstuvwxyz012345; Path=/");
    res.end(wordpress);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

const toTestServer: Transport = (url, headers, signal) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      { host: "127.0.0.1", port, path: url.pathname, headers: { ...headers, Host: url.host }, servername: url.hostname, signal },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) for (const x of [v ?? []].flat()) h.append(k, x);
          resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

const options = (o: Partial<CheckOptions> = {}): CheckOptions => ({
  table,
  resolver,
  version: "test",
  lang: "ja",
  now: () => new Date(Date.UTC(2026, 9, 23, 18, 0, 0)),
  ...o,
});

async function fullCheck(domain: string, o = options()) {
  const r = await runCheck(domain, o);
  addPage(r, await checkPage(r.domain, { transport: toTestServer, userAgent: defaultUserAgent("test", "https://example.invalid/about") }), o.lang, o.table);
  return r;
}

describe("runCheck", () => {
  it("reproduces the Go golden JSON for an Xserver WordPress site", async () => {
    const r = await fullCheck("https://Example.co.jp/");

    expect(r.domain).toBe("example.co.jp");
    const roles = Object.fromEntries(r.providers.map((p) => [p.id, p.roles]));
    expect(roles.xserver).toEqual(expect.arrayContaining(["web", "ns"]));
    expect(roles.cloudflare).toEqual(expect.arrayContaining(["web", "cname"]));
    expect(roles["google-workspace"]).toEqual(["mx"]);
    expect(r.providers[0].id).toBe("xserver");
    expect(r.http?.url).toMatch(/^http:\/\//);
    expect(r.php).toMatchObject({ verdict: "likely", php_version: "8.3.35", version_status: "below_fixed_release" });
    const joined = r.actions.join("\n");
    for (const want of ["エックスサーバー", "対応完了", "8.3.35", "8.3.36", "AI脆弱性診断", ipaAlert]) {
      expect(joined).toContain(want);
    }
    expect(r.message_template).toContain("example.co.jp");
    expect(r.message_template).toContain("エックスサーバー");

    const goldenText = readFileSync("test/golden/xserver-wordpress.ja.json", "utf8");
    const json = reportJson(r);
    const drop = (j: Record<string, unknown>) => Object.fromEntries(Object.entries(j).filter(([k]) => !["checked_at", "cached", "cache_age_s"].includes(k)));
    expect(drop(json)).toEqual(drop(JSON.parse(goldenText) as Record<string, unknown>));
    expect(JSON.stringify(json, null, 2) + "\n").toBe(goldenText);

    finalize(r, "en");
    const en = r.actions.join("\n");
    expect(en).toContain("Xserver reports the fix as complete");
    expect(en).toContain("below the fixed release");
    expect(en).toContain("does not prove exposure");
    expect(en).toContain(phpAdvisory);
    expect(en).not.toContain(ipaAlert);
    expect(r.message_template).toContain(phpAdvisory);
    expect(r.message_template).not.toContain(ipaAlert);
  });

  it("reports an unresolvable domain without crashing", async () => {
    const r = await runCheck("nxdomain.test", options());
    expect(r.hosts).toEqual([]);
    expect(r.providers).toEqual([]);
    expect(r.warnings?.length).toBeGreaterThanOrEqual(2);
    expect(r.http).toBeUndefined();
    expect(r.actions[0]).toContain("解決できませんでした");
  });

  it("names the GMO service that hosts a site on GMO's shared network", async () => {
    const shipped = loadProviders(readFileSync("data/providers.yaml", "utf8"));
    const onGmo = (ns: string[], ptr?: string): Resolver => ({
      ...resolver,
      resolve4: (h) => (h === "shop.example.jp" ? Promise.resolve(["157.7.44.160"]) : notFound()),
      resolveCname: () => notFound(),
      resolveNs: (h) => (h === "shop.example.jp" ? Promise.resolve(ns) : notFound()),
      resolveMx: () => notFound(),
      resolvePtr: (name) => (ptr && name === "160.44.7.157.in-addr.arpa" ? Promise.resolve([ptr]) : notFound()),
      resolveTxt: (name) =>
        name === "160.44.7.157.origin.asn.cymru.com"
          ? Promise.resolve([["7506 | 157.7.40.0/21 | JP | apnic | 1992-08-14"]])
          : name === "AS7506.asn.cymru.com"
            ? Promise.resolve([["7506 | JP | apnic | 1992-08-14 | GMO-I-R1 - GMO Internet, Inc., JP"]])
            : notFound(),
    });
    const web = async (ns: string[], ptr?: string) => {
      const r = await runCheck("shop.example.jp", options({ table: shipped, resolver: onGmo(ns, ptr) }));
      return r.providers.filter((p) => p.roles.includes("web")).map((p) => p.id);
    };
    expect(await web(["uns01.lolipop.jp", "uns02.lolipop.jp"])).toEqual(["lolipop"]);
    expect(await web(["ns1.heteml.jp", "ns2.heteml.jp"])).toEqual(["heteml"]);
    expect(await web(["ns1.example.net"])).toEqual(["gmo-internet"]);

    const conohaNs = ["ns-a1.conoha.io", "ns-a2.conoha.io", "ns-a3.conoha.io"];
    expect(await web(conohaNs, "www144.conoha.ne.jp.")).toEqual(["conoha"]);
    expect(await web(conohaNs, "v157-7-44-160.cwit.static.cnode.io.")).toEqual(["gmo-internet"]);
    expect(await web(conohaNs)).toEqual(["gmo-internet"]);
  });

  it("names the global host that runs a site on a cloud's or a shared network", async () => {
    const shipped = loadProviders(readFileSync("data/providers.yaml", "utf8"));
    const web = async (ip: string, asn: number, asName: string, ns: string[], ptr?: string) => {
      const rev = ip.split(".").reverse().join(".");
      const on: Resolver = {
        ...resolver,
        resolve4: (h) => (h === "shop.example.com" ? Promise.resolve([ip]) : notFound()),
        resolveCname: () => notFound(),
        resolveNs: (h) => (h === "shop.example.com" ? Promise.resolve(ns) : notFound()),
        resolveMx: () => notFound(),
        resolvePtr: (name) => (ptr && name === `${rev}.in-addr.arpa` ? Promise.resolve([ptr]) : notFound()),
        resolveTxt: (name) =>
          name === `${rev}.origin.asn.cymru.com`
            ? Promise.resolve([[`${asn} | ${ip}/24 | US | arin | 2010-01-01`]])
            : name === `AS${asn}.asn.cymru.com`
              ? Promise.resolve([[`${asn} | US | arin | 2010-01-01 | ${asName}`]])
              : notFound(),
      };
      const r = await runCheck("shop.example.com", options({ table: shipped, resolver: on }));
      return r.providers.filter((p) => p.roles.includes("web")).map((p) => p.id);
    };

    const google = ["35.213.197.246", 15169, "GOOGLE - Google LLC, US"] as const;
    expect(await web(...google, ["ns1.siteground.net", "ns2.siteground.net"])).toEqual(["siteground"]);
    expect(await web(...google, ["ns1.example.net"])).toEqual(["google-cloud"]);

    const ovh = ["54.36.91.62", 16276, "OVH - OVH SAS, FR"] as const;
    expect(await web(...ovh, ["dns113.ovh.net", "ns113.ovh.net"], "cluster027.hosting.ovh.net.")).toEqual(["ovhcloud-webhosting"]);
    expect(await web(...ovh, ["dns113.ovh.net", "ns113.ovh.net"], "vps-c7ceb976.vps.ovh.net.")).toEqual(["ovhcloud"]);

    const namecheap = ["162.0.217.211", 22612, "NAMECHEAP-NET - Namecheap, Inc., US"] as const;
    expect(await web(...namecheap, ["dns1.namecheaphosting.com", "dns2.namecheaphosting.com"])).toEqual(["namecheap-hosting"]);
    expect(await web(...namecheap, ["dns1.registrar-servers.com", "dns2.registrar-servers.com"])).toEqual(["namecheap"]);

    expect(await web("147.93.77.108", 47583, "AS-HOSTINGER - Hostinger International Limited, CY", ["ns01.domaincontrol.com"])).toEqual(["hostinger"]);
  });

  it("makes no page request from the browser-side check", async () => {
    const r = await runCheck("example.co.jp", options({ lang: "en" }));
    expect(r.http).toBeUndefined();
    expect(r.php).toBeUndefined();
    expect(r.providers.map((p) => p.id)).toContain("xserver");
  });
});

describe("rfc3339", () => {
  it("prints time as Go does", () => {
    expect(rfc3339(new Date(Date.UTC(2026, 9, 23, 18, 0, 0)))).toBe("2026-10-23T18:00:00Z");
    expect(rfc3339(new Date(Date.UTC(2026, 9, 23, 18, 0, 0, 120)))).toBe("2026-10-23T18:00:00.12Z");
  });
});
