import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProviders } from "@/lib/provider";
import {
  accept,
  acceptDumped,
  acceptNews,
  checkNews,
  checkSources,
  dumpForReading,
  newsOf,
  report,
  reportFile,
  sourcesOf,
  type Hashes,
  type Seen,
} from "@/scripts/check-sources";

const table = loadProviders(`incident: php2shell
updated_at: "2026-10-24"
providers:
  - id: alpha
    name: Alpha Hosting
    name_ja: アルファ
    kind: hosting
    news: https://alpha.test/news/
    incidents:
      php2shell:
        status: in_progress
        confidence: official
        summary: s
        summary_en: s
        source: https://alpha.test/news/1
        verified_at: "2026-10-23"
  - id: beta
    name: Beta Server
    name_ja: ベータ
    kind: hosting
    incidents:
      php2shell:
        status: patched
        confidence: official
        summary: s
        summary_en: s
        source: https://beta.test/info
        verified_at: "2026-10-24"
  - id: gamma
    name: Gamma
    name_ja: ガンマ
    kind: hosting
    news: https://gamma.test/feed.xml
    incidents:
      php2shell:
        status: unknown
        summary: s
        summary_en: s
        verified_at: "2026-10-24"
`);
const sources = sourcesOf(table);

const urlOf = (input: string | URL | Request) => (input instanceof Request ? input.url : input.toString());

function web(pages: Record<string, string | number>): typeof fetch {
  return (input) => {
    const page = pages[urlOf(input)];
    if (page === undefined) return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
    return Promise.resolve(typeof page === "number" ? new Response("", { status: page }) : new Response(page));
  };
}

const alpha = `<html><head><script>var nonce="a1"</script></head><body><h1>対応状況</h1><p>PHP 8.x: 適用中</p></body></html>`;
const beta = `<html><body><p>All servers patched.</p></body></html>`;

async function baseline(): Promise<Hashes> {
  const r = await checkSources(sources, {}, { fetch: web({ "https://alpha.test/news/1": alpha, "https://beta.test/info": beta }) });
  return accept(sources, {}, r.current, ["all"]);
}

