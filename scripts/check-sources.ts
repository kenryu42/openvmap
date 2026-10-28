import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoUrl, version } from "../lib/meta";
import { loadProviders, type Table } from "../lib/provider";

export type Hashes = Record<string, string>;

export interface Source {
  url: string;
  providers: { id: string; name: string; status: string; verified_at: string }[];
}

export interface SourceCheck {
  changed: Source[];
  unreadable: (Source & { error: string })[];
  current: Hashes;
  checked: number;
}

export function sourcesOf(t: Table): Source[] {
  const byUrl = new Map<string, Source>();
  for (const p of t.providers) {
    for (const i of Object.values(p.incidents)) {
      if (!i.source) continue;
      const s = byUrl.get(i.source) ?? { url: i.source, providers: [] };
      s.providers.push({ id: p.id, name: p.name, status: i.status, verified_at: i.verified_at });
      byUrl.set(i.source, s);
    }
  }
  return [...byUrl.values()];
}

export function decode(bytes: Uint8Array, contentType: string | null): string {
  const named = (s: string | null | undefined) => s?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const charset = named(contentType) ?? named(head.match(/<meta[^>]+charset[^>]*>/i)?.[0]) ?? "utf-8";
  return new TextDecoder(charset).decode(bytes);
}

export function pageText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Relay {
  url: string;
  token: string;
}

