import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProvidersPage } from "@/app/_components/pages";
import type { Lang } from "@/lib/lang";

vi.mock("next/navigation", () => ({ usePathname: () => "/providers" }));

function sourceLinkNamesByRow(lang: Lang): { provider: string; source: string }[] {
  const body = renderToStaticMarkup(createElement(ProvidersPage, { lang })).split("<tbody>")[1].split("</tbody>")[0];
  const textOf = (html: string) => html.replace(/<[^>]+>/g, "").trim();
  return body
    .split("<tr")
    .slice(1)
    .flatMap((row) => {
      const provider = row.match(/<a [^>]*href="[^"]*\/providers\/[^"]+"[^>]*>(.*?)<\/a>/)?.[1];
      const source = row.match(/<a [^>]*href="https?:[^"]+"[^>]*>(.*?)<\/a>/)?.[1];
      return provider && source ? [{ provider: textOf(provider), source: textOf(source) }] : [];
    });
}

describe("provider status page", () => {
  for (const lang of ["en", "ja"] as const) {
    it(`names each source link after its provider, so a screen reader can tell them apart (${lang})`, () => {
      const rows = sourceLinkNamesByRow(lang);
      expect(rows.length).toBeGreaterThan(10);
      for (const { provider, source } of rows) expect(source).toContain(provider);
      expect(new Set(rows.map((r) => r.source)).size).toBe(rows.length);
    });
  }
});
