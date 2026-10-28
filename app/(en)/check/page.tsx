import type { Metadata } from "next";
import { CheckView } from "@/app/_components/check";
import { table } from "@/lib/table";

export const metadata: Metadata = { title: "Check result", robots: { index: false, follow: false } };

export default function Page() {
  return <CheckView providers={table.providers} incident={table.incident} incidentCves={table.incident_cves} updatedAt={table.updated_at} lang="en" />;
}
