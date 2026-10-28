import type { Metadata } from "next";
import { AboutPage } from "@/app/_components/pages";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "このツールについて", alternates: pageAlternates("ja", "/about") };

export default function Page() {
  return <AboutPage lang="ja" />;
}
