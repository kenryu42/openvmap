import { describe, expect, it } from "vitest";
import { checkPage, runCheck, type PageResponse } from "@/lib/check";
import { addPage, incidentChecks } from "@/lib/report";
import { table } from "@/lib/table";
import type { TlsCert } from "@/lib/tls";
import { singleSiteResolver } from "./helpers";

const resolver = singleSiteResolver("shop.example.jp");

const amazon: TlsCert[] = [{ subject_cn: "shop.example.jp", issuer_cn: "Amazon RSA 2048 M02", issuer_o: "Amazon" }];
const emudhra: TlsCert[] = [{ subject_cn: "shop.example.jp", issuer_cn: "EM DV TLS CA - G2A-1", issuer_o: "eMudhra Technologies Limited" }];

async function check(page?: { headers?: Record<string, string>; chain?: TlsCert[] }) {
  const r = await runCheck("shop.example.jp", { table, resolver, version: "test", lang: "ja" });
  if (page) {
    const transport = (): Promise<PageResponse> => Promise.resolve({ status: 200, headers: new Headers(page.headers), body: "<html>hi</html>" });
    const certs = page.chain ? () => Promise.resolve(page.chain!) : () => Promise.reject(new Error("connection refused"));
    addPage(r, await checkPage("shop.example.jp", { transport, certs, userAgent: "vmap/test" }), "ja", table);
  }
  return Object.fromEntries(incidentChecks(r, table).map((c) => [c.incident.key, c.missing ? `${c.result} (${c.missing})` : c.result]));
}

describe("the other incidents in the table, checked for every site", () => {
  it("lists each one as not found when the site uses none of those providers", async () => {
    expect(await check({ chain: amazon })).toEqual({
      "vercel-2026-04": "clear",
      "railway-2026-10": "clear",
      "zeabur-2026-10": "clear",
      "emudhra-2026-10": "clear",
    });
  });

  it("marks the one whose provider the site uses, from the page's headers or the certificate", async () => {
    const found = await check({ headers: { "x-railway-request-id": "abc" }, chain: emudhra });
    expect(found["railway-2026-10"]).toBe("found");
    expect(found["emudhra-2026-10"]).toBe("found");
    expect(found["vercel-2026-04"]).toBe("clear");
  });

  it("does not call a provider absent when the source that could name it is missing", async () => {
    expect(await check()).toEqual({
      "vercel-2026-04": "unchecked (page)",
      "railway-2026-10": "unchecked (page)",
      "zeabur-2026-10": "unchecked (page)",
      "emudhra-2026-10": "unchecked (cert)",
    });
    expect((await check({}))["emudhra-2026-10"]).toBe("unchecked (cert)");
  });
});
