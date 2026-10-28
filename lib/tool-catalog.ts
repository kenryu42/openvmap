import { readFileSync } from "node:fs";
import path from "node:path";
import { loadTools, maintenance, type Activity, type Job, type Maintenance } from "./tools";

export const toolJobs: Job[] = loadTools(readFileSync(path.join(process.cwd(), "data", "tools.yaml"), "utf8"));
export const toolActivity: Activity = JSON.parse(readFileSync(path.join(process.cwd(), "data", "tool-activity.json"), "utf8")) as Activity;

const builtAt = Date.now();

export function toolMaintenance(repo: string): Maintenance | undefined {
  const a = toolActivity[repo];
  return a && maintenance(a, builtAt);
}
