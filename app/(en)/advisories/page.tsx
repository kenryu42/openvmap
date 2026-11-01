import type { Metadata } from "next";
import { AdvisoriesPage } from "@/app/_components/advisories";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = {
  title: "Advisories",
  description:
    "Current vulnerabilities that matter to site owners: the upstream fix, distribution status, what each provider has announced, and what to ask your host.",
  alternates: pageAlternates("en", "/advisories"),
};

export default function Page() {
  return <AdvisoriesPage lang="en" />;
}
