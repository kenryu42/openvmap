import Link from "next/link";
import {
  ArrowRightIcon,
  BuildingsIcon,
  ChatTextIcon,
  CheckCircleIcon,
  FeatherIcon,
  GithubLogoIcon,
  NewspaperIcon,
  PlusIcon,
  SealCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import { CheckForm } from "./check";
import { HeroMap } from "./hero-map";
import { Reveal, TaglineReveal } from "./motion";
import { guidePath, Site } from "./site";
import { incidentOf, otherIncidents } from "@/lib/provider";
import { base, homeHref, messages, otherLang, type Lang } from "@/lib/lang";
import { pick } from "@/lib/report";
import { repoUrl } from "@/lib/meta";
import { table } from "@/lib/table";

function figures(lang: Lang) {
  const ja = lang === "ja";
  const listed = table.providers.filter((p) => incidentOf(p, table.incident));
  const official = listed.filter((p) => incidentOf(p, table.incident)?.confidence === "official").length;
  const others = table.providers.filter((p) => otherIncidents(p, table.incident).length > 0).map((p) => pick(ja, p.name_ja, p.name));
  return { listed: listed.length, official, others: others.join(ja ? "・" : ", "), updated: table.updated_at };
}

const benefitIcons = [BuildingsIcon, NewspaperIcon, WarningIcon, ChatTextIcon, FeatherIcon];

function Eyebrow({ children }: { children: string }) {
  return <p className="text-sm font-semibold text-accent">{children}</p>;
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mt-3 max-w-[680px] text-3xl font-bold tracking-tight sm:text-4xl">{children}</h2>;
}

function Reassure({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted ${className}`}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <CheckCircleIcon weight="fill" className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function HomePage({ lang }: { lang: Lang }) {
  const s = messages(lang).ui;
  const h = s.home;
  const f = figures(lang);
  const ja = lang === "ja";
  const p = base(lang);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: h.faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };

  return (
    <Site lang={lang} alt={homeHref(otherLang(lang))} incident={table.incident} wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <section className="grid items-center gap-12 pb-24 lg:grid-cols-[minmax(0,680px)_1fr]">
        <div className="min-w-0">
          <Reveal>
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 font-mono text-xs text-muted">
              <span className="relative inline-flex size-2 shrink-0 rounded-full bg-accent text-accent pulse" />
              <span className="min-w-0">{s.nowCovering(s.incidentLabel(table.incident, table.incident_cves))}</span>
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className={`hero-title mt-6 max-w-[680px] font-bold tracking-tight ${ja ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"}`}>
              {h.titleLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 max-w-[680px] text-lg text-balance text-muted">{h.sub}</p>
          </Reveal>
          <Reveal delay={300}>
            <CheckForm lang={lang} className="mt-8 max-w-[680px]" />
            <Reassure items={h.reassure} className="mt-4" />
          </Reveal>
          <Reveal delay={400}>
            <p className="mt-8 flex items-start gap-2 text-sm text-muted">
              <SealCheckIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              {h.proof(f.listed, f.official, f.updated)}
            </p>
          </Reveal>
        </div>
        <Reveal delay={300}>
          <HeroMap lang={lang} />
        </Reveal>
      </section>

      <section className="grid gap-12 border-t border-rule pt-24 md:grid-cols-2">
        <Reveal>
          <Eyebrow>{h.problemEyebrow}</Eyebrow>
          <SectionTitle>{h.problemTitle}</SectionTitle>
          <p className="mt-6 text-lg text-balance text-muted">{h.problemBody}</p>
        </Reveal>
        <Reveal delay={150} className="self-end">
          <div className="rounded-2xl border border-rule bg-surface p-8">
            <BuildingsIcon className="size-8 text-accent" aria-hidden="true" />
            <p className="mt-6 text-xl font-semibold text-balance">{h.solutionBody}</p>
          </div>
        </Reveal>
      </section>

      <section className="py-24">
        <TaglineReveal lines={h.tagline} className={`max-w-[680px] font-bold tracking-tight ${ja ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl"}`} />
      </section>

      <section>
        <Reveal>
          <Eyebrow>{h.benefitsEyebrow}</Eyebrow>
          <SectionTitle>{h.benefitsTitle}</SectionTitle>
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {h.benefits(f.listed, f.others, table.incident).map((b, i) => {
            const Icon = benefitIcons[i];
            return (
              <li key={b.title} className={i < 2 ? "lg:col-span-3" : "lg:col-span-2"}>
                <Reveal delay={i * 100} className="h-full">
                  <div className="h-full rounded-2xl border border-rule bg-surface p-6 transition-[transform,border-color] duration-700 ease-fluid hover:-translate-y-1 hover:border-rule-strong">
                    <Icon className="size-6 text-accent" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
                    <p className="mt-2 text-base text-balance text-muted">{b.body}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-24">
        <Reveal>
          <Eyebrow>{h.stepsEyebrow}</Eyebrow>
          <SectionTitle>{h.stepsTitle}</SectionTitle>
        </Reveal>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {h.howSteps.map((st, i) => (
            <li key={st.title}>
              <Reveal delay={i * 120} className="h-full">
                <div className="h-full rounded-2xl border border-rule p-6">
                  <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-4 text-xl font-semibold">{st.title}</h3>
                  <p className="mt-2 text-base text-balance text-muted">{st.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24">
        <Reveal>
          <div className="rounded-3xl bg-feature p-8 text-feature-ink sm:p-12">
            <p className="text-sm font-semibold text-feature-ink/70">{h.sourcesEyebrow}</p>
            <h2 className="mt-3 max-w-[680px] text-3xl font-bold tracking-tight sm:text-4xl">{h.sourcesTitle}</h2>
            <p className="mt-6 max-w-[680px] text-lg text-feature-ink/70">{h.sourcesBody}</p>
            <dl className="mt-12 grid gap-8 sm:grid-cols-3">
              {[
                [String(f.listed), h.statProviders],
                [String(f.official), h.statOfficial],
                [f.updated, h.statUpdated],
              ].map(([v, label]) => (
                <div key={label}>
                  <dt className="text-sm text-feature-ink/70">{label}</dt>
                  <dd className="mt-2 font-mono text-4xl font-semibold tracking-tight">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href={`${p}/providers`}
                className="group inline-flex items-center gap-2 rounded-full bg-feature-ink px-3 py-2 text-base font-semibold text-feature transition-transform duration-700 ease-fluid hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {h.seeProviders}
                <ArrowRightIcon weight="bold" className="size-4 transition-transform duration-700 ease-fluid group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <a
                href={repoUrl}
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-feature-ink/70 transition-colors duration-700 ease-fluid hover:text-feature-ink"
              >
                <GithubLogoIcon className="size-4" aria-hidden="true" />
                {h.openSource}
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mt-24 grid gap-12 lg:grid-cols-[1fr_2fr]">
        <Reveal>
          <Eyebrow>{h.faqEyebrow}</Eyebrow>
          <SectionTitle>{h.faqTitle}</SectionTitle>
        </Reveal>
        <Reveal delay={100}>
          <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface">
            {h.faq.map((x) => (
              <details key={x.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-6 text-lg font-semibold transition-colors duration-700 ease-fluid hover:text-accent [&::-webkit-details-marker]:hidden">
                  <h3>{x.q}</h3>
                  <PlusIcon className="size-5 shrink-0 text-muted transition-transform duration-700 ease-fluid group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="px-6 pb-6 text-base text-balance text-muted">{x.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="mt-24">
        <Reveal>
          <div className="rounded-3xl border border-rule bg-surface p-8 sm:p-12">
            <h2 className="max-w-[680px] text-3xl font-bold tracking-tight sm:text-4xl">{h.finalTitle}</h2>
            <p className="mt-4 max-w-[680px] text-lg text-muted">{h.finalBody}</p>
            <CheckForm lang={lang} id="domain-final" className="mt-8 max-w-[680px]" />
            <Reassure items={h.reassure} className="mt-4" />
            <Link href={guidePath(lang, table.incident)} className="link mt-8 inline-flex items-center gap-2 text-sm">
              {s.readGuide}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>
    </Site>
  );
}
