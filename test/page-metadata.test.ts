import { describe, expect, it } from "vitest";
import { metadata as enHome } from "@/app/(en)/page";
import { metadata as jaGuide } from "@/app/ja/guide/php2shell/page";
import { providerMetadata } from "@/app/_components/pages";

describe("search engine tags on each page", () => {
  it("gives the Japanese guide its own canonical URL and links it to the English guide", () => {
    expect(jaGuide.alternates).toEqual({
      canonical: "/ja/guide/php2shell",
      languages: { en: "/guide/php2shell", ja: "/ja/guide/php2shell", "x-default": "/guide/php2shell" },
    });
  });

  it("links the English home page to the Japanese one", () => {
    expect(enHome.alternates).toEqual({ canonical: "/", languages: { en: "/", ja: "/ja", "x-default": "/" } });
  });

  it("gives every provider page a canonical URL in its own language", async () => {
    const ja = await providerMetadata(Promise.resolve({ id: "xserver" }), "ja");
    expect(ja.alternates?.canonical).toBe("/ja/providers/xserver");
    expect(ja.alternates?.languages).toEqual({ en: "/providers/xserver", ja: "/ja/providers/xserver", "x-default": "/providers/xserver" });
  });
});
