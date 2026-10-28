import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { RootLayout } from "./_components/root";
import { Mark, Site } from "./_components/site";
import { table } from "@/lib/table";

export const metadata: Metadata = { title: "Page not found | OpenVMap" };

export default function GlobalNotFound() {
  return (
    <RootLayout lang="en">
      <Site lang="en" alt="/ja" incident={table.incident}>
        <section className="mx-auto flex max-w-[680px] flex-col items-start py-24">
          <Mark className="size-12" />
          <p className="mt-8 font-mono text-sm text-accent">404</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">This page does not exist</h1>
          <p className="mt-4 text-lg text-muted" lang="ja">
            このページは見つかりませんでした。
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-base font-semibold text-accent-ink transition-transform duration-700 ease-fluid hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <ArrowLeftIcon weight="bold" className="size-4" aria-hidden="true" />
              Back to the home page
            </Link>
            <Link
              href="/ja"
              lang="ja"
              className="inline-flex items-center rounded-full border border-rule-strong px-3 py-2 text-base font-semibold transition-colors duration-700 ease-fluid hover:border-ink"
            >
              日本語のトップへ
            </Link>
          </div>
        </section>
      </Site>
    </RootLayout>
  );
}
