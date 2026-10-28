import { providerMetadata, providerParams, ProviderRoute } from "@/app/_components/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return providerParams();
}

export function generateMetadata({ params }: PageProps<"/providers/[id]">) {
  return providerMetadata(params, "en");
}

export default function Page({ params }: PageProps<"/providers/[id]">) {
  return <ProviderRoute params={params} lang="en" />;
}
