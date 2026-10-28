"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ReportView, type PhpState } from "./report-view";
import { Site } from "./site";
import { runCheck, type PageResult } from "@/lib/check";
import { parseDomain } from "@/lib/dns";
import { dohResolver } from "@/lib/doh";
import { version } from "@/lib/meta";
import { Table, type Provider } from "@/lib/provider";
import { base, homeHref, messages, otherLang, type Lang } from "@/lib/lang";
import { addPage, type Report } from "@/lib/report";

export function checkHref(input: string, lang: Lang): string {
  const prefix = base(lang);
  const trimmed = input.trim();
  if (trimmed === "") return homeHref(lang);
  return `${prefix}/check#${parseDomain(trimmed) ?? encodeURIComponent(trimmed)}`;
}

export function Arrow({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

export function CheckForm({ lang, id = "domain", className = "mt-8" }: { lang: Lang; id?: string; className?: string }) {
  const s = messages(lang).ui;
  return (
    <form
      className={`flex items-center gap-2 rounded-2xl border border-rule-strong bg-surface p-2 shadow-[0_16px_40px_-24px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow] duration-700 ease-fluid focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)] ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        const input = new FormData(e.currentTarget).get("domain");
        window.location.assign(checkHref(typeof input === "string" ? input : "", lang));
      }}
    >
      <label htmlFor={id} className="sr-only">
        {s.inputLabel}
      </label>
      <span aria-hidden="true" className="hidden pl-2 font-mono text-sm text-faint sm:block">
        https://
      </span>
      <input
        id={id}
        name="domain"
        required
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={s.inputPlaceholder}
        className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-lg outline-none placeholder:text-muted sm:px-0"
      />
      <button
        type="submit"
        className="group/btn inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-base font-semibold text-accent-ink transition-[transform,filter] duration-700 ease-fluid hover:brightness-110 active:scale-[0.98]"
      >
        {s.submit}
        <ArrowRightIcon weight="bold" className="size-4 transition-transform duration-700 ease-fluid group-hover/btn:translate-x-1" aria-hidden="true" />
      </button>
    </form>
  );
}

type View =
  | { kind: "start" }
  | { kind: "none" }
  | { kind: "invalid"; input: string }
  | { kind: "checking"; domain: string }
  | { kind: "report"; report: Report; php: PhpState; phpAgeS: number };

type PhpOutcome = { kind: "done"; page: PageResult; ageS: number } | { kind: "limited" | "unavailable" };

async function askPhp(domain: string): Promise<PhpOutcome> {
  try {
    const res = await fetch("/api/php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    if (res.status === 429) return { kind: "limited" };
    if (!res.ok) return { kind: "unavailable" };
    const { age_s, ...page } = (await res.json()) as PageResult & { age_s: number };
    return { kind: "done", page, ageS: age_s };
  } catch {
    return { kind: "unavailable" };
  }
}

function fragment(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return window.location.hash.slice(1);
  }
}

export function CheckView({
  providers,
  incident,
  incidentCves,
  updatedAt,
  lang,
}: {
  providers: Provider[];
  incident: string;
  incidentCves: string[];
  updatedAt: string;
  lang: Lang;
}) {
  const s = messages(lang).ui;
  const table = useMemo(() => new Table(incident, incidentCves, updatedAt, providers), [incident, incidentCves, updatedAt, providers]);
  const [view, setView] = useState<View>({ kind: "start" });
  const latest = useRef(0);

  useEffect(() => {
    async function start() {
      const run = ++latest.current;
      const current = () => run === latest.current;
      const input = fragment().trim();
      const domain = parseDomain(input);
      if (input === "") return setView({ kind: "none" });
      if (!domain) return setView({ kind: "invalid", input });
      setView({ kind: "checking", domain });
      const report = await runCheck(domain, { table, resolver: dohResolver(), version, lang });
      if (!current()) return;
      if (report.hosts.length === 0) return setView({ kind: "report", report, php: "done", phpAgeS: 0 });
      setView({ kind: "report", report, php: "pending", phpAgeS: 0 });
      const php = await askPhp(domain);
      if (!current()) return;
      if (php.kind !== "done") return setView({ kind: "report", report, php: php.kind, phpAgeS: 0 });
      const withPage = structuredClone(report);
      addPage(withPage, php.page, lang, table);
      setView({ kind: "report", report: withPage, php: "done", phpAgeS: php.ageS });
    }
    const onHashChange = () => void start();
    void start();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [table, lang]);

  const domain = view.kind === "checking" ? view.domain : view.kind === "report" ? view.report.domain : "";
  const alt = `${base(otherLang(lang))}/check${domain ? `#${domain}` : ""}`;
  return (
    <Site lang={lang} alt={alt} incident={incident} wide>
      {(view.kind === "start" || view.kind === "checking") && <Checking domain={view.kind === "checking" ? view.domain : ""} lang={lang} />}
      {(view.kind === "none" || view.kind === "invalid") && (
        <div className="rise max-w-2xl">
          <p className="rounded-2xl border border-[var(--warn)]/30 bg-[var(--warn-soft)]/60 p-5 leading-7">
            {view.kind === "none" ? s.noDomain : s.invalid(view.input)}
          </p>
          <CheckForm lang={lang} />
        </div>
      )}
      {view.kind === "report" && <ReportView report={view.report} table={table} lang={lang} php={view.php} phpAgeS={view.phpAgeS} />}
    </Site>
  );
}

function Checking({ domain, lang }: { domain: string; lang: Lang }) {
  const s = messages(lang).ui;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <output> allows only phrasing content, and this status holds blocks
    <div role="status" className="rise">
      <div className="flex items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full border border-rule-strong">
          <span className="absolute inset-0 animate-[sweep_1.6s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_0_75%,color-mix(in_oklab,var(--accent)_70%,transparent))]" />
          <span className="relative size-3 rounded-full bg-accent" />
        </span>
        <p className="min-w-0 font-mono text-[clamp(1.5rem,4vw+0.5rem,3rem)] leading-tight font-semibold tracking-[-0.03em] break-all">{domain || "…"}</p>
      </div>
      <p className="mt-6 text-sm text-muted">{s.checking}</p>
      <ol className="mt-6 grid gap-2 sm:grid-cols-4">
        {s.steps.map((step, i) => (
          <li key={step} className="rise rounded-xl border border-rule bg-surface p-4" style={{ "--i": i + 1 } as CSSProperties}>
            <span className="font-mono text-[11px] text-accent">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-1 text-sm font-semibold">{step}</p>
            <span className="shimmer mt-3 block h-1 rounded-full" style={{ animationDelay: `${i * 200}ms` }} />
          </li>
        ))}
      </ol>
      <div className="mt-10 space-y-3" aria-hidden="true">
        <span className="shimmer block h-28 rounded-3xl" />
        <span className="shimmer block h-4 w-2/3 rounded-full" />
        <span className="shimmer block h-4 w-1/2 rounded-full" />
      </div>
    </div>
  );
}
