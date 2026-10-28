import { marked } from "marked";
import type { Lang } from "./lang";

function joinJapaneseLineBreaks(markdown: string): string {
  return markdown.replace(/(\P{ASCII})\n(?=\P{ASCII})/gu, "$1");
}

export function trustedMarkdownHtml(source: string, lang: Lang): string {
  return marked.parse(lang === "ja" ? joinJapaneseLineBreaks(source) : source, { async: false });
}
