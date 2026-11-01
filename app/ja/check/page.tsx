import type { Metadata } from "next";
import { CheckView } from "@/app/_components/check";
import { table } from "@/lib/table";

export const metadata: Metadata = { title: "チェック結果", robots: { index: false, follow: false } };

export default function Page() {
  return <CheckView providers={table.providers} advisories={table.advisories} updatedAt={table.updated_at} lang="ja" />;
}
