import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzePhp, versionStatusOf } from "@/lib/phpsig";

const h = (pairs: [string, string][] = []) => new Headers(pairs);
const site = new URL("https://example.jp/");

describe("analyzePhp", () => {
  it("reads the WordPress fixture as likely PHP", () => {
    const body = readFileSync("test/fixtures/wordpress.html", "utf8");
    const r = analyzePhp(
      h([
        ["Server", "LiteSpeed"],
        ["Set-Cookie", "PHPSESSID=abcdefghijklmnopqrstuvwxyz012345; path=/; HttpOnly"],
      ]),
      body,
      site,
    );
    expect(r.verdict).toBe("likely");
    expect(r.cms).toEqual(["WordPress"]);
    expect(r.long_session_cookie).toBeUndefined();
    expect(r.php_version).toBeUndefined();
  });

  it.each([
    ["PHP/8.3.35", "below_fixed_release"],
    ["PHP/8.3.36", "fixed_or_later"],
    ["PHP/7.4.33", "no_official_fix"],
    ["PHP/5.6", "no_official_fix"],
    ["PHP/9.0.0", "fixed_or_later"],
    ["PHP/8.4", "unknown"],
  ])("X-Powered-By %s → %s", (header, status) => {
    const r = analyzePhp(h([["X-Powered-By", header]]), "", site);
    expect(r.verdict).toBe("likely");
    expect(r.php_version).toBe(header.slice(4));
    expect(r.version_status).toBe(status);
  });

  it("reads Next.js and Hugo as non-PHP", () => {
    const body = `<html><head><meta name="generator" content="Hugo 0.120"></head><body><script src="/_next/static/a.js"></script></body></html>`;
    expect(analyzePhp(h([["X-Powered-By", "Next.js"]]), body, site).verdict).toBe("unlikely");
  });

  it("reports nothing for a plain page", () => {
    const r = analyzePhp(h(), "<html><body>hello</body></html>", site);
    expect(r).toEqual({ verdict: "none", score: 0, signals: [] });
  });

  it("counts a .php link as possible", () => {
    const r = analyzePhp(h(), `<a href="/contact.php?x=1">contact</a>`, site);
    expect(r.verdict).toBe("possible");
    expect(r.signals[0].kind).toBe("php-link");
  });

  it("counts only .php links to the site itself, not share buttons for other sites", () => {
    const page = new URL("https://www.example.jp/blog/");
    const share = `<a href="//www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://b.hatena.ne.jp/entry.php">b!</a>`;
    expect(analyzePhp(h(), share, page)).toEqual({ verdict: "none", score: 0, signals: [] });

    for (const own of [`<a href="contact.php">`, `<form action="https://example.jp/form.php">`, `<a href="//shop.example.jp/cart.php?id=1">`]) {
      const r = analyzePhp(h(), share + own, page);
      expect(r.verdict, own).toBe("possible");
      expect(
        r.signals.map((s) => s.evidence),
        own,
      ).toEqual([expect.stringContaining(own.match(/"([^"]+\.php)/)![1])]);
    }
  });

  it("reads the generator meta in either attribute order", () => {
    const r = analyzePhp(h(), `<meta content="EC-CUBE 4.3" name="generator" />`, site);
    expect(r.cms).toEqual(["EC-CUBE"]);
    expect(r.verdict).toBe("likely");
  });

  it("flags an abnormally long PHPSESSID", () => {
    const r = analyzePhp(h([["Set-Cookie", "PHPSESSID=" + "a".repeat(300) + "; path=/"]]), "", site);
    expect(r.long_session_cookie).toBe(true);
  });

  it("does not take Movable Type as proof of PHP", () => {
    const r = analyzePhp(h(), `<meta name="generator" content="Movable Type 7" />`, site);
    expect(r.verdict).toBe("none");
    expect(r.cms).toHaveLength(1);
  });

  it("does not take a link to a site builder as that builder", () => {
    const body = `<link rel="stylesheet" href="/wp-content/themes/a/style.css"><a href="https://www.jimdo.com/jp/">ジンドゥー</a>`;
    const r = analyzePhp(h(), body, site);
    expect(r.cms).toEqual(["WordPress"]);
    expect(r.score).toBe(5);
  });

  it("keeps several Set-Cookie headers apart", () => {
    const headers = h();
    headers.append("Set-Cookie", "lp-cms=deleted; path=/");
    headers.append("Set-Cookie", "PHPSESSID=02712a38ab262fe260fdc0cb2c72813c; path=/");
    expect(analyzePhp(headers, "", site).signals).toEqual([{ kind: "cookie", evidence: "PHPSESSID", weight: 6 }]);
  });

  it("scores PHP and a non-PHP X-Powered-By separately when both are sent", () => {
    const headers = h();
    headers.append("X-Powered-By", "PHP/8.4.27");
    headers.append("X-Powered-By", "Express");
    expect(analyzePhp(headers, "", site).score).toBe(2);
  });

  it("reads a hostile body of unclosed meta tags in linear time", () => {
    for (const unit of ['<meta name="generator" content= ', "<meta content='x' name= "]) {
      const body = unit.repeat(Math.floor((32 * 1024) / unit.length));
      const start = performance.now();
      expect(analyzePhp(h(), body, site).signals).toEqual([]);
      expect(performance.now() - start).toBeLessThan(500);
    }
  });

  it("finds the generator wherever it sits in the tag", () => {
    const gen = (body: string) => analyzePhp(h(), body, site).signals.find((s) => s.kind === "generator")?.evidence;
    expect(gen(`<meta name="generator" content="WordPress 6.8">`)).toBe("WordPress 6.8");
    expect(gen(`<META CONTENT='Hugo 0.140' NAME='generator'/>`)).toBe("Hugo 0.140");
    expect(gen(`<meta property="x" name = "generator" data-a="1" content = "Drupal 10 (https://www.drupal.org)" >`)).toBe("Drupal 10 (https://www.drupal.org)");
    expect(gen(`<meta name="description" content="a"><meta name="generator" content="b">`)).toBe("b");
    expect(gen(`<meta name="generator"><meta content="c">`)).toBeUndefined();
  });
});

describe("versionStatusOf", () => {
  it("treats branches above 8.5 as fixed and below 8.2 as unfixed", () => {
    expect(versionStatusOf("8.6.0")).toBe("fixed_or_later");
    expect(versionStatusOf("8.1.30")).toBe("no_official_fix");
    expect(versionStatusOf("x.y")).toBe("unknown");
  });
});
