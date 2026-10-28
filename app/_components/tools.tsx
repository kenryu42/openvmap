import type { CSSProperties, ReactNode } from "react";
import { PageHead } from "./pages";
import { linkClass, SectionHead, Site } from "./site";
import { base, messages, otherLang, type Lang } from "@/lib/lang";
import { repoUrl as siteRepoUrl } from "@/lib/meta";
import { pick } from "@/lib/report";
import { toolActivity, toolJobs, toolMaintenance } from "@/lib/tool-catalog";
import { quietAfterDays, repoUrl, scorecardUrl, type Tool } from "@/lib/tools";
import { table } from "@/lib/table";

const chip = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap";

export function ToolsPage({ lang }: { lang: Lang }) {
  const t = messages(lang).tools;
  const ja = lang === "ja";
  return (
    <Site lang={lang} alt={`${base(otherLang(lang))}/tools`} incident={table.incident} wide>
      <PageHead eyebrow={t.eyebrow} title={t.title}>
        <p className="mt-4 max-w-2xl leading-8 text-muted">{t.intro}</p>
      </PageHead>

      <nav aria-label={t.jobs} className="rise mb-14 rounded-2xl border border-rule bg-surface p-5 sm:p-6" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="text-xs font-semibold text-muted">{t.jobs}</h2>
        <ol className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {toolJobs.map((job, i) => (
            <li key={job.id} className="flex gap-3">
              <span className="font-mono text-xs leading-6 text-accent tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <a href={`#${job.id}`} className={`${linkClass} leading-6`}>
                {pick(ja, job.title_ja, job.title)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {toolJobs.map((job, i) => (
        <section key={job.id} id={job.id} className="reveal mb-14 scroll-mt-24">
          <SectionHead n={i + 1} title={pick(ja, job.title_ja, job.title)} />
          <p className="-mt-2 mb-6 max-w-3xl leading-8 text-muted">{pick(ja, job.why_ja, job.why)}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {job.tools.map((tool, j) => (
              <ToolCard key={tool.repo} tool={tool} isPick={j === 0} lang={lang} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-6 text-xs">
        <a href={`${siteRepoUrl}/blob/main/data/tools.yaml`} className={linkClass}>
          {t.suggest}
        </a>
      </p>
    </Site>
  );
}

function ToolCard({ tool, isPick, lang }: { tool: Tool; isPick: boolean; lang: Lang }) {
  const m = messages(lang);
  const t = m.tools;
  const activity = toolActivity[tool.repo];
  const state = toolMaintenance(tool.repo);
  const stars = new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 });
  const scorecard = activity?.scorecard ? (
    <a href={scorecardUrl(tool.repo)} className={linkClass} rel="noopener noreferrer">
      {t.scorecardOf(activity.scorecard.score, activity.scorecard.date)}
    </a>
  ) : (
    t.notScored
  );
  const facts: [string, ReactNode][] = [
    [t.license, tool.license],
    ...(activity
      ? ([
          [t.lastCommit, activity.last_commit],
          ...(activity.release ? [[t.latestRelease, `${activity.release.tag} · ${activity.release.date}`]] : []),
          [t.stars, stars.format(activity.stars)],
          [t.scorecard, scorecard],
        ] as [string, ReactNode][])
      : []),
  ];
  return (
    <article
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border p-5 sm:p-6 ${isPick ? "border-accent/40 bg-surface shadow-[0_8px_32px_-20px_rgb(0_0_0/0.35)]" : "border-rule bg-surface/60"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${chip} ${isPick ? "bg-ink text-paper" : "bg-sunken text-muted"}`}>{isPick ? t.pick : t.alternative}</span>
        <span className={`${chip} bg-sunken text-muted`}>{m.costLabels[tool.cost]}</span>
        <span className={`${chip} bg-sunken text-muted`}>{m.runsLabels[tool.runs]}</span>
        {tool.by_author && <span className={`${chip} bg-accent-soft text-accent`}>{t.byAuthor}</span>}
      </div>
      <div>
        <h3 className="text-lg font-bold">
          <a href={repoUrl(tool.repo)} className={linkClass} rel="noopener noreferrer">
            {tool.name}
          </a>
        </h3>
        <p className="mt-0.5 font-mono text-xs text-muted">{tool.repo}</p>
      </div>
      <p className="leading-7">{pick(lang === "ja", tool.what_ja, tool.what)}</p>
      {tool.try && (
        <div>
          <p className="text-xs font-semibold text-muted">{t.tryIt}</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-sunken px-3 py-2 font-mono text-[12px] leading-6">
            <code>{tool.try}</code>
          </pre>
        </div>
      )}
      <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {tool.incidents.map((i) => (
        <div key={i.date} className="rounded-lg border border-[var(--bad)]/30 bg-[var(--bad-soft)] px-3 py-2.5 text-xs leading-6">
          <p className="font-semibold text-[var(--bad)]">
            {t.incident} · <time dateTime={i.date}>{i.date}</time>
          </p>
          <p className="mt-1">{pick(lang === "ja", i.what_ja, i.what)}</p>
          <a href={i.source} className={`${linkClass} mt-1 inline-block`} rel="noopener noreferrer">
            {t.advisory}
          </a>
        </div>
      ))}
      {state === "archived" && <p className="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-xs leading-6 text-[var(--bad)]">{t.archived}</p>}
      {state === "quiet" && <p className="rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-xs leading-6 text-[var(--warn)]">{t.quiet(quietAfterDays)}</p>}
    </article>
  );
}
