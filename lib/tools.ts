import { load } from "js-yaml";
import { fieldReaders } from "./yaml-fields";

const { obj, list_, str } = fieldReaders("tools");

export type Cost = "free" | "open-core";
const costs: readonly Cost[] = ["free", "open-core"];

export type Runs = "cli" | "ci" | "service" | "rules";
const runsValues: readonly Runs[] = ["cli", "ci", "service", "rules"];

interface ToolIncident {
  date: string;
  what: string;
  what_ja: string;
  source: string;
}

export interface Tool {
  name: string;
  repo: string;
  license: string;
  cost: Cost;
  runs: Runs;
  what: string;
  what_ja: string;
  try?: string;
  by_author: boolean;
  incidents: ToolIncident[];
}

export interface Job {
  id: string;
  title: string;
  title_ja: string;
  why: string;
  why_ja: string;
  tools: Tool[];
}

export interface RepoActivity {
  license: string;
  archived: boolean;
  last_commit: string;
  stars: number;
  release?: { tag: string; date: string };
  scorecard?: { score: number; date: string };
}

export type Activity = Record<string, RepoActivity>;

export type Maintenance = "archived" | "quiet" | "active";

export const quietAfterDays = 365;
const msPerDay = 86_400_000;

export function maintenance(a: RepoActivity, now: number): Maintenance {
  if (a.archived) return "archived";
  return now - Date.parse(`${a.last_commit}T00:00:00Z`) > quietAfterDays * msPerDay ? "quiet" : "active";
}

export function repoUrl(repo: string): string {
  return `https://github.com/${repo}`;
}

export function scorecardUrl(repo: string): string {
  return `https://scorecard.dev/viewer/?uri=github.com/${repo}`;
}

export function loadTools(yamlText: string): Job[] {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (err) {
    throw new Error(`tools: ${err instanceof Error ? err.message : String(err)}`);
  }
  const seen = new Set<string>();
  return list_(obj(raw, "file").jobs, "jobs").map((entry, i): Job => {
    const e = obj(entry, `job ${i}`);
    const id = str(e.id);
    if (id === "") throw new Error(`tools: job ${i} has no id`);
    if (seen.has(id)) throw new Error(`tools: duplicate job id ${JSON.stringify(id)}`);
    seen.add(id);
    return {
      id,
      title: str(e.title),
      title_ja: str(e.title_ja),
      why: str(e.why),
      why_ja: str(e.why_ja),
      tools: list_(e.tools, `${id}: tools`).map((t, j) => tool(obj(t, `${id}: tool ${j}`), id)),
    };
  });
}

function tool(t: Record<string, unknown>, job: string): Tool {
  const repo = str(t.repo);
  const at = `${job}: ${repo || "tool without a repo"}`;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`tools: ${at}: repo must be a GitHub owner/name`);
  const cost = str(t.cost) as Cost;
  if (!costs.includes(cost)) throw new Error(`tools: ${at}: unknown cost ${JSON.stringify(cost)}`);
  const runs = str(t.runs) as Runs;
  if (!runsValues.includes(runs)) throw new Error(`tools: ${at}: unknown runs ${JSON.stringify(runs)}`);
  const tryIt = str(t.try);
  return {
    name: str(t.name),
    repo,
    license: str(t.license),
    cost,
    runs,
    what: str(t.what),
    what_ja: str(t.what_ja),
    ...(tryIt && { try: tryIt }),
    by_author: t.by_author === true,
    incidents: list_(t.incidents, `${at}: incidents`).map((v, k) => {
      const i = obj(v, `${at}: incident ${k}`);
      return { date: str(i.date), what: str(i.what), what_ja: str(i.what_ja), source: str(i.source) };
    }),
  };
}
