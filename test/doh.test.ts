import { describe, expect, it } from "vitest";
import { lookupAsn, txtLookup } from "@/lib/asn";
import { describe as describeError } from "@/lib/dns";
import { dohResolver } from "@/lib/doh";

const answers: Record<string, unknown> = {
  "www.example.co.jp A": {
    Status: 0,
    Answer: [
      { name: "www.example.co.jp", type: 5, data: "example-co-jp.cdn.cloudflare.net." },
      { name: "example-co-jp.cdn.cloudflare.net", type: 1, data: "104.16.132.229" },
    ],
  },
  "www.example.co.jp CNAME": { Status: 0, Answer: [{ name: "www.example.co.jp", type: 5, data: "example-co-jp.cdn.cloudflare.net." }] },
  "example.co.jp MX": {
    Status: 0,
    Answer: [
      { name: "example.co.jp", type: 15, data: "10 alt1.aspmx.l.google.com." },
      { name: "example.co.jp", type: 15, data: "1 aspmx.l.google.com." },
    ],
  },
  "xserver.jp NS": { Status: 0, Answer: [{ name: "xserver.jp", type: 2, data: "ns1.xserver.jp." }] },
  "229.132.16.104.origin.asn.cymru.com TXT": {
    Status: 0,
    Answer: [{ name: "229.132.16.104.origin.asn.cymru.com", type: 16, data: '"13335 | 104.16.128.0/20 | US | arin | 2014-03-28"' }],
  },
  "AS13335.asn.cymru.com TXT": {
    Status: 0,
    Answer: [{ name: "AS13335.asn.cymru.com", type: 16, data: '"13335 | US | arin | 2010-07-14 | CLOUDFLARENET - " "Cloudflare, Inc., US"' }],
  },
  "nxdomain.test A": { Status: 3 },
  "example.co.jp AAAA": { Status: 0 },
  "broken.test A": { Status: 2 },
};

function fakeDoh() {
  const asked: string[] = [];
  const resolver = dohResolver({
    fetch: (input) => {
      const url = new URL(input);
      asked.push(url.origin + url.pathname);
      const body = answers[`${url.searchParams.get("name")} ${url.searchParams.get("type")}`] ?? { Status: 3 };
      return Promise.resolve(Response.json(body));
    },
  });
  return { resolver, asked };
}

describe("dohResolver", () => {
  it("sends every lookup to Cloudflare's DNS-over-HTTPS service and nowhere else", async () => {
    const { resolver, asked } = fakeDoh();
    await resolver.resolve4("www.example.co.jp");
    await resolver.resolveMx("example.co.jp");
    await resolver.resolveTxt("AS13335.asn.cymru.com");
    expect(new Set(asked)).toEqual(new Set(["https://cloudflare-dns.com/dns-query"]));
  });

  it("answers as node:dns does", async () => {
    const { resolver } = fakeDoh();
    expect(await resolver.resolve4("www.example.co.jp")).toEqual(["104.16.132.229"]);
    expect(await resolver.resolveCname("www.example.co.jp")).toEqual(["example-co-jp.cdn.cloudflare.net"]);
    expect(await resolver.resolveNs("xserver.jp")).toEqual(["ns1.xserver.jp"]);
    expect(await resolver.resolveMx("example.co.jp")).toEqual([
      { priority: 10, exchange: "alt1.aspmx.l.google.com" },
      { priority: 1, exchange: "aspmx.l.google.com" },
    ]);
  });

  it("gives Team Cymru's answer for an address, with a TXT record in several strings joined", async () => {
    const { resolver } = fakeDoh();
    expect(await lookupAsn(txtLookup(resolver), "104.16.132.229")).toEqual({
      asn: 13335,
      prefix: "104.16.128.0/20",
      cc: "US",
      as_name: "CLOUDFLARENET - Cloudflare, Inc., US",
    });
  });

  it("reports a missing name, missing records and a failing server as the check describes them", async () => {
    const { resolver } = fakeDoh();
    const why = (p: Promise<unknown>) => p.then(() => "resolved", describeError);
    expect(await why(resolver.resolve4("nxdomain.test"))).toBe("no such host");
    expect(await why(resolver.resolve6("example.co.jp"))).toBe("no records");
    expect(await why(resolver.resolve4("broken.test"))).toBe("server failure");
  });
});
