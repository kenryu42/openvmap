import type { Metadata } from "next";
import { AdvisoriesPage } from "@/app/_components/advisories";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = {
  title: "アドバイザリー",
  description:
    "サイトの持ち主が知っておきたい、いまの脆弱性。開発元の修正、ディストリビューションの対応、各事業者の発表、ホスティング事業者に聞くことをまとめています。",
  alternates: pageAlternates("ja", "/advisories"),
};

export default function Page() {
  return <AdvisoriesPage lang="ja" />;
}
