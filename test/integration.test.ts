import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { checkPage, defaultUserAgent, runCheck } from "@/lib/check";
import { dohResolver } from "@/lib/doh";
import { repoUrl, version } from "@/lib/meta";
import { addPage } from "@/lib/report";
import { safeTransport } from "@/lib/safety";
import { table } from "@/lib/table";

interface Known {
  domain: string;
  expect: string[];
  expect_verdict?: string;
  expect_no_hosts?: boolean;
}

const known = load(readFileSync("test/known_domains.yaml", "utf8")) as Known[];
const resolver = dohResolver();

describe.skipIf(process.env.VMAP_NETWORK !== "1")("known domains (live)", () => {
  it.each(known)("$domain", async (k) => {
    const r = await runCheck(k.domain, { table, resolver, version, lang: "ja" });
    if (r.hosts.length > 0) {
      addPage(r, await checkPage(r.domain, { transport: safeTransport({ resolver }), userAgent: defaultUserAgent(version, repoUrl) }), "ja", table);
    }
    const got = r.providers.flatMap((p) => p.roles.map((role) => `${p.id}:${role}`));
    expect(got).toEqual(expect.arrayContaining(k.expect));
    if (k.expect_verdict) expect(r.php?.verdict).toBe(k.expect_verdict);
    if (k.expect_no_hosts) {
      expect(r.hosts).toEqual([]);
      expect(r.actions[0]).toContain("解決できませんでした");
    }
  });
});
