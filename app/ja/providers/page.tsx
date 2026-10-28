import type { Metadata } from "next";
import { ProvidersPage } from "@/app/_components/pages";

export const metadata: Metadata = { title: "事業者のセキュリティ対応状況一覧" };

export default function Page() {
  return <ProvidersPage lang="ja" />;
}
