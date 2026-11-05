import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProvidersPage } from "@/app/_components/pages";
import { rootMetadata } from "@/app/_components/root";
import EnGuide, { metadata as enGuideMeta } from "@/app/(en)/guide/php2shell/page";
import JaGuide, { metadata as jaGuideMeta } from "@/app/ja/guide/php2shell/page";
import { messages, type Lang } from "@/lib/lang";

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

describe("advisories in the site's navigation and description", () => {
  for (const lang of ["en", "ja"] as const satisfies Lang[]) {
    it(`sends the nav's Advisories link to the advisories page (${lang})`, () => {
      const html = renderToStaticMarkup(createElement(ProvidersPage, { lang }));
      expect(hrefOfLink(html, messages(lang).ui.nav.advisories)).toBe(lang === "en" ? "/advisories" : "/ja/advisories");
    });

    it(`keeps the php2shell guide, with its own title and a language switch to the other guide (${lang})`, () => {
      const html = renderToStaticMarkup(createElement(guides[lang].page));
      expect(html).toContain(`<h1>${guides[lang].title}</h1>`);
      expect(guides[lang].meta.title).toBe(guides[lang].title);
      expect(html).toContain(`href="${guides[lang === "en" ? "ja" : "en"].path}"`);
      expect(String(guides[lang].meta.description)).toContain("CVE-2026-109618");
    });

    it(`names every advisory and its CVEs in the site description and the providers page (${lang})`, () => {
      const description = String(rootMetadata(lang).description);
      const providers = renderToStaticMarkup(createElement(ProvidersPage, { lang }));
      for (const cve of ["CVE-2026-109618 / CVE-2026-109619", "CVE-2026-98432", "CVE-2026-123158"]) {
        expect(description).toContain(cve);
        expect(providers).toContain(cve);
      }
    });
  }
});
