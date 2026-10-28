import type { Metadata } from "next";
import { ProvidersPage } from "@/app/_components/pages";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "事業者のセキュリティ対応状況一覧", alternates: pageAlternates("ja", "/providers") };

export default function Page() {
  return <ProvidersPage lang="ja" />;
}
