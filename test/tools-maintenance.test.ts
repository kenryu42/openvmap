import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToolsPage } from "@/app/_components/tools";
import { messages } from "@/lib/lang";
import { quietAfterDays } from "@/lib/tools";

vi.mock("next/navigation", () => ({ usePathname: () => "/tools" }));

vi.mock("@/lib/tool-catalog", async () => {
  const { loadTools, maintenance } = await import("@/lib/tools");
  const tool = (name: string) => `
      - name: ${name}
        repo: o/${name}
        license: MIT
        cost: free
        runs: cli
        what: w
        what_ja: w`;
  const toolJobs = loadTools(`jobs:
  - id: a
    title: t
    title_ja: t
    why: w
    why_ja: w
    tools:${tool("fresh")}${tool("abandoned")}${tool("retired")}`);
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString().slice(0, 10);
  const toolActivity = {
    "o/fresh": { license: "MIT", archived: false, last_commit: daysAgo(10), stars: 1 },
    "o/abandoned": { license: "MIT", archived: false, last_commit: daysAgo(400), stars: 1 },
    "o/retired": { license: "MIT", archived: true, last_commit: daysAgo(10), stars: 1 },
  };
  const toolMaintenance = (repo: keyof typeof toolActivity) => maintenance(toolActivity[repo], now);
  return { toolJobs, toolActivity, toolMaintenance };
});

describe("tools page maintenance warnings", () => {
  it("warns about a tool with no commits for a year and one its maintainers archived, and not about an active one", () => {
    const t = messages("en").tools;
    const html = renderToStaticMarkup(createElement(ToolsPage, { lang: "en" }));
    const card = (name: string) => html.split("<article").find((c) => c.includes(`o/${name}`)) ?? "";
    expect(card("abandoned")).toContain(t.quiet(quietAfterDays));
    expect(card("retired")).toContain(t.archived);
    expect(card("fresh")).not.toContain(t.quiet(quietAfterDays));
    expect(card("fresh")).not.toContain(t.archived);
  });
});
