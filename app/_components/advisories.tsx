import Link from "next/link";
import type { CSSProperties } from "react";
import { PageHead } from "./pages";
import { CheckedOn, CopyButton, StaleBlock, StaleRow } from "./client";
import { guidePath, Linkified, linkClass, Site, StatusBadge } from "./site";
import { fillAsk, type Advisory, type FixState } from "@/lib/advisory";
import { base, messages, otherLang, type Lang } from "@/lib/lang";
import { repoUrl } from "@/lib/meta";
import { pick } from "@/lib/report";
import { staleAfterDays } from "@/lib/stale";
import { table } from "@/lib/table";

const th = "border-b border-rule-strong px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted";
const td = "border-b border-rule px-3 py-3 align-top";
const statementsShownOpen = 10;

const fixStateColors: Record<FixState, string> = {
  patched: "bg-[var(--ok-soft)] text-[var(--ok)]",
  testing: "bg-[var(--warn-soft)] text-[var(--warn)]",
  none: "bg-[var(--bad-soft)] text-[var(--bad)]",
};

function FixBadge({ state, lang }: { state: FixState; lang: Lang }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap ${fixStateColors[state]}`}>
      {messages(lang).ui.advisories.fixStateLabels[state]}
    </span>
  );
}

export function AdvisoriesPage({ lang }: { lang: Lang }) {
  const s = messages(lang).ui;
  const t = s.advisories;
  return (
    <Site lang={lang} alt={`${base(otherLang(lang))}/advisories`} wide>
      <PageHead eyebrow={t.eyebrow} title={t.title}>
        <p className="mt-4 max-w-3xl leading-8 text-muted">{t.intro}</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{t.staleNote(staleAfterDays)}</p>
      </PageHead>
      <nav aria-label={t.contents} className="rise mb-12" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="mb-2 text-xs font-semibold text-muted">{t.contents}</h2>
        <ul className="flex flex-wrap gap-2">
          {table.advisories.map((a) => (
            <li key={a.id}>
              <a href={`#${a.id}`} className="inline-flex rounded-full border border-rule bg-surface px-3 py-1 text-sm transition-colors hover:border-ink">
                {pick(lang === "ja", a.title, a.title_en)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-16">
        {table.advisories.map((a) => (
          <AdvisoryEntry key={a.id} advisory={a} lang={lang} />
        ))}
      </div>
      <p className="mt-12 text-xs">
        <a href={`${repoUrl}/blob/main/data/advisories.yaml`} className={linkClass}>
          {s.correction}
        </a>
      </p>
    </Site>
  );
}

