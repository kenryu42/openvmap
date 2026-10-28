import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { table } from "@/lib/table";

const entries = sitemap();
const urls = entries.map((e) => e.url);

describe("sitemap", () => {
  it("lists every provider page in English and Japanese", () => {
    for (const p of table.providers) {
      expect(urls).toContain(`https://openvmap.com/providers/${p.id}`);
      expect(urls).toContain(`https://openvmap.com/ja/providers/${p.id}`);
    }
  });

  it("lists the home pages, the current incident's guide, tools and about in both languages", () => {
    for (const path of ["/", "/ja", `/guide/${table.incident}`, `/ja/guide/${table.incident}`, "/tools", "/ja/tools", "/about", "/ja/about"]) {
      expect(urls).toContain(`https://openvmap.com${path}`);
    }
  });

  it("leaves out the check result page, which is not indexed", () => {
    expect(urls.filter((u) => u.includes("/check"))).toEqual([]);
  });

  it("points each page at its counterpart in the other language", () => {
    const home = entries.find((e) => e.url === "https://openvmap.com/ja");
    expect(home?.alternates?.languages).toEqual({ en: "https://openvmap.com/", ja: "https://openvmap.com/ja" });
    for (const e of entries) expect(Object.values(e.alternates?.languages ?? {})).toContain(e.url);
  });
});

describe("robots.txt", () => {
  it("allows crawling and names the sitemap", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://openvmap.com/sitemap.xml" });
  });
});
