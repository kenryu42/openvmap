import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageResponse, Transport } from "@/lib/check";
import { handlePhp, type PhpDeps } from "@/worker/php";

const wordpress = `<html><head><meta name="generator" content="WordPress 6.8.2"></head><body><a href="/wp-content/x.css"></a></body></html>`;

function site() {
  const asked: string[] = [];
  const transport: Transport = (url) => {
    asked.push(url.href);
    if (url.href !== "https://site.test/") return Promise.reject(new Error("connection refused"));
    const res: PageResponse = {
      status: 200,
      headers: new Headers([
        ["X-Powered-By", "PHP/8.3.35"],
        ["Server", "LiteSpeed"],
      ]),
      body: wordpress,
    };
    return Promise.resolve(res);
  };
  return { transport, asked };
}

function deps(transport: Transport, o: { allow?: boolean; now?: () => number } = {}) {
  const cache = new Map<string, Response>();
  const limitKeys: string[] = [];
  const d: PhpDeps = {
    transport,
    userAgent: "vmap/test",
    salt: "test-salt",
    limiter: { limit: ({ key }) => (limitKeys.push(key), Promise.resolve({ success: o.allow ?? true })) },
    cache: {
      match: (k) => Promise.resolve(cache.get(k.url)?.clone()),
      put: (k, res) => {
        cache.set(k.url, res);
        return Promise.resolve();
      },
    },
    now: o.now,
  };
  return { d, cache, limitKeys };
}

const ask = (body: unknown, init: RequestInit = {}) =>
  new Request("https://vmap.example/api/php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9", Origin: "https://vmap.example" },
    body: JSON.stringify(body),
    ...init,
  });

let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a) => void logs.push(a));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/php", () => {
  it("returns the PHP verdict from one request to the front page", async () => {
    const { transport, asked } = site();
    const res = await handlePhp(ask({ domain: "Site.test" }), deps(transport).d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { php: unknown; http: unknown; age_s: number; headers: string[] };
    expect(body.php).toMatchObject({ verdict: "likely", php_version: "8.3.35", cms: ["WordPress"] });
    expect(body.http).toMatchObject({ url: "https://site.test/", final_url: "https://site.test/", status: 200 });
    expect(body.age_s).toBe(0);
    expect(body.headers).toEqual(["server", "x-powered-by"]);
    expect(asked).toEqual(["https://site.test/"]);
  });

  it("answers the same domain from the hour's cache without contacting the site again", async () => {
    const { transport, asked } = site();
    let t = Date.UTC(2026, 9, 24, 9, 0, 0);
    const { d } = deps(transport, { now: () => t });
    await handlePhp(ask({ domain: "site.test" }), d);
    t += 25 * 60 * 1000;
    const second = (await (await handlePhp(ask({ domain: "https://SITE.test/" }), d)).json()) as { php: { verdict: string }; age_s: number };
    expect(second.php.verdict).toBe("likely");
    expect(second.age_s).toBe(25 * 60);
    expect(asked).toEqual(["https://site.test/"]);
  });

  it("keeps neither the domain nor the client address in the cache or the rate limit, and logs nothing", async () => {
    const { transport } = site();
    const { d, cache, limitKeys } = deps(transport);
    await handlePhp(ask({ domain: "site.test" }), d);
    const stored = [...cache.keys(), ...limitKeys].join("\n");
    expect(stored).not.toContain("site.test");
    expect(stored).not.toContain("203.0.113.9");
    expect(logs).toEqual([]);
  });

  it("reads the domain only from the body, so that no request log holds it in the URL", async () => {
    const { transport, asked } = site();
    const inUrl = new Request("https://vmap.example/api/php?domain=site.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9", Origin: "https://vmap.example" },
      body: JSON.stringify({}),
    });
    const res = await handlePhp(inUrl, deps(transport).d);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
    expect(asked).toEqual([]);
  });

  it("refuses what is not a public domain name without contacting anything", async () => {
    for (const domain of ["127.0.0.1", "localhost", "example.jp:8080", "", 42]) {
      const { transport, asked } = site();
      const res = await handlePhp(ask({ domain }), deps(transport).d);
      expect(res.status).toBe(400);
      expect(asked).toEqual([]);
    }
  });

  it("answers 429 with a retry time when the client is over the limit, without contacting the site", async () => {
    const { transport, asked } = site();
    const res = await handlePhp(ask({ domain: "site.test" }), deps(transport, { allow: false }).d);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(asked).toEqual([]);
  });

  it("accepts only a JSON POST, so another site's form or page cannot make a visitor's browser call it", async () => {
    const { transport, asked } = site();
    const get = await handlePhp(new Request("https://vmap.example/api/php?domain=site.test"), deps(transport).d);
    expect(get.status).toBe(405);
    const form = await handlePhp(ask({ domain: "site.test" }, { headers: { "Content-Type": "text/plain" } }), deps(transport).d);
    expect(form.status).toBe(415);
    const twoTypes = new Headers([
      ["Content-Type", "application/json"],
      ["Content-Type", "text/plain"],
      ["Origin", "https://vmap.example"],
    ]);
    const mixed = await handlePhp(ask({ domain: "site.test" }, { headers: twoTypes }), deps(transport).d);
    expect(mixed.status).toBe(415);
    expect(asked).toEqual([]);
  });

  it("accepts a JSON content type written in any case or with parameters", async () => {
    for (const type of ["Application/JSON", "application/json; charset=utf-8"]) {
      const { transport } = site();
      const res = await handlePhp(ask({ domain: "site.test" }, { headers: { "Content-Type": type, Origin: "https://vmap.example" } }), deps(transport).d);
      expect(res.status, type).toBe(200);
    }
  });

  it("answers only the site's own pages, not scripts or other sites, without contacting the site", async () => {
    const { transport, asked } = site();
    const json = { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" };
    for (const headers of [json, { ...json, Origin: "https://other.example" }, { ...json, Origin: "null" }]) {
      const res = await handlePhp(ask({ domain: "site.test" }, { headers }), deps(transport).d);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect(await res.json()).toEqual({ error: "origin" });
    }
    expect(asked).toEqual([]);
  });

  it("answers the page served by the dev server, which proxies to the Worker under another host", async () => {
    const { transport } = site();
    const viaProxy = new Request("http://127.0.0.1:8787/api/php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", "X-Forwarded-Host": "localhost:3000" },
      body: JSON.stringify({ domain: "site.test" }),
    });
    expect((await handlePhp(viaProxy, deps(transport).d)).status).toBe(200);
  });

  it("takes X-Forwarded-Host as the page's host in production too, since a script that forges it could as easily forge Origin", async () => {
    const { transport } = site();
    const forged = ask(
      { domain: "site.test" },
      {
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.9",
          Origin: "https://other.example",
          "X-Forwarded-Host": "other.example",
        },
      },
    );
    expect((await handlePhp(forged, deps(transport).d)).status).toBe(200);
  });
});
