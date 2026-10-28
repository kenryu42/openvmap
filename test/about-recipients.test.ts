import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutPage } from "@/app/_components/pages";
import { runCheck } from "@/lib/check";
import { dohResolver } from "@/lib/doh";
import type { Lang } from "@/lib/lang";
import { loadProviders } from "@/lib/provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/about" }));

const table = loadProviders(readFileSync("test/fixtures/providers.golden.yaml", "utf8"));

async function hostsTheBrowserCheckContacts(domain: string): Promise<Set<string>> {
  const hosts = new Set<string>();
  vi.stubGlobal("fetch", (input: string) => {
    const url = new URL(input);
    hosts.add(url.hostname);
    const name = url.searchParams.get("name");
    const type = url.searchParams.get("type");
    const answer =
      type === "A" && name === domain
        ? [{ name, type: 1, data: "203.0.114.10" }]
        : type === "TXT" && name?.endsWith(".origin.asn.cymru.com")
          ? [{ name, type: 16, data: '"64512 | 203.0.114.0/24 | JP | apnic | 2010-01-01"' }]
          : type === "TXT" && name?.endsWith(".asn.cymru.com")
            ? [{ name, type: 16, data: '"64512 | JP | apnic | 2010-01-01 | EXAMPLE-NET - Example Hosting, JP"' }]
            : [];
    return Promise.resolve(Response.json({ Status: 0, Answer: answer }));
  });
  const report = await runCheck(domain, { table, resolver: dohResolver(), version: "test", lang: "en" });
  expect(report.hosts[0]?.ips[0]?.asn).toBe(64512);
  return hosts;
}

function recipientsSection(lang: Lang): string {
  const html = renderToStaticMarkup(createElement(AboutPage, { lang }));
  const heading = lang === "ja" ? "<h2>外部への情報送信</h2>" : "<h2>Information sent to third parties</h2>";
  const start = html.indexOf(heading);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("<h2", start + heading.length));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the About page's list of third parties the browser sends to", () => {
  it.each(["ja", "en"] as const)("names every host a check in the visitor's browser contacts (%s)", async (lang) => {
    const contacted = await hostsTheBrowserCheckContacts("example.co.jp");
    expect(contacted.size).toBeGreaterThan(0);
    const section = recipientsSection(lang);
    for (const host of contacted) expect(section).toContain(`<code>${host}</code>`);
  });
});
