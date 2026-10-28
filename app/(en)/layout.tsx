import { RootLayout, rootMetadata } from "@/app/_components/root";

export const metadata = rootMetadata("en");
export { viewport } from "@/app/_components/root";

export default function Layout({ children }: LayoutProps<"/">) {
  return <RootLayout lang="en">{children}</RootLayout>;
}
