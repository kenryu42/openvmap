import type { Metadata } from "next";
import { HomePage } from "@/app/_components/landing";

export const metadata: Metadata = { title: { absolute: "OpenVMap: who runs your site and how they handle security" } };

export default function Page() {
  return <HomePage lang="en" />;
}
