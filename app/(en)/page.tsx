import type { Metadata } from "next";
import { HomePage } from "@/app/_components/landing";
import { pageAlternates } from "@/lib/lang";

export const metadata: Metadata = { title: { absolute: "OpenVMap: who runs your site and how they handle security" }, alternates: pageAlternates("en", "") };

export default function Page() {
  return <HomePage lang="en" />;
}
