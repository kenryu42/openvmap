import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProviders } from "@/lib/provider";
import { citedUrls, handleSource } from "@/worker/source";

const shipped = loadProviders(readFileSync("data/providers.yaml", "utf8"));
const allowed = citedUrls(shipped);
const conoha = "https://www.conoha.jp/wing/news/?ap=2015054909";

function vendors() {
  const asked: string[] = [];
  const get: typeof fetch = (input) => {
    asked.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(new Response("<html><title>ConoHa</title></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  };
  return { get, asked };
}

const ask = (url: string, token = "s3cret") =>
  new Request("https://vmap.example/api/source", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });

describe("POST /api/source", () => {
  it("covers every page and news list the table cites", () => {
    expect(allowed.has(conoha)).toBe(true);
    expect(allowed.has("https://www.conoha.jp/wing/news/")).toBe(true);
    expect(allowed.has("https://doc.cloud.global.fujitsu.com/jp/information/info20261023-51211.html")).toBe(true);
  });

  it("fetches a cited page for the watcher and passes its status, type and body through", async () => {
    const { get, asked } = vendors();
    const res = await handleSource(ask(conoha), { token: "s3cret", allowed, fetch: get });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<html><title>ConoHa</title></html>");
    expect(asked).toEqual([conoha]);
  });

  it("refuses a caller without the token, and any URL the table does not cite, without fetching anything", async () => {
    const { get, asked } = vendors();
    expect((await handleSource(ask(conoha, "guess"), { token: "s3cret", allowed, fetch: get })).status).toBe(401);
    expect((await handleSource(ask("https://example.com/"), { token: "s3cret", allowed, fetch: get })).status).toBe(403);
    expect((await handleSource(ask(conoha, ""), { token: "", allowed, fetch: get })).status).toBe(404);
    expect((await handleSource(new Request("https://vmap.example/api/source"), { token: "s3cret", allowed, fetch: get })).status).toBe(405);
    expect(asked).toEqual([]);
  });
});
