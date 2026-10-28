import { readFileSync } from "node:fs";
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { Duplex } from "node:stream";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { checkPage, runCheck, type PageResponse, type Transport } from "@/lib/check";
import type { Resolver } from "@/lib/dns";
import { loadProviders } from "@/lib/provider";
import { addPage } from "@/lib/report";
import { httpGet } from "@/lib/http1";
import { isCloudflareAddress, isPublicAddress, safeTransport, type PinnedRequest } from "@/lib/safety";

describe("isPublicAddress", () => {
  it.each([
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "240.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "::127.0.0.1",
    "fe80::1%en0",
    "not an ip",
    "",
  ])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([
    "183.90.224.10",
    "104.16.132.229",
    "1.1.1.1",
    "100.63.255.255",
    "100.128.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "2606:4700::6810:7c60",
    "2400:52e0:1501::1189:1",
    "::ffff:104.16.132.229",
    "64:ff9b::6810:84e5",
  ])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

let server: http.Server | undefined;
const seen: { method?: string; url?: string; ua?: string }[] = [];

async function serve(handler: http.RequestListener): Promise<number> {
  seen.length = 0;
  server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, ua: req.headers["user-agent"] });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

const answers = (v4: string[], v6: string[] = []): Pick<Resolver, "resolve4" | "resolve6"> => ({
  resolve4: () => Promise.resolve(v4),
  resolve6: () => Promise.resolve(v6),
});
const ua = { "User-Agent": "vmap/test (+https://example.invalid/about)" };
const never = new AbortController().signal;
const loopbackOnly = (ip: string) => ip === "127.0.0.1";

describe("safeTransport", () => {
  it("refuses a host whose every address is private, before connecting", async () => {
    const port = await serve((_req, res) => res.end("secret"));
    const t = safeTransport({ resolver: answers(["127.0.0.1", "10.0.0.1"], ["::1"]), ports: [port] });
    await expect(t(new URL(`http://internal.test:${port}/`), ua, never)).rejects.toThrow("no public address");
    expect(seen).toHaveLength(0);
  });

  it("refuses an IP literal that is private", async () => {
    const port = await serve((_req, res) => res.end("secret"));
    const t = safeTransport({ resolver: answers([]), ports: [port] });
    await expect(t(new URL(`http://127.0.0.1:${port}/`), ua, never)).rejects.toThrow("no public address");
    await expect(t(new URL(`http://[::ffff:127.0.0.1]:${port}/`), ua, never)).rejects.toThrow("no public address");
    expect(seen).toHaveLength(0);
  });

  it("refuses a host with any address that is not public, since fetch() cannot be pinned to the others", async () => {
    const port = await serve((_req, res) => res.end("secret"));
    const t = safeTransport({ resolver: answers(["104.16.132.229", "127.0.0.1"]), ports: [port] });
    await expect(t(new URL(`http://mixed.test:${port}/`), ua, never)).rejects.toThrow("127.0.0.1 is not a public address");
    expect(seen).toHaveLength(0);
  });

  const nodePinned =
    (port: number, used: string[]): PinnedRequest =>
    async (ip, url, headers, _signal, maxBody) => {
      used.push(ip);
      const sock = net.connect(port, ip);
      await new Promise((resolve) => sock.once("connect", resolve));
      try {
        return await httpGet(Duplex.toWeb(sock) as unknown as Parameters<typeof httpGet>[0], url, headers, maxBody);
      } finally {
        sock.destroy();
      }
    };
  const noFetch = (): Promise<Response> => Promise.reject(new Error("fetch() must not be used"));

  it("connects a pinned request to the checked address, so a name that answers differently later (DNS rebinding) cannot redirect it", async () => {
    const port = await serve((_req, res) => res.end("<html>checked host</html>"));
    let lookups = 0;
    const rebinding: Pick<Resolver, "resolve4" | "resolve6"> = {
      resolve4: () => Promise.resolve(lookups++ === 0 ? ["127.0.0.1"] : ["10.9.9.9"]),
      resolve6: () => Promise.resolve([]),
    };
    const used: string[] = [];
    const t = safeTransport({ resolver: rebinding, isAllowed: loopbackOnly, ports: [port], pinned: nodePinned(port, used), fetch: noFetch });
    const res = await t(new URL(`http://rebind.test:${port}/`), ua, never);
    expect(res.body).toBe("<html>checked host</html>");
    expect(used).toEqual(["127.0.0.1"]);
    expect(lookups).toBe(1);
  });

  it("uses the Worker's sockets for http and https, and fetch() only for https to hosts entirely on Cloudflare (no sockets there)", async () => {
    const fetched: string[] = [];
    const used: string[] = [];
    const t = safeTransport({
      resolver: {
        resolve4: (h) => Promise.resolve(h === "proxied.test" ? ["104.16.132.229"] : ["104.16.132.229", "93.184.215.14"]),
        resolve6: () => Promise.resolve([]),
      },
      pinned: (ip) => (used.push(ip), Promise.resolve({ status: 200, headers: new Headers(), body: "" })),
      fetch: (u) => (fetched.push(u), Promise.resolve(new Response(""))),
    });
    await expect(t(new URL("http://proxied.test/"), ua, never)).rejects.toThrow("refused");
    await t(new URL("http://partly.test/"), ua, never);
    await t(new URL("https://partly.test/"), ua, never);
    await t(new URL("https://proxied.test/"), ua, never);
    expect(fetched).toEqual(["https://proxied.test/"]);
    expect(used).toEqual(["93.184.215.14", "93.184.215.14"]);
    expect([isCloudflareAddress("104.16.132.229"), isCloudflareAddress("2606:4700::6815:4a81"), isCloudflareAddress("93.184.215.14")]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("reaches an https site whose firewall refuses requests from Cloudflare Workers (the CF-Worker header fetch() adds)", async () => {
    const t = safeTransport({
      resolver: answers(["35.72.187.129"]),
      pinned: () => Promise.resolve({ status: 200, headers: new Headers(), body: "<html>front page</html>" }),
      fetch: () => Promise.resolve(new Response("<html>403 Forbidden</html>", { status: 403 })),
    });
    const res = await t(new URL("https://www.iosys.test/"), ua, never);
    expect(res.status).toBe(200);
    expect(res.body).toBe("<html>front page</html>");
  });

  it("sends no plain-http request to a host entirely on Cloudflare, since fetch() would look the name up again (a rebound name)", async () => {
    const fetched: string[] = [];
    const t = safeTransport({
      resolver: answers(["104.16.132.229"]),
      pinned: () => Promise.resolve({ status: 200, headers: new Headers(), body: "" }),
      fetch: (u) => (fetched.push(u), Promise.resolve(new Response("<html>internal</html>"))),
    });
    await expect(t(new URL("http://rebound.test/"), ua, never)).rejects.toThrow("rebound.test: plain http to a host only on Cloudflare's proxy refused");
    expect(fetched).toEqual([]);
  });

  it("refuses ports other than 80 and 443, other schemes and credentials", async () => {
    const t = safeTransport({ resolver: answers(["104.16.132.229"]) });
    await expect(t(new URL("http://example.jp:6379/"), ua, never)).rejects.toThrow("port 6379 refused");
    await expect(t(new URL("ftp://example.jp/"), ua, never)).rejects.toThrow("refused");
    await expect(t(new URL("http://user:pw@example.jp/"), ua, never)).rejects.toThrow("credentials");
  });

  it("makes a GET of the given path with the User-Agent that names the about page", async () => {
    const port = await serve((_req, res) => res.end("<html></html>"));
    const t = safeTransport({ resolver: answers([]), isAllowed: loopbackOnly, ports: [port] });
    const res = await t(new URL(`http://127.0.0.1:${port}/`), ua, never);
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ method: "GET", url: "/", ua: ua["User-Agent"] }]);
  });

  it("caps the body at 512 KiB however large the response", async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, "a");
    const port = await serve((_req, res) => {
      res.setHeader("Content-Length", big.length);
      res.end(big);
    });
    const t = safeTransport({ resolver: answers([]), isAllowed: loopbackOnly, ports: [port] });
    const res = await t(new URL(`http://127.0.0.1:${port}/`), ua, never);
    expect(res.body.length).toBe(512 * 1024);
  });

  it("caps the decompressed body of a gzip bomb", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(64 * 1024 * 1024, 0x61));
    const port = await serve((_req, res) => {
      res.setHeader("Content-Encoding", "gzip");
      res.end(bomb);
    });
    const t = safeTransport({ resolver: answers([]), isAllowed: loopbackOnly, ports: [port] });
    const res = await t(new URL(`http://127.0.0.1:${port}/`), ua, never);
    expect(res.body.length).toBeLessThanOrEqual(512 * 1024 + 64 * 1024);
    expect(res.body.startsWith("aaaa")).toBe(true);
  });

  it("decodes a gzip page", async () => {
    const port = await serve((_req, res) => {
      res.setHeader("Content-Encoding", "gzip");
      res.end(zlib.gzipSync(readFileSync("test/fixtures/wordpress.html")));
    });
    const t = safeTransport({ resolver: answers([]), isAllowed: loopbackOnly, ports: [port] });
    const res = await t(new URL(`http://127.0.0.1:${port}/`), ua, never);
    expect(res.body).toContain("/wp-content/");
  });

  it("gives up on a name server that does not answer", async () => {
    const t = safeTransport({ resolver: { resolve4: () => new Promise(() => {}), resolve6: () => new Promise(() => {}) }, timeoutMs: 100 });
    await expect(t(new URL("http://site.test/"), ua, never)).rejects.toThrow("timeout after 0.1 s");
  });

  it("gives up on a server that does not answer", async () => {
    const port = await serve(() => {});
    const t = safeTransport({ resolver: answers([]), isAllowed: loopbackOnly, ports: [port], timeoutMs: 200 });
    await expect(t(new URL(`http://127.0.0.1:${port}/`), ua, never)).rejects.toThrow("timeout");
  });
});

