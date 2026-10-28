import type { Metadata } from "next";
import { ToolsPage } from "@/app/_components/tools";

export const metadata: Metadata = { title: "Free security tools for small teams" };

export default function Page() {
  return <ToolsPage lang="en" />;
}
