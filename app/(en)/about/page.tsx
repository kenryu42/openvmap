import type { Metadata } from "next";
import { AboutPage } from "@/app/_components/pages";

export const metadata: Metadata = { title: "About" };

export default function Page() {
  return <AboutPage lang="en" />;
}
