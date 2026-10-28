import { providerMetadata, providerParams, ProviderRoute } from "@/app/_components/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return providerParams();
}

export function generateMetadata({ params }: PageProps<"/ja/providers/[id]">) {
  return providerMetadata(params, "ja");
}

export default function Page({ params }: PageProps<"/ja/providers/[id]">) {
  return <ProviderRoute params={params} lang="ja" />;
}
