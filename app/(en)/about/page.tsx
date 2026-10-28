import type { Metadata } from "next";
import { AboutPage } from "@/app/_components/pages";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "About", alternates: pageAlternates("en", "/about") };

export default function Page() {
  return <AboutPage lang="en" />;
}
