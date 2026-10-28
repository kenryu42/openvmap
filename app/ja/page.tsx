import type { Metadata } from "next";
import { HomePage } from "@/app/_components/landing";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { alternates: pageAlternates("ja", "") };

export default function Page() {
  return <HomePage lang="ja" />;
}
