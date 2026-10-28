import { describe, expect, it } from "vitest";
import { checkHref } from "@/app/_components/check";

describe("the home page form", () => {
  it("lands on the shareable result URL for the normalized domain, in the fragment no server sees", () => {
    expect(checkHref("https://WWW.Example.co.jp/path?q=1", "en")).toBe("/check#www.example.co.jp");
  });

  it("keeps Japanese under /ja", () => {
    expect(checkHref("example.co.jp", "ja")).toBe("/ja/check#example.co.jp");
  });

  it("converts a Japanese domain to its ASCII form", () => {
    expect(checkHref("例え.jp", "ja")).toBe("/ja/check#xn--r8jz45g.jp");
  });

  it("sends an empty form back home", () => {
    expect(checkHref("  ", "en")).toBe("/");
    expect(checkHref("", "ja")).toBe("/ja");
  });
});
