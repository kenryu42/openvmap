import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToolsPage } from "@/app/_components/tools";
import { messages, type Lang } from "@/lib/lang";
import { toolActivity, toolJobs } from "@/lib/tool-catalog";

vi.mock("next/navigation", () => ({ usePathname: () => "/tools" }));

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function cards(lang: Lang): string[] {
  return renderToStaticMarkup(createElement(ToolsPage, { lang }))
    .split("<article")
    .slice(1)
    .map((c) => textOf(c.slice(c.indexOf(">") + 1).split("</article>")[0]));
}

describe("tools page", () => {
  for (const lang of ["en", "ja"] as const) {
    const t = messages(lang).tools;

    it(`shows every listed tool with its license and last commit, the first in each job as the pick (${lang})`, () => {
      const shown = cards(lang);
      const listed = toolJobs.flatMap((j) => j.tools.map((tool, i) => ({ tool, isPick: i === 0 })));
      expect(shown).toHaveLength(listed.length);
      listed.forEach(({ tool, isPick }, i) => {
        expect(shown[i]).toContain(tool.name);
        expect(shown[i].startsWith(isPick ? t.pick : t.alternative)).toBe(true);
        expect(shown[i]).toContain(`${t.license} ${tool.license}`);
        expect(shown[i]).toMatch(new RegExp(`${t.lastCommit} \\d{4}-\\d{2}-\\d{2}`));
      });
    });

    it(`shows each tool's GitHub stars and its Scorecard score, or that it has none (${lang})`, () => {
      const shown = cards(lang);
      const listed = toolJobs.flatMap((j) => j.tools);
      listed.forEach((tool, i) => {
        const a = toolActivity[tool.repo];
        expect(shown[i]).toContain(`${t.stars} ${new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format(a.stars)}`);
        expect(shown[i]).toContain(`${t.scorecard} ${a.scorecard ? t.scorecardOf(a.scorecard.score, a.scorecard.date) : t.notScored}`);
      });
    });

    it(`warns on the Trivy card about its March 2026 compromise and links Aqua's advisory (${lang})`, () => {
      const html = renderToStaticMarkup(createElement(ToolsPage, { lang }));
      const trivy = html.split("<article").find((c) => c.includes("aquasecurity/trivy")) ?? "";
      expect(textOf(trivy)).toContain(`${t.incident} · 2026-03-19`);
      expect(textOf(trivy)).toContain("CVE-2026-33634");
      expect(trivy).toContain('href="https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23"');
      const withIncident = html.split("<article").filter((c) => textOf(c).includes(`${t.incident} ·`));
      expect(withIncident).toHaveLength(1);
    });

    it(`discloses the tool written by this site's author, and only that one (${lang})`, () => {
      const disclosed = cards(lang).filter((c) => c.includes(t.byAuthor));
      expect(disclosed).toHaveLength(1);
      expect(disclosed[0]).toContain("kenryu42/cc-safety-net");
    });
  }
});
