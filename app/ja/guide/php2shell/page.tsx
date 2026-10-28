import type { Metadata } from "next";
import { GuidePage } from "@/app/_components/guide";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = {
  alternates: pageAlternates("ja", "/guide/php2shell"),
  title: "php2shell：中小企業のための対応ガイド",
  description:
    "php2shell（CVE-2026-109618 / CVE-2026-109619）が自社サイトにとって何を意味するか、誰が修正するのか、制作会社やレンタルサーバー会社に何を聞けばよいかをまとめました。",
};

export default function Page() {
  return <GuidePage lang="ja" incident="php2shell" />;
}
