import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaleNotice } from "@/app/_components/client";

describe("the stale-status notice", () => {
  it("is left out of prerendered HTML, so a static page never shows the age it had when it was built", () => {
    const html = renderToString(createElement(StaleNotice, { verifiedAt: "2020-01-01", lang: "en" }));
    expect(html).toBe("");
  });
});
