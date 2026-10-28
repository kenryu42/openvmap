import type { Metadata } from "next";
import { en } from "./messages/en";
import { ja, type Messages } from "./messages/ja";

export type Lang = "ja" | "en";

export function base(lang: Lang): string {
  return lang === "ja" ? "/ja" : "";
}

export function homeHref(lang: Lang): string {
  return base(lang) || "/";
}

export function pageHref(lang: Lang, path: string): string {
  return path === "" ? homeHref(lang) : base(lang) + path;
}

export function pageAlternates(lang: Lang, path: string): Metadata["alternates"] {
  return { canonical: pageHref(lang, path), languages: { en: pageHref("en", path), ja: pageHref("ja", path), "x-default": pageHref("en", path) } };
}

export function otherLang(lang: Lang): Lang {
  return lang === "ja" ? "en" : "ja";
}

export function messages(lang: Lang): Messages {
  return lang === "en" ? en : ja;
}
