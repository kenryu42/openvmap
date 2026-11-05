import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdvisoriesPage } from "@/app/_components/advisories";
import { ReportView } from "@/app/_components/report-view";
import { runCheck } from "@/lib/check";
import type { Lang } from "@/lib/lang";
import { loadProviders } from "@/lib/provider";
import { advisories } from "@/lib/table";
import { singleSiteResolver } from "./helpers";

vi.mock("next/navigation", () => ({ usePathname: () => "/advisories" }));

const table = loadProviders(
  `updated_at: "2026-11-02"
providers:
  - id: example-hosting
    name: Example Hosting
    name_ja: 例ホスティング
    kind: hosting
    asns: [64512]
    incidents:
      php2shell:
        status: patched
        confidence: official
        date: "2026-10-22"
        summary: 全サーバーで修正済み
        summary_en: Fixed on every server
        customer_action: なし
        customer_action_en: Nothing to do.
        source: https://hosting.example/news/php
        verified_at: "2026-10-23"
`,
  advisories,
);

async function reportHtml(lang: Lang): Promise<string> {
  const report = await runCheck("shop.example.jp", { table, resolver: singleSiteResolver("shop.example.jp"), version: "test", lang });
  return renderToStaticMarkup(createElement(ReportView, { report, table, lang, php: "done", phpAgeS: 0 }));
}

function providerCard(html: string, id: string): string {
  const start = html.indexOf(`id="p-${id}"`);
  return html.slice(start, html.indexOf("</article>", start));
}

describe("a provider row on the domain report", () => {
  for (const [lang, prefix] of [
    ["en", ""],
    ["ja", "/ja"],
  ] as const) {
    it(`links to each advisory that concerns the provider (${lang})`, async () => {
      const card = providerCard(await reportHtml(lang), "example-hosting");
      expect(card).toContain(`href="${prefix}/advisories#php2shell"`);
      expect(card).toContain(`href="${prefix}/advisories#cve-2026-98432"`);
    });
  }

  it("shows the announced status where there is one, and no statement where there is none", async () => {
    const card = providerCard(await reportHtml("en"), "example-hosting");
    const row = (id: string) => card.split("/advisories#").find((part) => part.startsWith(`${id}"`))!;
    const [php, kernel] = [row("php2shell"), row("cve-2026-98432")];
    expect(php).toContain("patched");
    expect(php).toContain("Fixed on every server");
    expect(kernel).toContain("No statement recorded");
    expect(kernel).not.toContain("patched");
  });
});

describe("the advisories page", () => {
  for (const lang of ["en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(AdvisoriesPage, { lang }));

    it(`gives every advisory an anchor the report links to, with its CVEs and CVSS score (${lang})`, () => {
      for (const a of advisories) {
        expect(html).toContain(`id="${a.id}"`);
        for (const c of a.cves) expect(html).toContain(c);
        expect(html).toContain(`CVSS ${a.cvss_version} ${a.cvss}`);
      }
    });

    it(`links the upstream fix and each distribution's source, with the date it was checked (${lang})`, () => {
      for (const a of advisories) {
        expect(html).toContain(`href="${a.upstream.url}"`);
        for (const f of a.fixes) {
          expect(html).toContain(`href="${f.source}"`);
          expect(html).toContain(`<time dateTime="${f.checked_at}">`);
        }
      }
    });

    it(`fills the message to the host with placeholders, not a real host or domain (${lang})`, () => {
      const placeholders = lang === "en" ? ["[your host]", "[your domain]"] : ["（事業者名）", "（ドメイン名）"];
      for (const p of placeholders) expect(html).toContain(p);
      expect(html).not.toContain("{vendor}");
      expect(html).not.toContain("{domain}");
    });

    it(`lists the newest advisory first (${lang})`, () => {
      const shown = [...html.matchAll(/<article id="([^"]+)"/g)].map((m) => m[1]);
      const published = shown.map((id) => advisories.find((a) => a.id === id)!.published);
      expect(shown).toHaveLength(advisories.length);
      expect(published).toEqual([...published].sort().reverse());
      expect(shown.slice(0, 2)).toEqual(["cve-2026-123158", "php2shell"]);
    });

    it(`keeps the link to the php2shell guide (${lang})`, () => {
      expect(html).toContain(`href="${lang === "en" ? "" : "/ja"}/guide/php2shell"`);
    });
  }

  it("shows a provider's announced kernel status with its source, and lists the rest as having no statement", () => {
    const html = renderToStaticMarkup(createElement(AdvisoriesPage, { lang: "en" }));
    const start = html.indexOf('id="cve-2026-98432"');
    const kernel = html.slice(start, html.indexOf("</article>", start));
    expect(kernel).toContain('href="/providers/siteground#cve-2026-98432"');
    expect(kernel).toContain('href="https://www.siteground.com/blog/linux-kernel-tcp-vulnerability-cve-2026-98432"');
    const silent = kernel.slice(kernel.indexOf("No statement recorded ·"));
    expect(silent).toContain('href="/providers/xserver"');
    expect(silent).not.toContain('href="/providers/siteground"');
  });

  it("renders no statuses greyed in the prerendered page, leaving the age to the reader's clock", () => {
    expect(renderToStaticMarkup(createElement(AdvisoriesPage, { lang: "en" }))).not.toMatch(/ data-stale="/);
  });
});
