import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProvidersPage } from "@/app/_components/pages";
import { rootMetadata } from "@/app/_components/root";
import EnGuide, { metadata as enGuideMeta } from "@/app/(en)/guide/php2shell/page";
import JaGuide, { metadata as jaGuideMeta } from "@/app/ja/guide/php2shell/page";
import { messages, type Lang } from "@/lib/lang";
import { table } from "@/lib/table";

vi.mock("next/navigation", () => ({ usePathname: () => "/providers" }));
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "" });
  return { Geist: font, Geist_Mono: font, Noto_Sans_JP: font };
});

const guides = {
  en: { page: EnGuide, meta: enGuideMeta, path: "/guide/php2shell", title: "php2shell: a guide for small businesses" },
  ja: { page: JaGuide, meta: jaGuideMeta, path: "/ja/guide/php2shell", title: "php2shell：中小企業のための対応ガイド" },
};

function hrefOfLink(html: string, text: string): string | undefined {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].find((m) => m[2].replace(/<[^>]+>/g, "").trim() === text)?.[1];
}

describe("current incident", () => {
  for (const lang of ["en", "ja"] as const satisfies Lang[]) {
    const label = messages(lang).ui.incidentLabel(table.incident, table.incident_cves);

    it(`sends the nav's Guide link to the guide for the incident in the provider table (${lang})`, () => {
      const html = renderToStaticMarkup(createElement(ProvidersPage, { lang }));
      expect(table.incident).toBe("php2shell");
      expect(hrefOfLink(html, messages(lang).ui.nav.guide)).toBe(guides[lang].path);
    });

    it(`renders that guide with its own title and a language switch to the other guide (${lang})`, () => {
      const html = renderToStaticMarkup(createElement(guides[lang].page));
      expect(html).toContain(`<h1>${guides[lang].title}</h1>`);
      expect(guides[lang].meta.title).toBe(guides[lang].title);
      expect(html).toContain(`href="${guides[lang === "en" ? "ja" : "en"].path}"`);
      expect(String(guides[lang].meta.description)).toContain("CVE-2026-109618");
    });

    it(`names the incident and its CVEs from the provider table in the site description and the providers page (${lang})`, () => {
      expect(label).toContain("CVE-2026-109618 / CVE-2026-109619");
      expect(rootMetadata(lang).description).toContain(label);
      expect(renderToStaticMarkup(createElement(ProvidersPage, { lang }))).toContain(label);
    });
  }
});
