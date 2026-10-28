import type { Metadata } from "next";
import { ToolsPage } from "@/app/_components/tools";

export const metadata: Metadata = { title: "小さなチームのための無料のセキュリティツール" };

export default function Page() {
  return <ToolsPage lang="ja" />;
}
