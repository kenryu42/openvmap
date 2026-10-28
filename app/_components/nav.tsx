"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { JumpWithoutFragment } from "./client";
import { homeHref, type Lang } from "@/lib/lang";

type Item = { href: string; label: string };

const homeHrefs = new Set((["en", "ja"] satisfies Lang[]).map(homeHref));

export function IslandNav({
  brand,
  items,
  alt,
  altLang,
  altLabel,
  menuLabel,
}: {
  brand: ReactNode;
  items: Item[];
  alt: string;
  altLang: string;
  altLabel: string;
  menuLabel: string;
}) {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (o: boolean) => setOpenOn(o ? path : null);
  const overlay = useRef<HTMLDivElement>(null);
  const here = path.replace(/\/$/, "") || "/";
  const isSectionOfHere = (href: string) => !homeHrefs.has(href) && here.startsWith(`${href}/`);
  const current = (href: string) => (here === href || isSectionOfHere(href) ? "page" : undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    overlay.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const pillLink =
    "rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors duration-700 ease-fluid hover:bg-sunken hover:text-ink active:scale-[0.98] aria-[current=page]:bg-ink aria-[current=page]:text-paper";
  return (
    <header className="pointer-events-none sticky top-0 z-50 flex justify-center px-4">
      <nav className="pointer-events-auto mx-auto mt-6 flex w-max max-w-full items-center gap-1 rounded-full border border-rule bg-surface/70 p-1 pl-4 shadow-[0_8px_32px_-16px_rgb(0_0_0/0.35)] backdrop-blur-xl backdrop-saturate-150">
        {brand}
        <ul className="ml-3 hidden items-center gap-1 lg:flex">
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} aria-current={current(it.href)} className={pillLink}>
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={alt}
          hrefLang={altLang}
          className="ml-2 rounded-full border border-rule-strong px-3 py-2 text-sm font-semibold transition-colors duration-700 ease-fluid hover:border-ink hover:bg-ink hover:text-paper active:scale-[0.98]"
        >
          {altLabel}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={menuLabel}
          onClick={() => setOpen(!open)}
          className="relative ml-1 size-10 shrink-0 rounded-full transition-colors duration-700 ease-fluid hover:bg-sunken active:scale-[0.98] lg:hidden"
        >
          <span
            className={`absolute top-1/2 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-ink transition-transform duration-700 ease-fluid ${open ? "-translate-y-1/2 rotate-45" : "-translate-y-1"}`}
          />
          <span
            className={`absolute top-1/2 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-ink transition-transform duration-700 ease-fluid ${open ? "-translate-y-1/2 -rotate-45" : "translate-y-0.5"}`}
          />
        </button>
      </nav>

      <div
        id="site-menu"
        ref={overlay}
        inert={!open}
        className={`glass-overlay pointer-events-auto fixed inset-0 -z-10 flex flex-col justify-center px-8 backdrop-blur-3xl transition-opacity duration-700 ease-fluid lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <ul className="grid gap-4">
          {items.map((it, i) => (
            <li key={it.href} className="overflow-hidden">
              <Link
                href={it.href}
                aria-current={current(it.href)}
                onClick={() => setOpen(false)}
                style={{ transitionDelay: open ? `${100 + i * 50}ms` : "0ms" }}
                className={`block text-3xl font-bold transition-[transform,opacity,color] duration-700 ease-fluid hover:text-accent aria-[current=page]:text-accent ${open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

export function SkipLink({ label }: { label: string }) {
  return (
    <JumpWithoutFragment
      to="main"
      className="sr-only fixed top-2 left-2 z-[60] rounded-full bg-ink px-3 py-2 text-sm font-semibold text-paper focus:not-sr-only"
    >
      {label}
    </JumpWithoutFragment>
  );
}
