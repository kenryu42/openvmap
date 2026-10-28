import type { MetadataRoute } from "next";
import { pageHref, type Lang } from "@/lib/lang";
import { siteUrl } from "@/lib/meta";
import { table } from "@/lib/table";

export const dynamic = "force-static";

const langs: Lang[] = ["en", "ja"];

function url(lang: Lang, path: string): string {
  return siteUrl + pageHref(lang, path);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; lastModified?: string }[] = [
    { path: "" },
    { path: "/providers", lastModified: table.updated_at },
    ...table.providers.map((p) => ({ path: `/providers/${p.id}`, lastModified: table.updated_at })),
    { path: `/guide/${table.incident}` },
    { path: "/tools" },
    { path: "/about" },
  ];
  return pages.flatMap(({ path, lastModified }) =>
    langs.map((lang) => ({
      url: url(lang, path),
      ...(lastModified && { lastModified }),
      alternates: { languages: { en: url("en", path), ja: url("ja", path) } },
    })),
  );
}