describe("redirects and candidates", () => {
  const table = loadProviders("incident: php2shell\nproviders: []\n");
  const resolver: Resolver = {
    resolve4: (h) => Promise.resolve(h === "site.test" || h === "www.site.test" ? ["104.16.132.229"] : []),
    resolve6: () => Promise.resolve([]),
    resolveCname: () => Promise.resolve([]),
    resolveNs: () => Promise.resolve([]),
    resolveMx: () => Promise.resolve([]),
    resolvePtr: () => Promise.resolve([]),
    resolveTxt: () => Promise.resolve([["13335 | 104.16.0.0/12 | US | arin | 2014-03-28"]]),
  };
  const reply = (status: number, headers: [string, string][] = [], body = ""): PageResponse => ({
    status,
    headers: new Headers(headers),
    body,
  });

  async function run(routes: Record<string, PageResponse | Error>, limits = {}) {
    const asked: string[] = [];
    const transport: Transport = (url) => {
      asked.push(url.href);
      const r = routes[url.href] ?? new Error("connection refused");
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    };
    const report = await runCheck("site.test", { table, resolver, version: "t", lang: "ja" });
    addPage(report, await checkPage("site.test", { transport, userAgent: "t", limits }), "ja", table);
    return { report, asked };
  }

  it("requests only / on each candidate, https before http", async () => {
    const { asked } = await run({});
    expect(asked).toEqual(["https://site.test/", "https://www.site.test/", "http://site.test/", "http://www.site.test/"]);
  });

  it("follows a redirect through the transport and keeps cookies and X-Powered-By from the hop", async () => {
    const { report, asked } = await run({
      "https://site.test/": reply(301, [
        ["Location", "https://www.site.test/"],
        ["Set-Cookie", "PHPSESSID=abcdefghijklmnopqrstuvwxyz; path=/"],
        ["X-Powered-By", "PHP/8.2.1"],
      ]),
      "https://www.site.test/": reply(200, [["Server", "nginx"]], "<html></html>"),
    });
    expect(asked).toEqual(["https://site.test/", "https://www.site.test/"]);
    expect(report.http).toMatchObject({ url: "https://site.test/", final_url: "https://www.site.test/", status: 200, server: "nginx" });
    expect(report.php).toMatchObject({ verdict: "likely", php_version: "8.2.1" });
    expect(report.php?.signals.map((s) => s.evidence)).toEqual(["PHP/8.2.1", "PHPSESSID"]);
  });

  it("refuses a redirect to a non-http scheme and tries the next candidate", async () => {
    const { report, asked } = await run({
      "https://site.test/": reply(302, [["Location", "file:///etc/passwd"]]),
      "https://www.site.test/": reply(200, [], "<html></html>"),
    });
    expect(asked).toEqual(["https://site.test/", "https://www.site.test/"]);
    expect(report.http?.url).toBe("https://www.site.test/");
  });

  it("stops a redirect loop after 5 redirects per candidate and 8 requests per check", async () => {
    const loop = (to: string) => reply(302, [["Location", to]]);
    const { report, asked } = await run({
      "https://site.test/": loop("https://site.test/a"),
      "https://site.test/a": loop("https://site.test/"),
      "https://www.site.test/": loop("https://www.site.test/a"),
      "https://www.site.test/a": loop("https://www.site.test/"),
    });
    expect(asked.filter((u) => u.startsWith("https://site.test/"))).toHaveLength(6);
    expect(asked).toHaveLength(8);
    expect(report.http?.error).toBe("stopped after 8 requests");
    expect(report.php).toBeUndefined();
  });

  it("does not analyse a 4xx page, tries the next candidate, and reports the status if all fail", async () => {
    const forbidden = reply(
      403,
      [
        ["Server", "cloudflare"],
        ["X-Powered-By", "PHP/7.4.33"],
      ],
      "<a href='/x.php'>",
    );
    const { report } = await run({
      "https://site.test/": forbidden,
      "https://www.site.test/": forbidden,
      "http://site.test/": forbidden,
      "http://www.site.test/": forbidden,
    });
    expect(report.php).toBeUndefined();
    expect(report.http).toMatchObject({ status: 403, server: "cloudflare" });
    expect(report.actions.some((a) => a.includes("HTTP 403"))).toBe(true);

    const second = await run({
      "https://site.test/": forbidden,
      "https://www.site.test/": reply(200, [], "<html></html>"),
    });
    expect(second.report.http?.url).toBe("https://www.site.test/");
    expect(second.report.php?.verdict).toBe("none");
  });

  it("stops at the per-check wall clock", async () => {
    const slow: Transport = (_url, _h, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const page = await checkPage("site.test", { transport: slow, userAgent: "t", limits: { checkMs: 100 } });
    expect(page.http?.error).toBe("stopped after 0.1 s");
  });

  it("counts slow DNS against the per-check wall clock", async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const slowDns: Resolver = {
      ...resolver,
      resolveCname: async (h) => (await wait(60), [`x${h}`]),
      resolveTxt: async (h) => (await wait(60), resolver.resolveTxt(h)),
    };
    const start = performance.now();
    const report = await runCheck("site.test", { table, resolver: slowDns, version: "t", lang: "en", checkMs: 150 });
    expect(performance.now() - start).toBeLessThan(300);
    expect(report.warnings?.some((w) => w.includes("stopped after 0.15 s"))).toBe(true);
  });

  it("asks Team Cymru for a network's name once, however many of its addresses a site has", async () => {
    const asked: string[] = [];
    await runCheck("site.test", {
      table,
      resolver: {
        ...resolver,
        resolve4: (h) => Promise.resolve(h === "site.test" ? ["104.16.0.1", "104.16.0.2", "104.16.0.3"] : []),
        resolveTxt: async (name) => (asked.push(name), resolver.resolveTxt(name)),
      },
      version: "t",
      lang: "en",
    });
    expect(asked.filter((n) => n.startsWith("AS"))).toEqual(["AS13335.asn.cymru.com"]);
    expect(asked.filter((n) => n.includes(".origin."))).toHaveLength(3);
  });

  it("looks up and reports at most 16 addresses per host", async () => {
    const many = Array.from({ length: 200 }, (_, i) => `104.16.${i >> 8}.${i & 255}`);
    let txt = 0;
    const report = await runCheck("site.test", {
      table,
      resolver: { ...resolver, resolve4: (h) => Promise.resolve(h === "site.test" ? many : []), resolveTxt: async (h) => (txt++, resolver.resolveTxt(h)) },
      version: "t",
      lang: "en",
    });
    expect(report.hosts[0].ips).toHaveLength(16);
    expect(txt).toBeLessThanOrEqual(32);
    expect(report.warnings).toContain("A/AAAA site.test: 200 addresses, only the first 16 checked");
  });
});