describe("check-sources", () => {
  it("watches every cited page of the shipped table, and has an accepted version for each", () => {
    const shipped = sourcesOf(loadProviders(readFileSync("data/providers.yaml", "utf8")));
    const accepted = JSON.parse(readFileSync("data/source-hashes.json", "utf8")) as Hashes;
    expect(shipped.length).toBeGreaterThan(20);
    expect(shipped.map((s) => s.url).sort()).toEqual(Object.keys(accepted).sort());
  });

  it("reports nothing while the pages match what was accepted, even if only their markup changed", async () => {
    const accepted = await baseline();
    const restyled = alpha.replace('nonce="a1"', 'nonce="b2"').replace("<p>", '<p class="new">\n  ');
    const r = await checkSources(sources, accepted, { fetch: web({ "https://alpha.test/news/1": restyled, "https://beta.test/info": beta }) });
    expect(r.changed).toEqual([]);
    expect(r.unreadable).toEqual([]);
  });

  it("reports a page whose text changed, with the provider, what the table shows and how to clear it", async () => {
    const accepted = await baseline();
    const updated = alpha.replace("適用中", "全サーバー適用完了");
    const r = await checkSources(sources, accepted, { fetch: web({ "https://alpha.test/news/1": updated, "https://beta.test/info": beta }) });
    expect(r.changed.map((s) => s.url)).toEqual(["https://alpha.test/news/1"]);

    const body = report(r, new Date(Date.UTC(2026, 9, 24, 9, 17)));
    expect(body.split("\n")[0]).toBe("<!-- vmap-source-watch: https://alpha.test/news/1 -->");
    expect(body).toContain("| Alpha Hosting (`alpha`) | [alpha.test](https://alpha.test/news/1) | in_progress | 2026-10-23 |");
    expect(body).toContain("bun run check-sources --accept alpha\n");
    expect(body).not.toContain("beta");
    expect(body).toContain("Checked 2 pages at 2026-10-24T09:17Z.");
  });

  it("does not count a page it could not read as changed, but says so in the report", async () => {
    const accepted = await baseline();
    const r = await checkSources(sources, accepted, {
      fetch: web({ "https://alpha.test/news/1": alpha.replace("8.x", "7.x"), "https://beta.test/info": 503 }),
    });
    expect(r.changed.map((s) => s.url)).toEqual(["https://alpha.test/news/1"]);
    expect(r.unreadable.map((s) => [s.url, s.error])).toEqual([["https://beta.test/info", "HTTP 503"]]);
    expect(report(r, new Date())).toContain("- [beta.test](https://beta.test/info) (beta): HTTP 503");
  });

  it("notices a change in Japanese text on a page served in EUC-JP or Shift_JIS", async () => {
    const page = (body: number[], headers: HeadersInit, meta = "") =>
      new Response(
        new Uint8Array([...new TextEncoder().encode(`<html><head>${meta}</head><body><p>`), ...body, ...new TextEncoder().encode("</p></body></html>")]),
        { headers },
      );
    const serve =
      (alphaPage: () => Response, betaPage: () => Response): typeof fetch =>
      (u) =>
        Promise.resolve(urlOf(u).startsWith("https://alpha") ? alphaPage() : betaPage());
    const kanaAInEucJp = [0xa4, 0xa2];
    const kanaIInEucJp = [0xa4, 0xa4];
    const kanaAInShiftJis = [0x82, 0xa0];
    const kanaIInShiftJis = [0x82, 0xa2];
    const eucHeader = { "Content-Type": "text/html; charset=EUC-JP" };
    const sjisMeta = '<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">';

    const before = await checkSources(
      sources,
      {},
      {
        fetch: serve(
          () => page([...kanaAInEucJp, ...kanaAInEucJp], eucHeader),
          () => page([...kanaAInShiftJis, ...kanaAInShiftJis], {}, sjisMeta),
        ),
      },
    );
    const accepted = accept(sources, {}, before.current, ["all"]);
    const after = await checkSources(sources, accepted, {
      fetch: serve(
        () => page([...kanaAInEucJp, ...kanaIInEucJp], eucHeader),
        () => page([...kanaAInShiftJis, ...kanaIInShiftJis], {}, sjisMeta),
      ),
    });
    expect(after.changed.map((s) => s.url)).toEqual(["https://alpha.test/news/1", "https://beta.test/info"]);
  });

  it("reports a page in a charset it cannot read as unreadable, not as unchanged", async () => {
    const odd = () => new Response("<p>x</p>", { headers: { "Content-Type": "text/html; charset=x-no-such-charset" } });
    const r = await checkSources(sources, await baseline(), { fetch: () => Promise.resolve(odd()) });
    expect(r.unreadable.map((s) => s.url)).toEqual(["https://alpha.test/news/1", "https://beta.test/info"]);
    expect(r.changed).toEqual([]);
  });

  it("reports a newly cited page until it is accepted", async () => {
    const r = await checkSources(
      sources,
      { "https://alpha.test/news/1": (await baseline())["https://alpha.test/news/1"] },
      {
        fetch: web({ "https://alpha.test/news/1": alpha, "https://beta.test/info": beta }),
      },
    );
    expect(r.changed.map((s) => s.url)).toEqual(["https://beta.test/info"]);
  });

  it("accepting one provider clears only its page, and drops pages the table no longer cites", async () => {
    const accepted = { ...(await baseline()), "https://old.test/gone": "0".repeat(64) };
    const pages = { "https://alpha.test/news/1": alpha + "<p>追記</p>", "https://beta.test/info": beta + "<p>update</p>" };
    const r = await checkSources(sources, accepted, { fetch: web(pages) });
    const next = accept(sources, accepted, r.current, ["alpha"]);
    expect(Object.keys(next).sort()).toEqual(["https://alpha.test/news/1", "https://beta.test/info"]);
    const after = await checkSources(sources, next, { fetch: web(pages) });
    expect(after.changed.map((s) => s.url)).toEqual(["https://beta.test/info"]);
  });
});

