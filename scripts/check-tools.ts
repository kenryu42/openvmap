import { readFileSync, writeFileSync } from "node:fs";
import { loadTools, type Activity, type RepoActivity } from "../lib/tools";

export const activityPath = "data/tool-activity.json";

type Get = (url: string) => Promise<Response>;

const api = "https://api.github.com/repos";
const scorecardApi = "https://api.securityscorecards.dev/projects/github.com";
const httpNotFound = 404;

async function json(get: Get, url: string): Promise<Record<string, unknown>> {
  const found = await optionalJson(get, url);
  if (!found) throw new Error(`${url}: HTTP ${httpNotFound}`);
  return found;
}

async function optionalJson(get: Get, url: string): Promise<Record<string, unknown> | undefined> {
  const res = await get(url);
  if (res.status === httpNotFound) return undefined;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const day = (iso: unknown) => String(iso).slice(0, 10);

export async function fetchActivity(repos: readonly string[], get: Get): Promise<Activity> {
  const activity: Activity = {};
  for (const repo of [...new Set(repos)].toSorted()) {
    const info = await json(get, `${api}/${repo}`);
    const head = await json(get, `${api}/${repo}/commits/${String(info.default_branch)}`);
    const latest = await optionalJson(get, `${api}/${repo}/releases/latest`);
    const scorecard = await optionalJson(get, `${scorecardApi}/${repo}`);
    const license = info.license as { spdx_id?: string } | null;
    const entry: RepoActivity = {
      license: license?.spdx_id ?? "",
      archived: info.archived === true,
      last_commit: day((head.commit as { committer?: { date?: string } } | undefined)?.committer?.date),
      stars: Number(info.stargazers_count),
    };
    if (latest) entry.release = { tag: String(latest.tag_name), date: day(latest.published_at) };
    if (scorecard) entry.scorecard = { score: Number(scorecard.score), date: day(scorecard.date) };
    activity[repo] = entry;
  }
  return activity;
}

const githubOrigin = "https://api.github.com/";

export function requester(token: string | undefined, send: typeof fetch = fetch): Get {
  return (url) => {
    const toGitHub = url.startsWith(githubOrigin);
    const headers: Record<string, string> = { accept: toGitHub ? "application/vnd.github+json" : "application/json", "user-agent": "OpenVMap tool-activity" };
    if (token && toGitHub) headers.authorization = `Bearer ${token}`;
    return send(url, { headers, redirect: "manual" });
  };
}

if (import.meta.main) {
  const repos = loadTools(readFileSync("data/tools.yaml", "utf8")).flatMap((j) => j.tools.map((t) => t.repo));
  const activity = await fetchActivity(repos, requester(process.env.GITHUB_TOKEN));
  writeFileSync(activityPath, JSON.stringify(activity, null, 2) + "\n");
  console.log(`${activityPath}: ${Object.keys(activity).length} repositories`);
}
