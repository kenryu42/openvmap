import type { Metadata } from "next";
import { ToolsPage } from "@/app/_components/tools";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: "Free security tools for small teams", alternates: pageAlternates("en", "/tools") };

export default function Page() {
  return <ToolsPage lang="en" />;
}
