"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { messages, type Lang } from "@/lib/lang";
import { daysSince, staleAfterDays } from "@/lib/stale";

export function CopyButton({ text, lang, label }: { text: string; lang: Lang; label?: string }) {
  const s = messages(lang).ui;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      data-copied={copied || undefined}
      className="group inline-flex items-center gap-1.5 rounded-full border border-rule-strong bg-surface px-3 py-1 text-xs font-medium text-ink transition-all hover:-translate-y-px hover:border-ink active:translate-y-0 data-copied:border-[var(--ok)] data-copied:text-[var(--ok)]"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {copied ? (
          <path d="m3 8.5 3 3 7-7" />
        ) : (
          <path d="M5.5 5.5V3.2c0-.4.3-.7.7-.7h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7H10.5M3.2 5.5h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7V6.2c0-.4.3-.7.7-.7Z" />
        )}
      </svg>
      <span aria-live="polite">{copied ? s.copied : (label ?? s.copy)}</span>
    </button>
  );
}

export function JumpWithoutFragment({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const jump = () => {
    const target = document.getElementById(to);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  };
  return (
    <button type="button" onClick={jump} className={className}>
      {children}
    </button>
  );
}

const ignoreClockChanges = () => () => {};
const notKnownUntilTheViewersClock = null;

export function StaleNotice({ verifiedAt, lang }: { verifiedAt: string; lang: Lang }) {
  const age = useSyncExternalStore(
    ignoreClockChanges,
    () => daysSince(verifiedAt, Date.now()),
    () => notKnownUntilTheViewersClock,
  );
  if (age === null || age <= staleAfterDays) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-[var(--warn-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--warn)]">
      <span aria-hidden="true">⚠</span>
      {messages(lang).stale(age)}
    </p>
  );
}