export async function checkSources(sources: Source[], accepted: Hashes, o: { fetch?: typeof fetch; relay?: Relay } = {}): Promise<SourceCheck> {
  const get = o.fetch ?? fetch;
  const result: SourceCheck = { changed: [], unreadable: [], current: {}, checked: sources.length };
  await Promise.all(
    sources.map(async (s) => {
      try {
        const hash = await sha256(pageText(await read(s.url, get, o.relay)));
        result.current[s.url] = hash;
        if (accepted[s.url] !== hash) result.changed.push(s);
      } catch (err) {
        result.unreadable.push({ ...s, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  const order = new Map(sources.map((s, n) => [s.url, n]));
  const byOrder = (a: Source, b: Source) => order.get(a.url)! - order.get(b.url)!;
  result.changed.sort(byOrder);
  result.unreadable.sort(byOrder);
  return result;
}

async function read(url: string, get: typeof fetch, relay?: Relay): Promise<string> {
  let res = await get(url, {
    headers: { "User-Agent": `OpenVMap/${version} source watch (+${repoUrl})` },
    signal: AbortSignal.timeout(20_000),
  });
  const refusedThisNetworkNotThePage = res.status === 403 || res.status === 429;
  if (relay && refusedThisNetworkNotThePage) {
    const direct = res.status;
    res = await get(relay.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${relay.token}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${direct}, and the relay answered HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return decode(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type"));
}

export interface Manifest {
  date: string;
  items: ManifestItem[];
}

export interface ManifestItem {
  kind: "page" | "post";
  url: string;
  title?: string;
  providers: string[];
  file?: string;
  hash?: string;
  list?: string;
  error?: string;
}

export async function dumpForReading(
  r: SourceCheck,
  n: NewsCheck,
  dir: string,
  date: string,
  o: { fetch?: typeof fetch; relay?: Relay } = {},
): Promise<Manifest> {
  const get = o.fetch ?? fetch;
  const wanted: Omit<ManifestItem, "file" | "hash" | "error">[] = [
    ...r.changed.map((s) => ({ kind: "page" as const, url: s.url, providers: s.providers.map((p) => p.id) })),
    ...n.posts.map((p) => ({ kind: "post" as const, url: p.url, title: p.title, providers: p.page.providers.map((v) => v.id), list: p.page.url })),
  ];
  mkdirSync(dir, { recursive: true });
  const items: ManifestItem[] = [];
  for (const w of wanted) {
    try {
      const text = pageText(await read(w.url, get, o.relay));
      const file = `${items.filter((i) => i.file).length}.txt`;
      writeFileSync(path.join(dir, file), text);
      items.push({ ...w, file, hash: await sha256(text) });
    } catch (err) {
      items.push({ ...w, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const m = { date, items };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return m;
}

export function acceptDumped(m: Manifest, urls: readonly string[], hashes: Hashes, seen: Seen, cited: ReadonlySet<string>): { hashes: Hashes; seen: Seen } {
  const next = {
    hashes: Object.fromEntries(Object.entries(hashes).filter(([url]) => cited.has(url))),
    seen: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]])),
  };
  for (const i of m.items) {
    if (!i.file || !urls.includes(i.url)) continue;
    if (i.hash && cited.has(i.url)) next.hashes[i.url] = i.hash;
    if (i.kind === "post" && i.list && !next.seen[i.list]?.includes(i.url)) next.seen[i.list] = [...(next.seen[i.list] ?? []), i.url];
  }
  return next;
}

export function accept(sources: Source[], accepted: Hashes, current: Hashes, ids: string[]): Hashes {
  const next: Hashes = {};
  for (const s of sources) {
    const chosen = ids.includes("all") || s.providers.some((p) => ids.includes(p.id));
    const hash = chosen && current[s.url] ? current[s.url] : accepted[s.url];
    if (hash) next[s.url] = hash;
  }
  return next;
}

export type Seen = Record<string, string[]>;

export interface NewsPage {
  url: string;
  providers: { id: string; name: string }[];
}

export interface Post {
  url: string;
  title: string;
}

export interface NewsCheck {
  posts: (Post & { page: NewsPage })[];
  unbaselined: NewsPage[];
  unreadable: (NewsPage & { error: string })[];
  current: Seen;
  checked: number;
}

export const watchWords =
  /php|脆弱性|ぜい弱性|セキュリティ|cve-|不正アクセス|漏えい|漏洩|情報流出|インシデント|証明書|緊急|一時停止|安全対策|security|vulnerab|incident|breach|exploit|emergency/i;

export function newsOf(t: Table): NewsPage[] {
  const byUrl = new Map<string, NewsPage>();
  for (const p of t.providers) {
    if (!p.news) continue;
    const n = byUrl.get(p.news) ?? { url: p.news, providers: [] };
    n.providers.push({ id: p.id, name: p.name });
    byUrl.set(p.news, n);
  }
  return [...byUrl.values()];
}

export function postsOf(body: string, base: string): Post[] {
  const found = new Map<string, string>();
  const add = (href: string, title: string) => {
    let url: URL;
    try {
      url = new URL(entities(href.trim()), base);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    url.hash = "";
    const t = entities(pageText(title));
    if (!found.has(url.href) || t.length > found.get(url.href)!.length) found.set(url.href, t);
  };
  if (/^\s*(<\?xml|<rss|<feed)/i.test(body)) {
    for (const [item] of body.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
      const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      const link = item.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ?? item.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
      if (link) add(link, title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    }
  } else {
    for (const [, href, inner] of body.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(href, inner);
  }
  return [...found].map(([url, title]) => ({ url, title }));
}

function entities(s: string): string {
  return s
    .replace(/&#(\d+);|&#x([0-9a-f]+);/gi, (m: string, d: string | undefined, h: string) => {
      const n = d ? Number(d) : parseInt(h, 16);
      return n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export async function checkNews(pages: NewsPage[], seen: Seen, o: { fetch?: typeof fetch; relay?: Relay } = {}): Promise<NewsCheck> {
  const get = o.fetch ?? fetch;
  const result: NewsCheck = { posts: [], unbaselined: [], unreadable: [], current: {}, checked: pages.length };
  const found = new Map<string, Post[]>();
  await Promise.all(
    pages.map(async (page) => {
      try {
        const posts = postsOf(await read(page.url, get, o.relay), page.url);
        if (posts.length === 0) throw new Error('no posts found: a bot check or a page built by script has no links, so this is not "nothing new"');
        result.current[page.url] = posts.map((p) => p.url).sort();
        found.set(page.url, posts);
      } catch (err) {
        result.unreadable.push({ ...page, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  for (const page of pages) {
    const posts = found.get(page.url);
    if (!posts) continue;
    const known = seen[page.url];
    if (!known) {
      result.unbaselined.push(page);
      continue;
    }
    const old = new Set(known);
    for (const p of posts) if (!old.has(p.url) && watchWords.test(p.title)) result.posts.push({ ...p, page });
  }
  const order = new Map(pages.map((p, n) => [p.url, n]));
  result.unreadable.sort((a, b) => order.get(a.url)! - order.get(b.url)!);
  return result;
}

export function acceptNews(pages: NewsPage[], seen: Seen, current: Seen, ids: string[]): Seen {
  const next: Seen = {};
  for (const page of pages) {
    const chosen = ids.includes("all") || page.providers.some((p) => ids.includes(p.id));
    const posts = chosen && current[page.url] ? current[page.url] : seen[page.url];
    if (posts) next[page.url] = posts;
  }
  return next;
}

export function report(r: SourceCheck, at: Date, news?: NewsCheck): string {
  const posts = news?.posts ?? [];
  const unbaselined = news?.unbaselined ?? [];
  const ids = [
    ...new Set(
      [...r.changed.flatMap((s) => s.providers), ...posts.flatMap((p) => p.page.providers), ...unbaselined.flatMap((n) => n.providers)].map((p) => p.id),
    ),
  ];
  const lines = [`<!-- vmap-source-watch: ${[...r.changed.map((s) => s.url), ...posts.map((p) => p.url)].join(" ")} -->`];
  if (r.changed.length > 0) {
    lines.push(
      "These vendor pages differ from the version last accepted in `data/source-hashes.json` (or have none yet). The page may have only gained an unrelated line, so read it before changing anything.",
      "",
      "| Provider | Page | Status shown | Verified |",
      "| --- | --- | --- | --- |",
      ...r.changed.map((s) => s.providers.map((p) => `| ${p.name} (\`${p.id}\`) | [${host(s.url)}](${s.url}) | ${p.status} | ${p.verified_at} |`).join("\n")),
      "",
    );
  }
  if (posts.length > 0) {
    lines.push(
      "New posts on vendor news lists whose title mentions PHP, a vulnerability, security, an emergency or a pause. A provider may have announced something the table does not show yet.",
      "",
      "| Provider | Post |",
      "| --- | --- |",
      ...posts.map((p) => `| ${p.page.providers.map((v) => `${v.name} (\`${v.id}\`)`).join(", ")} | [${p.title.replace(/[|[\]]/g, " ")}](${p.url}) |`),
      "",
    );
  }
  if (unbaselined.length > 0) {
    lines.push("News lists with no accepted posts yet, so nothing on them counts as new:", "");
    for (const n of unbaselined) lines.push(`- [${host(n.url)}](${n.url}) (${n.providers.map((p) => p.id).join(", ")})`);
    lines.push("");
  }
  lines.push(
    "For each one: read it, update the provider in `data/providers.yaml` (status, summaries, source, `verified_at`) if it changes anything, then record it as read and commit the data files:",
    "",
    "```sh",
    `bun run check-sources --accept ${ids.join(" ")}`,
    "```",
  );
  const unreadable = [...r.unreadable, ...(news?.unreadable ?? [])];
  if (unreadable.length > 0) {
    lines.push("", "Could not be read this time (not counted as a change):", "");
    for (const s of unreadable) lines.push(`- [${host(s.url)}](${s.url}) (${s.providers.map((p) => p.id).join(", ")}): ${s.error}`);
  }
  const lists = news ? ` and ${news.checked} news lists` : "";
  lines.push("", `Checked ${r.checked} pages${lists} at ${at.toISOString().slice(0, 16)}Z. This issue closes itself once nothing is left to read.`);
  return lines.join("\n") + "\n";
}

export type ReportFile = { action: "update-issue"; body: string } | { action: "close-issue" } | { action: "keep-earlier-report" };

export function reportFile(r: SourceCheck, n: NewsCheck, at: Date): ReportFile {
  const somethingToRead = r.changed.length + n.posts.length + n.unbaselined.length > 0;
  if (somethingToRead) return { action: "update-issue", body: report(r, at, n) };
  const everyPageRead = r.unreadable.length + n.unreadable.length === 0;
  return everyPageRead ? { action: "close-issue" } : { action: "keep-earlier-report" };
}

function host(url: string): string {
  return new URL(url).hostname;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const hashesPath = "data/source-hashes.json";
  const seenPath = "data/news-seen.json";
  const table = loadProviders(readFileSync("data/providers.yaml", "utf8"));
  const sources = sourcesOf(table);
  const pages = newsOf(table);
  const accepted: Hashes = existsSync(hashesPath) ? (JSON.parse(readFileSync(hashesPath, "utf8")) as Hashes) : {};
  const seen: Seen = existsSync(seenPath) ? (JSON.parse(readFileSync(seenPath, "utf8")) as Seen) : {};

  const dumpedAt = args.indexOf("--accept-dumped");
  if (dumpedAt >= 0) {
    const dir = args[dumpedAt + 1];
    if (!dir || dir.startsWith("--")) {
      console.error("--accept-dumped needs the --dump directory and the URLs handled");
      process.exit(2);
    }
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
    const urls = args
      .slice(dumpedAt + 2)
      .flatMap((a) => a.split(/\s+/))
      .filter(Boolean);
    const next = acceptDumped(m, urls, accepted, seen, new Set(sources.map((s) => s.url)));
    writeFileSync(hashesPath, JSON.stringify(next.hashes, null, 2) + "\n");
    writeFileSync(seenPath, JSON.stringify(next.seen, null, 2) + "\n");
    console.log(`${hashesPath}, ${seenPath}: updated`);
    process.exit(0);
  }
  const relay =
    process.env.VMAP_SOURCE_RELAY && process.env.VMAP_SOURCE_TOKEN ? { url: process.env.VMAP_SOURCE_RELAY, token: process.env.VMAP_SOURCE_TOKEN } : undefined;
  const [r, n] = await Promise.all([checkSources(sources, accepted, { relay }), checkNews(pages, seen, { relay })]);

  const acceptAt = args.indexOf("--accept");
  if (acceptAt >= 0) {
    const ids = args.slice(acceptAt + 1).filter((a) => !a.startsWith("--"));
    const known = new Set([...sources.flatMap((s) => s.providers), ...pages.flatMap((p) => p.providers)].map((p) => p.id));
    const unknown = ids.filter((id) => id !== "all" && !known.has(id));
    if (ids.length === 0 || unknown.length > 0) {
      console.error(ids.length === 0 ? "--accept needs provider ids or all" : `no source or news list for: ${unknown.join(", ")}`);
      process.exit(2);
    }
    const missed = [...r.unreadable, ...n.unreadable].filter((s) => ids.includes("all") || s.providers.some((p) => ids.includes(p.id)));
    for (const s of missed) console.error(`not accepted, could not read ${s.url}: ${s.error}`);
    writeFileSync(hashesPath, JSON.stringify(accept(sources, accepted, r.current, ids), null, 2) + "\n");
    writeFileSync(seenPath, JSON.stringify(acceptNews(pages, seen, n.current, ids), null, 2) + "\n");
    console.log(`${hashesPath}, ${seenPath}: updated`);
    process.exit(missed.length > 0 ? 1 : 0);
  }

  for (const s of r.changed) console.log(`changed: ${s.url} (${s.providers.map((p) => p.id).join(", ")})`);
  for (const p of n.posts) console.log(`new post: ${p.url} ${p.title} (${p.page.providers.map((v) => v.id).join(", ")})`);
  for (const p of n.unbaselined) console.log(`no baseline: ${p.url}`);
  for (const s of [...r.unreadable, ...n.unreadable]) console.log(`unreadable: ${s.url}: ${s.error}`);
  console.log(
    `${r.checked} pages, ${r.changed.length} changed; ${n.checked} news lists, ${n.posts.length} new posts; ${r.unreadable.length + n.unreadable.length} unreadable`,
  );
  const dumpAt = args.indexOf("--dump");
  if (dumpAt >= 0) {
    const dir = args[dumpAt + 1];
    if (!dir || dir.startsWith("--")) {
      console.error("--dump needs a directory");
      process.exit(2);
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const m = await dumpForReading(r, n, dir, today, { relay });
    console.log(`${dir}/manifest.json: ${m.items.length} items`);
  }
  const reportAt = args.indexOf("--report");
  if (reportAt >= 0) {
    const file = args[reportAt + 1];
    if (!file || file.startsWith("--")) {
      console.error("--report needs a file");
      process.exit(2);
    }
    const out = reportFile(r, n, new Date());
    if (out.action === "update-issue") writeFileSync(file, out.body);
    if (out.action === "close-issue") writeFileSync(file, "");
  }
}
