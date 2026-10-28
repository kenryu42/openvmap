"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-reveal
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform,filter] duration-1000 ease-fluid ${shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-16 opacity-0 blur-md"} ${className}`}
    >
      {children}
    </div>
  );
}

export function TaglineReveal({ lines, className = "" }: { lines: string[][]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = lines.flat();
  const [lit, setLit] = useState<boolean[]>(() => words.map(() => false));
  useEffect(() => {
    const spans = [...(ref.current?.querySelectorAll<HTMLElement>("[data-word]") ?? [])];
    const io = new IntersectionObserver(
      (entries) =>
        setLit((prev) => {
          const next = [...prev];
          for (const e of entries) next[Number((e.target as HTMLElement).dataset.word)] = e.isIntersecting || e.boundingClientRect.top < 0;
          return next;
        }),
      { rootMargin: "0px 0px -42% 0px" },
    );
    spans.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  let i = 0;
  return (
    <p ref={ref} className={className}>
      {lines.map((line, l) => (
        <span key={l} className="block">
          {line.map((w) => {
            const n = i++;
            return (
              <span
                key={n}
                data-word={n}
                className="inline-block whitespace-pre transition-colors duration-700 ease-fluid"
                style={{ color: lit[n] ? "var(--ink)" : "color-mix(in oklab, var(--ink) 30%, transparent)" }}
              >
                {w}
                {/[A-Za-z.,?]$/.test(w) && " "}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}
