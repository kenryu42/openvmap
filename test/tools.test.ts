import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadTools, type Activity } from "@/lib/tools";
import { activityPath, fetchActivity, requester } from "@/scripts/check-tools";
import { validateTools } from "@/scripts/validate-tools";

const tool = (repo: string, license = "MIT") => `
      - name: ${repo}
        repo: ${repo}
        license: ${license}
        cost: free
        runs: cli
        what: w
        what_ja: w`;

const job = (id: string, ...tools: string[]) => `
  - id: ${id}
    title: t
    title_ja: t
    why: w
    why_ja: w
    tools:${tools.join("")}`;

const jobs = (...body: string[]) => loadTools(`jobs:${body.join("")}`);

const active = (license = "MIT") => ({ license, archived: false, last_commit: "2026-10-01", stars: 1 });

describe("validateTools", () => {
  it("accepts the shipped list", () => {
    const activity = JSON.parse(readFileSync(activityPath, "utf8")) as Activity;
    expect(validateTools(loadTools(readFileSync("data/tools.yaml", "utf8")), activity)).toEqual([]);
  });

  it("fails when GitHub reports a different license than the page shows", () => {
    expect(validateTools(jobs(job("a", tool("o/x", "MIT"))), { "o/x": active("BUSL-1.1") })).toEqual(["a: o/x: listed as MIT but GitHub now reports BUSL-1.1"]);
  });

  it("trusts the listed license where GitHub cannot name one", () => {
    expect(validateTools(jobs(job("a", tool("o/x", "GPL-2.0"))), { "o/x": active("NOASSERTION") })).toEqual([]);
  });

  it("fails for a tool with no recorded activity, so the page never shows one without its dates", () => {
    expect(validateTools(jobs(job("a", tool("o/x"))), {})).toEqual(["a: o/x: no activity recorded; run bun run check-tools"]);
  });

  it("keeps each job to a pick and two alternatives, and each tool to one job", () => {
    const four = job("a", tool("o/1"), tool("o/2"), tool("o/3"), tool("o/4"));
    const activity = Object.fromEntries(["o/1", "o/2", "o/3", "o/4"].map((r) => [r, active()]));
    expect(validateTools(jobs(four, job("b", tool("o/1"))), activity)).toEqual(["a: more than 2 alternatives", "o/1 is listed under both a and b"]);
  });

  it("requires an incident to cite an https advisory and to be written in both languages", () => {
    const withIncident = `${tool("o/x")}
        incidents:
          - date: "2026-03-19"
            what: "Malicious release"
            source: http://example.test/advisory`;
    expect(validateTools(jobs(job("a", withIncident)), { "o/x": active() })).toEqual([
      "a: o/x: incident 2026-03-19: what and what_ja are required",
      "a: o/x: incident 2026-03-19: source is not an https URL",
    ]);
  });

  it("rejects a repo that is not a GitHub owner/name", () => {
    expect(() => jobs(job("a", tool("https://github.com/o/x")))).toThrow("repo must be a GitHub owner/name");
  });
});

function fakeGitHub(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const get = (url: string) => {
    asked.push(url);
    const path = url.replace("https://api.github.com/repos/", "").replace("https://api.securityscorecards.dev/projects/github.com/", "scorecard:");
    return Promise.resolve(path in routes ? Response.json(routes[path]) : new Response("not found", { status: 404 }));
  };
  return { get, asked };
}

describe("fetchActivity", () => {
  it("records the license, archived flag, default-branch commit date, stars, latest release and Scorecard score", async () => {
    const { get } = fakeGitHub({
      "o/x": { license: { spdx_id: "Apache-2.0" }, archived: false, default_branch: "trunk", pushed_at: "2026-10-28T09:00:00Z", stargazers_count: 4321 },
      "o/x/commits/trunk": { commit: { committer: { date: "2024-03-02T10:00:00Z" } } },
      "o/x/releases/latest": { tag_name: "v1.2.3", published_at: "2024-02-01T00:00:00Z" },
      "scorecard:o/x": { score: 6.4, date: "2026-03-16T00:00:00Z" },
    });
    expect(await fetchActivity(["o/x"], get)).toEqual({
      "o/x": {
        license: "Apache-2.0",
        archived: false,
        last_commit: "2024-03-02",
        stars: 4321,
        release: { tag: "v1.2.3", date: "2024-02-01" },
        scorecard: { score: 6.4, date: "2026-03-16" },
      },
    });
  });

  it("records an archived repository with no releases and no Scorecard result", async () => {
    const { get } = fakeGitHub({
      "o/y": { license: null, archived: true, default_branch: "main", stargazers_count: 7 },
      "o/y/commits/main": { commit: { committer: { date: "2021-01-05T00:00:00Z" } } },
    });
    expect(await fetchActivity(["o/y"], get)).toEqual({ "o/y": { license: "", archived: true, last_commit: "2021-01-05", stars: 7 } });
  });

  it("fails instead of writing partial data when GitHub refuses", async () => {
    const get = () => Promise.resolve(new Response("rate limited", { status: 403 }));
    await expect(fetchActivity(["o/x"], get)).rejects.toThrow("https://api.github.com/repos/o/x: HTTP 403");
  });
});

describe("requester", () => {
  async function authorizationSentTo(url: string): Promise<string | undefined> {
    let sent: RequestInit | undefined;
    const send = ((_: string, init?: RequestInit) => {
      sent = init;
      return Promise.resolve(Response.json({}));
    }) as typeof fetch;
    await requester("ghs_secret", send)(url);
    return ((sent?.headers ?? {}) as Record<string, string>).authorization;
  }

  it("sends the GitHub token to the GitHub API", async () => {
    expect(await authorizationSentTo("https://api.github.com/repos/o/x")).toBe("Bearer ghs_secret");
  });

  it("never sends the GitHub token to the Scorecard API or any other host", async () => {
    expect(await authorizationSentTo("https://api.securityscorecards.dev/projects/github.com/o/x")).toBeUndefined();
    expect(await authorizationSentTo("https://api.github.com.evil.test/repos/o/x")).toBeUndefined();
  });
});
