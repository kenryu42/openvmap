import { readFileSync } from "node:fs";
import path from "node:path";
import { otherLang, type Lang } from "@/lib/lang";
import { trustedMarkdownHtml } from "@/lib/markdown";
import { guidePath, Site } from "./site";

const guideDir = (incident: string) => path.join(process.cwd(), "content", "guide", incident);

function trustedGuideHtml(lang: Lang, incident: string): string {
  return trustedMarkdownHtml(readFileSync(path.join(guideDir(incident), `${lang}.md`), "utf8"), lang);
}

export function GuidePage({ lang, incident }: { lang: Lang; incident: string }) {
  return (
    <Site lang={lang} alt={guidePath(otherLang(lang), incident)} incident={incident}>
      <article className="prose rise mx-auto" dangerouslySetInnerHTML={{ __html: trustedGuideHtml(lang, incident) }} />
    </Site>
  );
}