const alphaNews = (...posts: [string, string][]) =>
  `<html><body><nav><a href="/">ホーム</a><a href="/news/">お知らせ</a></nav><ul>${posts.map(([href, t]) => `<li><a href="${href}"><time>2026.10.2x</time> ${t}</a></li>`).join("")}</ul></body></html>`;
const gammaFeed = (...posts: [string, string][]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Gamma news</title><link>https://gamma.test/</link>${posts.map(([href, t]) => `<item><title><![CDATA[${t}]]></title><link>${href}</link></item>`).join("")}</channel></rss>`;
const news = newsOf(table);
const before = {
  "https://alpha.test/news/": alphaNews(["/news/10", "年末年始の営業について"]),
  "https://gamma.test/feed.xml": gammaFeed(["https://gamma.test/n/5", "料金改定のお知らせ"]),
};

async function seenBefore(): Promise<Seen> {
  const r = await checkNews(news, {}, { fetch: web(before) });
  return acceptNews(news, {}, r.current, ["all"]);
}

describe("check-sources: saving flagged pages for the daily update", () => {
  it("saves the text of each changed page and new post, with a manifest of who cites what", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vmap-dump-"));
    try {
      const pages = {
        "https://alpha.test/news/1": `<html><body><h1>対応状況</h1><p>PHP 8.x: 完了</p></body></html>`,
        "https://beta.test/info": beta,
        "https://alpha.test/news/": alphaNews(["/news/11", "PHPの脆弱性について"], ["/news/10", "年末年始の営業について"]),
        "https://gamma.test/feed.xml": before["https://gamma.test/feed.xml"],
        "https://alpha.test/news/11": `<html><body><p>PHPの脆弱性について、全サーバーで対応しました。</p></body></html>`,
      };
      const r = await checkSources(sources, await baseline(), { fetch: web(pages) });
      const n = await checkNews(news, await seenBefore(), { fetch: web(pages) });
      const m = await dumpForReading(r, n, dir, "2026-10-26", { fetch: web(pages) });

      expect(m).toEqual({
        date: "2026-10-26",
        items: [
          { kind: "page", url: "https://alpha.test/news/1", providers: ["alpha"], file: "0.txt", hash: r.current["https://alpha.test/news/1"] },
          {
            kind: "post",
            url: "https://alpha.test/news/11",
            title: "2026.10.2x PHPの脆弱性について",
            providers: ["alpha"],
            file: "1.txt",
            list: "https://alpha.test/news/",
            hash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
          },
        ],
      });
      expect(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"))).toEqual(m);
      expect(readFileSync(path.join(dir, "0.txt"), "utf8")).toBe("対応状況 PHP 8.x: 完了");
      expect(readFileSync(path.join(dir, "1.txt"), "utf8")).toBe("PHPの脆弱性について、全サーバーで対応しました。");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists a post it could not fetch with the error, and saves no text for it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vmap-dump-"));
    try {
      const pages = { ...before, "https://alpha.test/news/": alphaNews(["/news/11", "PHPの脆弱性について"], ["/news/10", "年末年始の営業について"]) };
      const r = await checkSources(sources, await baseline(), { fetch: web({ "https://alpha.test/news/1": alpha, "https://beta.test/info": beta }) });
      const n = await checkNews(news, await seenBefore(), { fetch: web(pages) });
      const m = await dumpForReading(r, n, dir, "2026-10-26", { fetch: web({ ...pages, "https://alpha.test/news/11": 404 }) });
      expect(m.items).toEqual([
        {
          kind: "post",
          url: "https://alpha.test/news/11",
          title: "2026.10.2x PHPの脆弱性について",
          providers: ["alpha"],
          list: "https://alpha.test/news/",
          error: "HTTP 404",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records a handled post that the table now cites as its source as a read page, and drops a page no longer cited", () => {
    const m = {
      date: "2026-10-26",
      items: [
        { kind: "page" as const, url: "https://alpha.test/news/1", providers: ["alpha"], file: "0.txt", hash: "old-notice" },
        { kind: "post" as const, url: "https://alpha.test/news/11", providers: ["alpha"], file: "1.txt", list: "https://alpha.test/news/", hash: "new-notice" },
      ],
    };
    const cited = new Set(["https://alpha.test/news/11", "https://beta.test/info"]);
    const r = acceptDumped(
      m,
      ["https://alpha.test/news/1", "https://alpha.test/news/11"],
      { "https://alpha.test/news/1": "x", "https://beta.test/info": "b" },
      {},
      cited,
    );
    expect(r.hashes).toEqual({ "https://alpha.test/news/11": "new-notice", "https://beta.test/info": "b" });
    expect(r.seen).toEqual({ "https://alpha.test/news/": ["https://alpha.test/news/11"] });
  });

  it("records as read exactly the items handled, as they were saved, and nothing else", () => {
    const m = {
      date: "2026-10-26",
      items: [
        { kind: "page" as const, url: "https://alpha.test/news/1", providers: ["alpha"], file: "0.txt", hash: "saved-hash" },
        { kind: "page" as const, url: "https://beta.test/info", providers: ["beta"], file: "1.txt", hash: "beta-hash" },
        { kind: "post" as const, url: "https://alpha.test/news/11", providers: ["alpha"], file: "2.txt", list: "https://alpha.test/news/" },
        { kind: "post" as const, url: "https://gamma.test/n/6", providers: ["gamma"], file: "3.txt", list: "https://gamma.test/feed.xml" },
      ],
    };
    const hashes = { "https://alpha.test/news/1": "old", "https://beta.test/info": "old-beta" };
    const seen = { "https://alpha.test/news/": ["https://alpha.test/news/10"], "https://gamma.test/feed.xml": ["https://gamma.test/n/5"] };
    const cited = new Set(["https://alpha.test/news/1", "https://beta.test/info"]);
    expect(acceptDumped(m, ["https://alpha.test/news/1", "https://alpha.test/news/11"], hashes, seen, cited)).toEqual({
      hashes: { "https://alpha.test/news/1": "saved-hash", "https://beta.test/info": "old-beta" },
      seen: {
        "https://alpha.test/news/": ["https://alpha.test/news/10", "https://alpha.test/news/11"],
        "https://gamma.test/feed.xml": ["https://gamma.test/n/5"],
      },
    });
  });
});

describe("check-sources: pages that refuse the watcher's network", () => {
  const relay = { url: "https://vmap.test/api/source", token: "t0ken" };
  const asked: string[] = [];
  const net = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    if (url === relay.url) {
      const body = init?.body;
      asked.push((JSON.parse(typeof body === "string" ? body : "") as { url: string }).url);
      if (new Headers(init?.headers).get("authorization") !== `Bearer ${relay.token}`) return new Response("", { status: 401 });
      return new Response(beta);
    }
    return web({ "https://alpha.test/news/1": alpha, "https://beta.test/info": 403 })(input, init);
  }) as typeof fetch;

  it("reads a page that answers 403 through the relay, and only that page", async () => {
    asked.length = 0;
    const r = await checkSources(sources, await baseline(), { fetch: net, relay });
    expect(r.unreadable).toEqual([]);
    expect(r.changed).toEqual([]);
    expect(asked).toEqual(["https://beta.test/info"]);
  });

  it("still reports the page as unreadable without a relay", async () => {
    const r = await checkSources(sources, await baseline(), { fetch: net });
    expect(r.unreadable.map((s) => [s.url, s.error])).toEqual([["https://beta.test/info", "HTTP 403"]]);
  });

  it("reports the relay's refusal rather than the page's", async () => {
    const r = await checkSources(sources, await baseline(), { fetch: net, relay: { ...relay, token: "wrong" } });
    expect(r.unreadable.map((s) => [s.url, s.error])).toEqual([["https://beta.test/info", "HTTP 403, and the relay answered HTTP 401"]]);
  });
});

describe("check-sources: provider news lists", () => {
  it("watches the news list of every hosting provider in the shipped table that has one, and has a baseline for each", () => {
    const shipped = loadProviders(readFileSync("data/providers.yaml", "utf8"));
    const seen = JSON.parse(readFileSync("data/news-seen.json", "utf8")) as Seen;
    const pages = newsOf(shipped);
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.map((p) => p.url).sort()).toEqual(Object.keys(seen).sort());
    const unwatched = shipped.providers.filter((p) => p.kind === "hosting" && !p.news).map((p) => p.id);
    expect(unwatched).toEqual(["gmo-internet"]);
  });

  it("reports a new post that mentions PHP or a vulnerability, with its title, link and provider", async () => {
    const pages = {
      "https://alpha.test/news/": alphaNews(["/news/11", "【重要】PHPの脆弱性（CVE-2026-109618）への対応について"], ["/news/10", "年末年始の営業について"]),
      "https://gamma.test/feed.xml": gammaFeed(["https://gamma.test/n/6", "Security update for our servers"], ["https://gamma.test/n/5", "料金改定のお知らせ"]),
    };
    const r = await checkNews(news, await seenBefore(), { fetch: web(pages) });
    expect(r.posts.map((p) => [p.page.providers[0].id, p.url, p.title])).toEqual([
      ["alpha", "https://alpha.test/news/11", "2026.10.2x 【重要】PHPの脆弱性（CVE-2026-109618）への対応について"],
      ["gamma", "https://gamma.test/n/6", "Security update for our servers"],
    ]);

    const body = report(
      await checkSources(sources, await baseline(), { fetch: web({ "https://alpha.test/news/1": alpha, "https://beta.test/info": beta }) }),
      new Date(Date.UTC(2026, 9, 26, 3, 17)),
      r,
    );
    expect(body.split("\n")[0]).toBe("<!-- vmap-source-watch: https://alpha.test/news/11 https://gamma.test/n/6 -->");
    expect(body).toContain("| Alpha Hosting (`alpha`) | [2026.10.2x 【重要】PHPの脆弱性（CVE-2026-109618）への対応について](https://alpha.test/news/11) |");
    expect(body).toContain("bun run check-sources --accept alpha gamma\n");
  });

  it("reports a fix announced as an emergency or a service pause, as several providers did for php2shell", async () => {
    const pages = {
      "https://alpha.test/news/": alphaNews(
        ["/news/13", "予防的な安全対策に伴う公式サイト・管理画面等の一時停止のお知らせ"],
        ["/news/12", "【ホスティング】緊急メンテナンス作業完了のお知らせ"],
        ["/news/10", "年末年始の営業について"],
      ),
      "https://gamma.test/feed.xml": gammaFeed(["https://gamma.test/n/6", "Emergency maintenance completed"], ["https://gamma.test/n/5", "料金改定のお知らせ"]),
    };
    const r = await checkNews(news, await seenBefore(), { fetch: web(pages) });
    expect(r.posts.map((p) => p.url)).toEqual(["https://alpha.test/news/13", "https://alpha.test/news/12", "https://gamma.test/n/6"]);
  });

  it("stays quiet about new posts that mention neither, such as maintenance or pricing", async () => {
    const pages = {
      "https://alpha.test/news/": alphaNews(["/news/12", "メールサーバーのメンテナンスについて"], ["/news/10", "年末年始の営業について"]),
      "https://gamma.test/feed.xml": gammaFeed(["https://gamma.test/n/5", "料金改定のお知らせ"]),
    };
    const r = await checkNews(news, await seenBefore(), { fetch: web(pages) });
    expect(r.posts).toEqual([]);
    expect(r.unbaselined).toEqual([]);
    expect(r.unreadable).toEqual([]);
  });

  it("reports a news list it has no baseline for, and one it could not read, without inventing posts", async () => {
    const seen = await seenBefore();
    delete seen["https://gamma.test/feed.xml"];
    const r = await checkNews(news, seen, {
      fetch: web({ "https://alpha.test/news/": 403, "https://gamma.test/feed.xml": before["https://gamma.test/feed.xml"] }),
    });
    expect(r.posts).toEqual([]);
    expect(r.unbaselined.map((p) => p.url)).toEqual(["https://gamma.test/feed.xml"]);
    expect(r.unreadable.map((p) => [p.url, p.error])).toEqual([["https://alpha.test/news/", "HTTP 403"]]);
  });

  it("reports a news list that shows no posts, such as a bot check page, as unreadable rather than quiet", async () => {
    const challenge = "<html><body><p>Checking your browser before accessing the site.</p></body></html>";
    const r = await checkNews(news, await seenBefore(), { fetch: web({ ...before, "https://alpha.test/news/": challenge }) });
    expect(r.unreadable.map((p) => [p.url, p.error])).toEqual([
      ["https://alpha.test/news/", 'no posts found: a bot check or a page built by script has no links, so this is not "nothing new"'],
    ]);
    expect(r.posts).toEqual([]);
  });

  it("accepting a provider clears its new posts and leaves the others reported", async () => {
    const seen = await seenBefore();
    const pages = {
      "https://alpha.test/news/": alphaNews(["/news/11", "PHPの脆弱性について"], ["/news/10", "年末年始の営業について"]),
      "https://gamma.test/feed.xml": gammaFeed(["https://gamma.test/n/6", "不正アクセスに関するお知らせ"], ["https://gamma.test/n/5", "料金改定のお知らせ"]),
    };
    const r = await checkNews(news, seen, { fetch: web(pages) });
    const next = acceptNews(news, seen, r.current, ["alpha"]);
    const after = await checkNews(news, next, { fetch: web(pages) });
    expect(after.posts.map((p) => p.url)).toEqual(["https://gamma.test/n/6"]);
  });

  it("tells the vendor-sources workflow to update the issue, close it, or leave the earlier report standing", async () => {
    const pages = { "https://alpha.test/news/1": alpha, "https://beta.test/info": beta };
    const at = new Date(Date.UTC(2026, 9, 26, 3, 17));
    const seen = await seenBefore();
    const quietNews = await checkNews(news, seen, { fetch: web(before) });
    const sourcesRead = await checkSources(sources, await baseline(), { fetch: web(pages) });

    const changed = await checkSources(sources, await baseline(), { fetch: web({ ...pages, "https://beta.test/info": "<p>Patching.</p>" }) });
    expect(reportFile(changed, quietNews, at)).toEqual({ action: "update-issue", body: report(changed, at, quietNews) });

    expect(reportFile(sourcesRead, quietNews, at)).toEqual({ action: "close-issue" });

    const sourceUnreadable = await checkSources(sources, await baseline(), { fetch: web({ ...pages, "https://beta.test/info": 503 }) });
    expect(reportFile(sourceUnreadable, quietNews, at)).toEqual({ action: "keep-earlier-report" });
    const newsUnreadable = await checkNews(news, seen, { fetch: web({ ...before, "https://alpha.test/news/": 403 }) });
    expect(reportFile(sourcesRead, newsUnreadable, at)).toEqual({ action: "keep-earlier-report" });
  });
});
