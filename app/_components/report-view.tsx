import Link from "next/link";
import type { CSSProperties } from "react";
import { CopyButton, JumpWithoutFragment, StaleNotice } from "./client";
import { Linkified, SectionHead, statusColor, StatusBadge } from "./site";
import type { Incident, Table } from "@/lib/provider";
import { base, messages, type Lang } from "@/lib/lang";
import { incidentChecks, pick, reportJson, type Report } from "@/lib/report";

export type PhpState = "pending" | "limited" | "unavailable" | "done";

function jst(iso: string, lang: Lang): string {
  const f = new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-GB", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${f.format(new Date(iso))} JST`;
}

const th = "border-b border-rule-strong px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted";
const td = "border-b border-rule px-3 py-3 align-top";

const verdictScale = ["none", "unlikely", "possible", "likely"] as const;
const verdictTone = { none: "var(--idle)", unlikely: "var(--ok)", possible: "var(--warn)", likely: "var(--accent)" };

export function ReportView({ report: r, table, lang, php, phpAgeS }: { report: Report; table: Table; lang: Lang; php: PhpState; phpAgeS: number }) {
  const s = messages(lang);
  const ja = lang === "ja";
  const name = (id?: string) => {
    const h = id ? r.providers.find((p) => p.id === id) : undefined;
    return h ? pick(ja, h.name_ja, h.name) : "";
  };
  const p = base(lang);

  const rows: { role: string; host: string; value: string; network: string; provider: string }[] = [];
  for (const h of r.hosts) {
    if (h.cname) rows.push({ role: s.ui.roleLabels.cname, host: h.name, value: h.cname, network: "", provider: name(h.cname_provider_id) });
    for (const ip of h.ips) {
      rows.push({
        role: s.ui.roleLabels.web,
        host: h.name,
        value: ip.ip,
        network: ip.error ? `(${ip.error})` : `AS${ip.asn} ${ip.as_name ?? ""}`,
        provider: name(ip.provider_id),
      });
    }
  }
  for (const h of r.providers) {
    for (const ev of h.evidence) {
      const m = h.roles.includes("http") ? ev.match(/^(\S+) response header (\S+)$/) : null;
      if (m) rows.push({ role: s.ui.roleLabels.http, host: m[1], value: m[2], network: "", provider: pick(ja, h.name_ja, h.name) });
    }
  }
  const leaf = r.tls?.chain?.[0];
  if (r.tls && leaf) {
    const ca = r.providers.find((h) => h.roles.includes("tls"));
    rows.push({
      role: s.ui.roleLabels.tls,
      host: r.tls.host,
      value: [leaf.issuer_cn, leaf.issuer_o && `(${leaf.issuer_o})`].filter(Boolean).join(" "),
      network: "",
      provider: ca ? pick(ja, ca.name_ja, ca.name) : "",
    });
  }
  for (const n of r.ns) rows.push({ role: s.ui.roleLabels.ns, host: n.host, value: "", network: "", provider: name(n.provider_id) });
  for (const n of r.mx) rows.push({ role: s.ui.roleLabels.mx, host: n.host, value: "", network: "", provider: name(n.provider_id) });

  let n = 0;
  return (
    <div>
      <header className="rise relative pb-10">
        <p className="font-mono text-xs tracking-wide text-muted">
          {s.title} · {s.checkedAt} {jst(r.checked_at, lang)}
        </p>
        <h1 className="mt-3 font-mono text-[clamp(1.9rem,5vw+0.5rem,4rem)] leading-[1.05] font-semibold tracking-[-0.03em] break-all">{r.domain}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {php !== "pending" && <CopyButton text={JSON.stringify(reportJson(r), null, 2)} lang={lang} label={s.ui.copyJson} />}
        </div>
      </header>

      <Checklist report={r} table={table} lang={lang} php={php} />

      {r.providers.length > 0 && <VendorMap report={r} lang={lang} />}

      <section className="reveal mt-16">
        <SectionHead n={++n} title={s.secProviders} />
        {r.hosts.length === 0 && <Callout>{s.noHosts}</Callout>}
        {rows.length > 0 && (
          <ul className="grid gap-2 md:hidden">
            {rows.map((row, i) => (
              <li key={i} className="rounded-xl border border-rule bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-sunken px-2 py-0.5 text-xs font-medium">{row.role}</span>
                  {row.provider && <span className="font-semibold">{row.provider}</span>}
                </div>
                <p className="mt-2 font-mono text-[13px] [overflow-wrap:anywhere]">{row.host}</p>
                {row.value && <p className="font-mono text-[13px] text-muted [overflow-wrap:anywhere]">→ {row.value}</p>}
                {row.network && <p className="mt-1 text-xs text-muted">{row.network}</p>}
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>{s.ui.colRole}</th>
                  <th className={th}>{s.ui.colHost}</th>
                  <th className={th}>{s.ui.colAddress}</th>
                  <th className={th}>{s.ui.colNetwork}</th>
                  <th className={th}>{s.ui.colProvider}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="transition-colors hover:bg-surface">
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="rounded-md bg-sunken px-2 py-0.5 text-xs font-medium">{row.role}</span>
                    </td>
                    <td className={`${td} font-mono text-[13px] whitespace-nowrap`}>{row.host}</td>
                    <td className={`${td} font-mono text-[13px] [overflow-wrap:anywhere]`}>{row.value}</td>
                    <td className={`${td} min-w-[12rem] text-[13px] text-muted`}>{row.network}</td>
                    <td className={`${td} min-w-[8rem] font-semibold`}>{row.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="php" className="reveal mt-16 scroll-mt-24">
        <SectionHead n={++n} title={s.secPHP} />
        {!r.http &&
          (php === "pending" ? (
            <div className="rounded-2xl border border-rule bg-surface p-6">
              <p className="flex items-center gap-3 text-sm">
                <Spinner />
                {s.ui.phpChecking}
              </p>
              <div className="mt-5 grid grid-cols-4 gap-1.5">
                {verdictScale.map((v) => (
                  <span key={v} className="shimmer h-2 rounded-full" />
                ))}
              </div>
            </div>
          ) : (
            <Callout tone={php === "done" ? "idle" : "warn"}>
              {php === "limited" ? s.ui.phpLimited : php === "unavailable" ? s.ui.phpUnavailable : s.httpSkipped}
            </Callout>
          ))}
        {r.http && phpAgeS >= 60 && <p className="mb-3 text-xs text-muted">{s.ui.phpCachedNote(Math.floor(phpAgeS / 60))}</p>}
        {r.http && !r.php && (
          <Callout tone="warn">
            {s.httpFailed} <span className="font-mono break-all">{r.http.url}</span>: {r.http.status ? `HTTP ${r.http.status}` : r.http.error}
          </Callout>
        )}
        {r.http && r.php && (
          <div className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:grid-cols-[1.2fr_1fr]">
            <div className="bg-surface p-6 sm:p-8">
              <p className="text-xs text-muted">{s.verdict}</p>
              <p className="display mt-2 text-2xl font-bold sm:text-3xl" style={{ color: verdictTone[r.php.verdict] }}>
                {s.verdictLabels[r.php.verdict]}
              </p>
              <div className="mt-6 grid grid-cols-4 gap-1.5" aria-hidden="true">
                {verdictScale.map((v, i) => (
                  <span
                    key={v}
                    className="rise h-2 rounded-full"
                    style={
                      {
                        "--i": i,
                        background: i <= verdictScale.indexOf(r.php!.verdict) ? verdictTone[r.php!.verdict] : "var(--sunken)",
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <p className="mt-6 text-sm">
                <span className="text-muted">{s.versionShown}</span>{" "}
                <span className="font-semibold">
                  {r.php.php_version ? (
                    <>
                      <span className="font-mono">{r.php.php_version}</span> ({s.versionLabels[r.php.version_status ?? "unknown"]})
                    </>
                  ) : (
                    s.versionHidden
                  )}
                </span>
              </p>
            </div>
            <div className="bg-surface p-6 sm:p-8">
              <p className="text-xs text-muted">
                {s.httpFrom} <span className="font-mono break-all text-ink">{r.http.final_url}</span>{" "}
                <span className="rounded bg-sunken px-1.5 py-0.5 font-mono">HTTP {r.http.status}</span>
              </p>
              {r.php.signals.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {r.php.signals.map((sig, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-6">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="min-w-0 break-all">
                        <span className="font-semibold">{sig.kind}</span> <span className="font-mono text-muted">{sig.evidence}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="reveal mt-16">
        <SectionHead n={++n} title={s.secStatus(table.incident)} />
        {r.providers.length === 0 && <Callout>{s.noProviders}</Callout>}
        <div className={`grid gap-4 ${r.providers.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {r.providers.map((h) => (
            <article
              key={h.id}
              id={`p-${h.id}`}
              className="group relative scroll-mt-24 overflow-hidden rounded-2xl border border-rule bg-surface p-6 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-[0_20px_40px_-28px_rgb(0_0_0/0.5)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {h.roles.map((role) => s.ui.roleLabels[role]).join(" · ")} — {s.kindLabels[h.kind]}
                  </p>
                  <Link href={`${p}/providers/${h.id}`} className="link mt-1 inline-block text-lg font-bold">
                    {pick(ja, h.name_ja, h.name)}
                  </Link>
                </div>
                {h.incident && <StatusBadge status={h.incident.status} lang={lang} />}
              </div>
              {h.incident ? (
                <IncidentDetails inc={h.incident} lang={lang} />
              ) : (
                pick(ja, h.notes_ja, h.notes) && <p className="mt-3 text-sm leading-7 text-muted">{pick(ja, h.notes_ja, h.notes)}</p>
              )}
              {h.other_incidents?.map((i) => (
                <div key={i.key} className="mt-5 rounded-xl border border-[var(--bad)]/30 bg-[var(--bad-soft)]/50 p-4">
                  <p className="font-mono text-[11px] tracking-wide text-[var(--bad)] uppercase">{s.ui.otherIncidents}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{pick(ja, i.title, i.title_en)}</h3>
                    <StatusBadge status={i.status} lang={lang} />
                  </div>
                  <IncidentDetails inc={i} lang={lang} />
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mt-16">
        <SectionHead n={++n} title={s.secActions} />
        <ol className="space-y-px overflow-hidden rounded-2xl border border-rule bg-rule">
          {r.actions.map((a, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-3 bg-surface p-5 leading-7 sm:grid-cols-[3.5rem_1fr] sm:p-6">
              <span className="font-mono text-2xl leading-7 font-light text-accent sm:text-3xl">{i + 1}</span>
              <span className="min-w-0">
                <Linkified text={a} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="reveal mt-16">
        <SectionHead n={++n} title={s.secTemplate}>
          <CopyButton text={r.message_template} lang={lang} />
        </SectionHead>
        <div className="overflow-hidden rounded-2xl border border-rule bg-sunken transition-colors focus-within:border-accent">
          <div className="flex items-center gap-1.5 border-b border-rule px-4 py-2.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-rule-strong" />
            <span className="size-2.5 rounded-full bg-rule-strong" />
            <span className="size-2.5 rounded-full bg-rule-strong" />
          </div>
          <textarea
            readOnly
            aria-label={s.secTemplate}
            value={r.message_template}
            rows={Math.min(24, r.message_template.split("\n").length + 1)}
            className="block w-full resize-y bg-transparent p-5 font-mono text-[13px] leading-6 outline-none"
          />
        </div>
      </section>

      {r.warnings && r.warnings.length > 0 && (
        <section className="mt-12 rounded-2xl border border-dashed border-rule-strong p-5 text-xs text-muted">
          <h2 className="mb-2 font-semibold text-ink">{s.warnings}</h2>
          <ul className="space-y-1">
            {r.warnings.map((w, i) => (
              <li key={i} className="font-mono break-all">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 max-w-3xl text-xs leading-6 text-muted">{s.disclaimer}</p>
    </div>
  );
}

function VendorMap({ report: r, lang }: { report: Report; lang: Lang }) {
  const s = messages(lang);
  const ja = lang === "ja";
  return (
    <section className="rise relative overflow-hidden rounded-3xl border border-rule bg-surface p-5 sm:p-8" style={{ "--i": 1 } as CSSProperties}>
      <div className="grain pointer-events-none absolute inset-0 opacity-70" />
      <p className="relative font-mono text-[11px] tracking-[0.18em] text-muted uppercase">{s.ui.mapCaption}</p>
      <div className="relative mt-6 grid items-center gap-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-0">
        <div className="relative z-10 flex items-center gap-3 rounded-2xl bg-ink p-4 text-paper md:mr-0">
          <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent">
            <span className="halo absolute inset-0 rounded-full bg-accent" />
            <span className="relative size-3 rounded-full bg-accent-ink" />
          </span>
          <span className="min-w-0 font-mono text-sm break-all">{r.domain}</span>
        </div>
        <ul className="relative space-y-2 pl-6 md:pl-10">
          {r.providers.map((h, i) => (
            <li key={h.id} className="group/li rise relative" style={{ "--i": i + 2 } as CSSProperties}>
              <span className="absolute -top-1 -bottom-1 -left-6 w-px bg-rule-strong group-first/li:top-1/2 group-last/li:bottom-1/2 md:-left-10" />
              <span className="absolute top-1/2 -left-6 h-px w-6 bg-rule-strong md:-left-10 md:w-10" />
              <JumpWithoutFragment
                to={`p-${h.id}`}
                className="group flex w-full text-left flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rule bg-paper px-4 py-2.5 transition-[border-color,transform] duration-300 ease-out-expo hover:translate-x-1 hover:border-ink"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: h.incident ? statusColor[h.incident.status] : "var(--rule-strong)" }} />
                <span className="font-semibold">{pick(ja, h.name_ja, h.name)}</span>
                <span className="flex flex-wrap gap-1">
                  {h.roles.map((role) => (
                    <span key={role} className="rounded-md bg-sunken px-1.5 py-0.5 text-[11px] text-muted">
                      {s.ui.roleLabels[role]}
                    </span>
                  ))}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {h.other_incidents && h.other_incidents.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bad-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--bad)]">
                      <span aria-hidden="true">⚠</span>
                      {h.other_incidents.map((i) => pick(ja, i.title, i.title_en)).join(" / ")}
                    </span>
                  )}
                  {h.incident && <StatusBadge status={h.incident.status} lang={lang} />}
                </span>
              </JumpWithoutFragment>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Checklist({ report: r, table, lang, php }: { report: Report; table: Table; lang: Lang; php: PhpState }) {
  const s = messages(lang);
  const ja = lang === "ja";
  type Row = { key: string; title: string; result: string; tone: string; target?: string };
  const phpRow: Row = r.php
    ? {
        key: "php",
        title: s.ui.incidentLabel(table.incident, table.incident_cves),
        result: s.verdictLabels[r.php.verdict],
        tone: r.php.verdict === "likely" || r.php.verdict === "possible" ? "var(--warn)" : "var(--ok)",
        target: "php",
      }
    : php === "pending"
      ? { key: "php", title: s.ui.incidentLabel(table.incident, table.incident_cves), result: s.ui.checkPending, tone: "var(--idle)" }
      : { key: "php", title: s.ui.incidentLabel(table.incident, table.incident_cves), result: s.ui.checkFailed, tone: "var(--idle)", target: "php" };
  const rows: Row[] = [
    phpRow,
    ...incidentChecks(r, table).map((c): Row => {
      const name = pick(ja, c.provider.name_ja, c.provider.name);
      const title = `${name}: ${pick(ja, c.incident.title, c.incident.title_en)}`;
      if (c.result === "found") return { key: c.incident.key, title, result: s.ui.checkFound(name), tone: "var(--bad)", target: `p-${c.provider.id}` };
      if (c.result === "clear") {
        const leaf = c.provider.cert_issuers.length > 0 ? r.tls?.chain?.[0] : undefined;
        const issuer = leaf && (leaf.issuer_o || leaf.issuer_cn);
        return { key: c.incident.key, title, result: issuer ? s.ui.checkClearIssuer(issuer) : s.ui.checkClear, tone: "var(--ok)" };
      }
      const waiting = c.missing === "page" ? php === "pending" : php === "pending" && !r.tls;
      return { key: c.incident.key, title, result: waiting ? s.ui.checkPending : s.ui.checkMissing[c.missing!], tone: "var(--idle)" };
    }),
  ];
  return (
    <section className="rise mb-14" style={{ "--i": 1 } as CSSProperties}>
      <h2 className="mb-3 text-sm font-semibold text-muted">{s.ui.checksTitle}</h2>
      <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
        {rows.map((row) => {
          const body = (
            <>
              <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: row.tone }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-6 font-semibold">{row.title}</span>
                <span className="block text-[13px] leading-6" style={{ color: row.tone === "var(--idle)" ? "var(--muted)" : row.tone }}>
                  {row.result}
                </span>
              </span>
            </>
          );
          return (
            <li key={row.key}>
              {row.target ? (
                <JumpWithoutFragment to={row.target} className="flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-sunken/60">
                  {body}
                  <span className="self-center text-muted" aria-hidden="true">
                    ↓
                  </span>
                </JumpWithoutFragment>
              ) : (
                <div className="flex gap-3 px-5 py-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-6 text-muted">{s.ui.checksNote}</p>
    </section>
  );
}

function Callout({ children, tone = "idle" }: { children: React.ReactNode; tone?: "idle" | "warn" }) {
  return (
    <p
      className={`rounded-2xl border p-5 text-sm leading-7 ${tone === "warn" ? "border-[var(--warn)]/30 bg-[var(--warn-soft)]/60" : "border-rule bg-surface text-muted"}`}
    >
      {children}
    </p>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-rule-strong border-t-accent" />;
}

function IncidentDetails({ inc, lang }: { inc: Incident; lang: Lang }) {
  const s = messages(lang);
  const ja = lang === "ja";
  return (
    <div className="mt-3 space-y-3 text-sm leading-7">
      <p className="text-xs text-muted">
        {s.confLabels[inc.confidence]}
        {inc.date && ` · ${inc.date}`}
      </p>
      <p>{pick(ja, inc.summary, inc.summary_en)}</p>
      <div className="rounded-lg bg-sunken p-3">
        <p className="text-xs font-semibold text-muted">{s.customerAction}</p>
        <p className="mt-1">{pick(ja, inc.customer_action, inc.customer_action_en)}</p>
      </div>
      {inc.source && (
        <p className="text-xs text-muted">
          {s.source}{" "}
          <a href={inc.source} className="link break-all" rel="noopener noreferrer">
            {inc.source}
          </a>{" "}
          ({s.verified} {inc.verified_at})
        </p>
      )}
      <StaleNotice verifiedAt={inc.verified_at} lang={lang} />
    </div>
  );
}
