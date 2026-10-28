import { describe, expect, it } from "vitest";
import { checkPage, runCheck, type PageResponse, type Transport } from "@/lib/check";
import type { Lang } from "@/lib/lang";
import { addPage } from "@/lib/report";
import { table } from "@/lib/table";
import { singleSiteResolver } from "./helpers";

const resolver = singleSiteResolver("old.example.jp");

const poweredBy =
  (version: string): Transport =>
  () =>
    Promise.resolve({ status: 200, headers: new Headers({ "X-Powered-By": `PHP/${version}` }), body: "<html>hi</html>" } satisfies PageResponse);

async function check(version: string, lang: Lang) {
  const r = await runCheck("old.example.jp", { table, resolver, version: "test", lang });
  addPage(r, await checkPage("old.example.jp", { transport: poweredBy(version), userAgent: "vmap/test" }), lang, table);
  return r;
}

describe("a site on PHP with no official fix, which cannot simply be updated", () => {
  it("says the move may need framework and library work and testing, and what to do until then", async () => {
    const ja = (await check("7.4.33", "ja")).actions.join("\n");
    expect(ja).toContain("フレームワークやライブラリ");
    expect(ja).toContain("動作確認（テスト）");
    expect(ja).toContain("移行が終わるまで");
    expect(ja).toContain("一時的な公開停止");

    const en = (await check("7.4.33", "en")).actions.join("\n");
    expect(en).toContain("frameworks and libraries");
    expect(en).toContain("until the move is done");
    expect(en).toContain("taking the site offline for a while");
  });

  it("leaves the advice for a fixed release alone", async () => {
    const ja = (await check("8.4.27", "ja")).actions.join("\n");
    expect(ja).toContain("修正版以上");
    expect(ja).not.toContain("移行が終わるまで");
  });
});

describe("the inquiry template, for work that passes through several companies", () => {
  it("asks who actually does the update, subcontractors included, and what happens meanwhile", async () => {
    const ja = (await check("7.4.33", "ja")).message_template;
    expect(ja).toContain("再委託先を含め");
    expect(ja).toContain("更新が終わるまでの間の対策");

    const en = (await check("7.4.33", "en")).message_template;
    expect(en).toContain("including any subcontractor");
    expect(en).toContain("Whether anything is needed in the meantime");
  });
});
