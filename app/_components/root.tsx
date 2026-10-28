import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { messages, type Lang } from "@/lib/lang";
import { siteUrl } from "@/lib/meta";
import { table } from "@/lib/table";
import "../globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const notoJp = Noto_Sans_JP({ subsets: ["latin"], variable: "--font-noto-jp", preload: false });

const incident = (lang: Lang) => messages(lang).ui.incidentLabel(table.incident, table.incident_cves);

const titles = {
  en: {
    title: "OpenVMap | Who runs your site, and how they handle security",
    description: `Find the companies behind your website and what they have announced about security incidents, now including ${incident("en")}. Free and open source.`,
    locale: "en_US",
  },
  ja: {
    title: "OpenVMap｜自社サイトの事業者とセキュリティ対応状況",
    description: `自社サイトを動かしている事業者と、そのセキュリティ対応状況を確認する無料のツール。${incident("ja")}への各社の対応状況も掲載しています。`,
    locale: "ja_JP",
  },
};

export function rootMetadata(lang: Lang): Metadata {
  const { title, description, locale } = titles[lang];
  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: "%s | OpenVMap" },
    description,
    openGraph: { title, description, siteName: "OpenVMap", locale, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f8fb",
};

export function RootLayout({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <html lang={lang} data-scroll-behavior="smooth" className={`${geist.variable} ${geistMono.variable} ${notoJp.variable}`}>
      <body className="min-h-screen antialiased">
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}"}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
