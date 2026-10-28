import type { Metadata } from "next";
import { ToolsPage } from "@/app/_components/tools";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "小さなチームのための無料のセキュリティツール", alternates: pageAlternates("ja", "/tools") };

export default function Page() {
  return <ToolsPage lang="ja" />;
}
