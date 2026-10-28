import { en } from "./messages/en";
import { ja, type Messages } from "./messages/ja";

export type Lang = "ja" | "en";

export function base(lang: Lang): string {
  return lang === "ja" ? "/ja" : "";
}

export function homeHref(lang: Lang): string {
  return base(lang) || "/";
}

export function otherLang(lang: Lang): Lang {
  return lang === "ja" ? "en" : "ja";
}

export function messages(lang: Lang): Messages {
  return lang === "en" ? en : ja;
}