function AdvisoryEntry({ advisory: a, lang }: { advisory: Advisory; lang: Lang }) {
  const s = messages(lang).ui;
  const t = s.advisories;
  const ja = lang === "ja";
  const ask = fillAsk(pick(ja, a.ask, a.ask_en), t.askVendor, t.askDomain);
  return (
    <article id={a.id} aria-labelledby={`${a.id}-title`} className="reveal scroll-mt-24 border-t border-rule pt-8">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a href={a.cvss_source} className="rounded-full bg-[var(--bad-soft)] px-2.5 py-0.5 font-semibold text-[var(--bad)]" rel="noopener noreferrer">
          {t.severity(a.cvss_version, a.cvss)}
        </a>
        {a.cves.map((c) => (
          <code key={c} className="rounded-md bg-sunken px-2 py-0.5 font-mono">
            {c}
          </code>
        ))}
        <span className="text-muted">
          {t.published} <time dateTime={a.published}>{a.published}</time>
        </span>
      </div>
      <h2 id={`${a.id}-title`} className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {pick(ja, a.title, a.title_en)}
      </h2>
      <p className="mt-3 max-w-3xl leading-8">{pick(ja, a.summary, a.summary_en)}</p>
      {a.guide && (
        <Link href={guidePath(lang, a.id)} className="link mt-3 inline-block text-sm">
          {s.readGuide}
        </Link>
      )}

      <section className="mt-8">
        <h3 className="text-sm font-semibold text-muted">{t.upstreamFix}</h3>
        <StaleBlock checkedOn={a.upstream.checked_at} className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <a href={a.upstream.url} className={`${linkClass} break-all`} rel="noopener noreferrer">
            {a.upstream.label}
          </a>
          <span className="text-xs text-muted">
            {s.verifiedOn} <CheckedOn date={a.upstream.checked_at} lang={lang} />
          </span>
        </StaleBlock>
      </section>

      {a.fixes.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-semibold text-muted">{t.fixesTitle}</h3>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>{t.colVendor}</th>
                  <th className={th}>{t.colState}</th>
                  <th className={`${th} hidden md:table-cell`}>{t.colDetail}</th>
                  <th className={th}>{t.colChecked}</th>
                </tr>
              </thead>
              <tbody>
                {a.fixes.map((f) => (
                  <StaleRow key={f.name} checkedOn={f.checked_at}>
                    <td className={`${td} font-semibold`}>
                      <a href={f.source} className="link" rel="noopener noreferrer">
                        {f.name}
                      </a>
                      <span className="mt-1 block text-xs font-normal text-muted md:hidden">{pick(ja, f.detail, f.detail_en)}</span>
                    </td>
                    <td className={td}>
                      <FixBadge state={f.state} lang={lang} />
                    </td>
                    <td className={`${td} hidden text-muted md:table-cell`}>{pick(ja, f.detail, f.detail_en)}</td>
                    <td className={td}>
                      <CheckedOn date={f.checked_at} lang={lang} />
                    </td>
                  </StaleRow>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--warn)]/30 bg-[var(--warn-soft)]/40 p-5 sm:p-6">
          <h3 className="text-sm font-semibold">{t.stopgap}</h3>
          <p className="mt-2 text-sm leading-7">
            <Linkified text={pick(ja, a.stopgap, a.stopgap_en)} />
          </p>
        </section>
        <section className="rounded-2xl border border-rule bg-sunken p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t.askTitle}</h3>
            <CopyButton text={ask} lang={lang} />
          </div>
          <textarea
            readOnly
            aria-label={t.askTitle}
            value={ask}
            rows={10}
            className="mt-3 block w-full resize-y rounded-lg border border-rule bg-paper p-3 font-mono text-[12px] leading-6 outline-none focus:border-accent"
          />
        </section>
      </div>

      <ProviderStatements advisory={a} lang={lang} />
    </article>
  );
}

function ProviderStatements({ advisory: a, lang }: { advisory: Advisory; lang: Lang }) {
  const m = messages(lang);
  const s = m.ui;
  const t = s.advisories;
  const ja = lang === "ja";
  const rows = table.providers.flatMap((p) =>
    table
      .advisoriesOf(p)
      .filter((x) => x.advisory.id === a.id)
      .map((x) => ({ provider: p, entry: x.entry })),
  );
  const stated = rows.filter((r) => r.entry);
  const silent = rows.filter((r) => !r.entry);
  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold text-muted">{t.providersTitle}</h3>
      <p className="mt-1 max-w-3xl text-xs leading-6 text-muted">{t.providersNote(a.providers_checked_at)}</p>
      <details open={stated.length <= statementsShownOpen} className="group mt-3 rounded-2xl border border-rule bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t.providersCount(stated.length, rows.length)}</summary>
        {stated.length > 0 && (
          <div className="overflow-x-auto border-t border-rule">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>{s.colName}</th>
                  <th className={th}>{t.colAnnounced}</th>
                  <th className={`${th} hidden sm:table-cell`}>{s.colConfidence}</th>
                  <th className={th}>{t.colChecked}</th>
                </tr>
              </thead>
              <tbody>
                {stated.map(({ provider: p, entry }) =>
                  entry ? (
                    <StaleRow key={p.id} checkedOn={entry.verified_at}>
                      <td className={td}>
                        <Link href={`${base(lang)}/providers/${p.id}#${a.id}`} className="link font-semibold">
                          {pick(ja, p.name_ja, p.name)}
                        </Link>
                      </td>
                      <td className={td}>
                        <StatusBadge status={entry.status} lang={lang} />
                      </td>
                      <td className={`${td} hidden text-muted sm:table-cell`}>
                        {entry.source ? (
                          <a href={entry.source} className="link" rel="noopener noreferrer">
                            {m.confLabels[entry.confidence]}
                          </a>
                        ) : (
                          m.confLabels[entry.confidence]
                        )}
                        {entry.date && <span className="font-mono"> · {entry.date}</span>}
                      </td>
                      <td className={td}>
                        <CheckedOn date={entry.verified_at} lang={lang} />
                      </td>
                    </StaleRow>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        )}
        {silent.length > 0 && (
          <div className="border-t border-rule px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-muted">
              {s.noStatement} · <time dateTime={a.providers_checked_at}>{a.providers_checked_at}</time>
            </p>
            <p className="mt-1 leading-7 text-muted">
              {silent.map(({ provider: p }, i) => (
                <span key={p.id}>
                  {i > 0 && (ja ? "、" : ", ")}
                  <Link href={`${base(lang)}/providers/${p.id}`} className="hover:text-ink hover:underline">
                    {pick(ja, p.name_ja, p.name)}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        )}
      </details>
    </section>
  );
}
