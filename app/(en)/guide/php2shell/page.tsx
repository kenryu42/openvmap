import type { Metadata } from "next";
import { GuidePage } from "@/app/_components/guide";

export const metadata: Metadata = {
  title: "php2shell: a guide for small businesses",
  description: "What php2shell (CVE-2026-109618 / CVE-2026-109619) means for your website, who has to patch it, and what to ask your web agency or host.",
};

export default function Page() {
  return <GuidePage lang="en" incident="php2shell" />;
}
