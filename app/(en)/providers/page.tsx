import type { Metadata } from "next";
import { ProvidersPage } from "@/app/_components/pages";

export const metadata: Metadata = { title: "Provider security status" };

export default function Page() {
  return <ProvidersPage lang="en" />;
}
