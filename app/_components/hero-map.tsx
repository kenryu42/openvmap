import type { CSSProperties, ReactNode } from "react";
import { messages, type Lang } from "@/lib/lang";

type Node = { x: number; y: number; label: string; tone: string };

const W = 520;
const H = 440;
const cx = W / 2;
const cy = H / 2;

function At({ x, y, i, children }: { x: number; y: number; i: number; children: ReactNode }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
      <div className="pop" style={{ "--i": i } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

export function HeroMap({ lang }: { lang: Lang }) {
  const s = messages(lang).ui;
  const r = s.roleLabels;
  const dx = 168;
  const dy = 128;
  const nodes: Node[] = [
    { x: cx - dx, y: cy - dy, label: r.web, tone: "var(--ok)" },
    { x: cx + dx, y: cy - dy, label: r.ns, tone: "var(--info)" },
    { x: cx + dx, y: cy + dy, label: r.mx, tone: "var(--warn)" },
    { x: cx - dx, y: cy + dy, label: r.tls, tone: "var(--idle)" },
  ];
  const path = (n: Node) => `M ${cx} ${cy} Q ${n.x} ${cy} ${n.x} ${n.y}`;
  return (
    <figure className="mx-auto w-full max-w-[34rem]" aria-hidden="true">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          <circle cx={cx} cy={cy} r="64" fill="var(--accent)" fillOpacity="0.06" />
          {[64, 120, 176, 212].map((rad, i) => (
            <circle
              key={rad}
              cx={cx}
              cy={cy}
              r={rad}
              fill="none"
              stroke="var(--rule-strong)"
              strokeOpacity={0.9 - i * 0.18}
              strokeDasharray={i % 2 ? "2 6" : "1 0"}
              className="draw"
              style={{ "--len": Math.ceil(2 * Math.PI * rad), "--i": i } as CSSProperties}
            />
          ))}
          {nodes.map((n, i) => (
            <path
              key={`l${i}`}
              d={path(n)}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              className="draw"
              style={{ "--len": 360, "--i": i + 2 } as CSSProperties}
            />
          ))}
          {nodes.map((n, i) => (
            <circle
              key={`p${i}`}
              r="3.5"
              fill="var(--accent)"
              style={{ offsetPath: `path("${path(n)}")`, animation: `travel 2.8s ${1.6 + i * 0.7}s cubic-bezier(.45,0,.2,1) infinite both` }}
            />
          ))}
        </svg>
        {nodes.map((n, i) => (
          <At key={n.label} x={n.x} y={n.y} i={i + 2}>
            <span className="flex items-center gap-2 rounded-full border border-rule-strong bg-surface px-3 py-2 text-sm font-semibold whitespace-nowrap shadow-[0_8px_24px_-16px_rgb(0_0_0/0.35)]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: n.tone }} />
              {n.label}
            </span>
          </At>
        ))}
        <At x={cx} y={cy} i={0}>
          <span className="flex items-center gap-2 rounded-full bg-ink py-2 pr-4 pl-3 font-mono text-sm whitespace-nowrap text-paper shadow-[0_12px_32px_-16px_rgb(0_0_0/0.5)]">
            <span className="relative inline-flex size-2 shrink-0 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft)] pulse" />
            {s.exampleDomain}
          </span>
        </At>
      </div>
      <figcaption className="mt-4 text-center text-xs text-muted">{s.mapCaption}</figcaption>
    </figure>
  );
}
