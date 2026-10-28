import { RootLayout, rootMetadata } from "@/app/_components/root";

export const metadata = rootMetadata("ja");
export { viewport } from "@/app/_components/root";

export default function Layout({ children }: LayoutProps<"/ja">) {
  return <RootLayout lang="ja">{children}</RootLayout>;
}
