import type { Metadata } from "next";
import { ProvidersPage } from "@/app/_components/pages";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "Provider security status", alternates: pageAlternates("en", "/providers") };

export default function Page() {
  return <ProvidersPage lang="en" />;
}
