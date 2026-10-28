import Link from "next/link";
import type { ReactNode } from "react";
import { IslandNav, SkipLink } from "./nav";
import { base, homeHref, messages, otherLang, type Lang } from "@/lib/lang";
import type { Status } from "@/lib/provider";
import { repoUrl, version } from "@/lib/meta";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M16 16 8.6 10.8M16 16l7.4-5.2M16 16v7.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="6" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="26" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="27" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="5.8" fill="var(--accent)" />
    </svg>
  );
}

export function guidePath(lang: Lang, incident: string): string {
  return `${base(lang)}/guide/${incident}`;
}

export function Site({ lang, alt, incident, children, wide = false }: { lang: Lang; alt: string; incident: string; children: ReactNode; wide?: boolean }) {
  const s = messages(lang).ui;
  const p = base(lang);
  const frame = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SkipLink label={s.skip} />
      <IslandNav
        brand={
          <Link href={homeHref(lang)} className="group flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
            <Mark className="size-6 transition-transform duration-700 ease-fluid group-hover:rotate-[60deg]" />
            OpenVMap
          </Link>
        }
        items={[
          { href: homeHref(lang), label: s.nav.home },
          { href: `${p}/providers`, label: s.nav.providers },
          { href: guidePath(lang, incident), label: s.nav.guide },
          { href: `${p}/tools`, label: s.nav.tools },
          { href: `${p}/about`, label: s.nav.about },
        ]}
        alt={alt}
        altLang={otherLang(lang)}
        altLabel={s.switchLang}
        menuLabel={s.menu}
      />
      <main id="main" tabIndex={-1} className={`mx-auto w-full ${frame} flex-1 px-4 pt-10 pb-24 outline-none sm:px-6 sm:pt-14`}>
        {children}
      </main>
      <footer className="border-t border-rule">
        <div className={`mx-auto flex ${frame} flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-xs text-muted sm:px-6`}>
          <span className="flex items-center gap-2 font-mono text-ink">
            <Mark className="size-5" />
            OpenVMap <span className="text-muted">v{version}</span>
          </span>
          <span className="max-w-md leading-6">{s.tagline}</span>
          <span className="ml-auto flex flex-wrap gap-x-4 gap-y-2">
            <Link href={`${p}/about#privacy`} className="link">
              {s.privacy}
            </Link>
            <Link href={`${p}/about#terms`} className="link">
              {s.terms}
            </Link>
            <a href={repoUrl} className="link font-mono" rel="noopener noreferrer">
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

const badgeColors: Record<Status, string> = {
  patched: "bg-[var(--ok-soft)] text-[var(--ok)]",
  in_progress: "bg-[var(--warn-soft)] text-[var(--warn)]",
  unknown: "bg-[var(--idle-soft)] text-[var(--idle)]",
  conflicting: "bg-[var(--bad-soft)] text-[var(--bad)]",
  "n/a": "bg-[var(--info-soft)] text-[var(--info)]",
};

export const statusColor: Record<Status, string> = {
  patched: "var(--ok)",
  in_progress: "var(--warn)",
  unknown: "var(--idle)",
  conflicting: "var(--bad)",
  "n/a": "var(--info)",
};

export function StatusBadge({ status, lang }: { status: Status; lang: Lang }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap ${badgeColors[status]}`}>
      <span className={`relative size-1.5 rounded-full bg-current ${status === "in_progress" ? "pulse" : ""}`} />
      {messages(lang).statusLabels[status]}
    </span>
  );
}

export function SectionHead({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-rule pt-5">
      <span className="font-mono text-xs text-accent">{String(n).padStart(2, "0")}</span>
      <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}

export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)）]+)/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} className="link break-all" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export const linkClass = "link";
