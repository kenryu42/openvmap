import { readFileSync } from "node:fs";
import { loadTools, type Activity, type Job } from "../lib/tools";
import { activityPath } from "./check-tools";
import { runValidation } from "./run-validation";

const maxAlternatives = 2;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const unreportedLicenses = new Set(["", "NOASSERTION", "NONE"]);

export function validateTools(jobs: Job[], activity: Activity): string[] {
  const errors: string[] = [];
  const listedIn = new Map<string, string>();
  for (const job of jobs) {
    if (!job.title || !job.title_ja || !job.why || !job.why_ja) errors.push(`${job.id}: title, title_ja, why and why_ja are required`);
    if (job.tools.length === 0) errors.push(`${job.id}: no tools`);
    if (job.tools.length > 1 + maxAlternatives) errors.push(`${job.id}: more than ${maxAlternatives} alternatives`);
    for (const t of job.tools) {
      const at = `${job.id}: ${t.repo}`;
      const other = listedIn.get(t.repo);
      if (other) errors.push(`${t.repo} is listed under both ${other} and ${job.id}`);
      listedIn.set(t.repo, job.id);
      if (!t.name || !t.what || !t.what_ja || !t.license) errors.push(`${at}: name, license, what and what_ja are required`);
      for (const i of t.incidents) {
        if (!isoDate.test(i.date)) errors.push(`${at}: incident date ${JSON.stringify(i.date)} is not YYYY-MM-DD`);
        if (!i.what || !i.what_ja) errors.push(`${at}: incident ${i.date}: what and what_ja are required`);
        if (!i.source.startsWith("https://")) errors.push(`${at}: incident ${i.date}: source is not an https URL`);
      }
      const a = activity[t.repo];
      if (!a) {
        errors.push(`${at}: no activity recorded; run bun run check-tools`);
        continue;
      }
      if (!unreportedLicenses.has(a.license) && a.license !== t.license) {
        errors.push(`${at}: listed as ${t.license} but GitHub now reports ${a.license}`);
      }
    }
  }
  return errors;
}

if (import.meta.main) {
  runValidation("data/tools.yaml: ok", () =>
    validateTools(loadTools(readFileSync("data/tools.yaml", "utf8")), JSON.parse(readFileSync(activityPath, "utf8")) as Activity),
  );
}
