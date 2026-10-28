import { describe, expect, it } from "vitest";
import { cymruName, lookupAsn, parseAsName, parseOrigin, type TxtLookup } from "@/lib/asn";

describe("cymruName", () => {
  it("reverses IPv4 octets", () => {
    expect(cymruName("104.16.132.229")).toBe("229.132.16.104.origin.asn.cymru.com");
  });

  it("reverses all 32 IPv6 nibbles", () => {
    expect(cymruName("2001:db8::1")).toBe("1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.origin6.asn.cymru.com");
  });

  it("builds the name that answered live for 2606:4700::6810:7c60 on 2026-10-24", () => {
    expect(cymruName("2606:4700::6810:7c60")).toBe("0.6.c.7.0.1.8.6.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.7.4.6.0.6.2.origin6.asn.cymru.com");
  });

  it("queries the IPv4 zone for an IPv4-mapped address", () => {
    expect(cymruName("::ffff:104.16.132.229")).toBe("229.132.16.104.origin.asn.cymru.com");
  });

  it("rejects what is not an IP", () => {
    expect(() => cymruName("1.2")).toThrow();
    expect(() => cymruName("example.jp")).toThrow();
  });
});

describe("parseOrigin", () => {
  it("parses one ASN", () => {
    expect(parseOrigin("13335 | 104.16.0.0/12 | US | arin | 2014-03-28")).toEqual({
      asns: [13335],
      prefix: "104.16.0.0/12",
      cc: "US",
    });
  });

  it("parses several ASNs in the first field", () => {
    expect(parseOrigin("7684 9370 | 160.16.0.0/15 | JP | apnic | 2012-05-28").asns).toEqual([7684, 9370]);
  });

  it("rejects garbage and non-numeric ASNs", () => {
    expect(() => parseOrigin("garbage")).toThrow();
    expect(() => parseOrigin("x | 1.2.3.0/24 | JP")).toThrow();
  });
});

describe("parseAsName", () => {
  it("returns the fifth field", () => {
    expect(parseAsName("131965 | JP | apnic | 2013-11-15 | XSERVER-AS Xserver Inc., JP")).toBe("XSERVER-AS Xserver Inc., JP");
    expect(parseAsName("131965 | JP | apnic | 2013-11-15 | XSERVER - Xserver Inc., JP")).toBe("XSERVER - Xserver Inc., JP");
  });

  it("returns empty for a short record", () => {
    expect(parseAsName("short")).toBe("");
  });
});

describe("lookupAsn", () => {
  const txt: TxtLookup = (name) => {
    switch (name) {
      case "229.132.16.104.origin.asn.cymru.com":
        return Promise.resolve(["13335 | 104.16.0.0/12 | US | arin | 2014-03-28"]);
      case "AS13335.asn.cymru.com":
        return Promise.resolve(["13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"]);
      case "1.0.0.10.origin.asn.cymru.com":
        return Promise.resolve([]);
    }
    return Promise.reject(Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" }));
  };

  it("resolves origin and AS name from recorded answers", async () => {
    expect(await lookupAsn(txt, "104.16.132.229")).toEqual({
      asn: 13335,
      prefix: "104.16.0.0/12",
      cc: "US",
      as_name: "CLOUDFLARENET, US",
    });
  });

  it("fails on an empty answer and on a failed lookup", async () => {
    await expect(lookupAsn(txt, "10.0.0.1")).rejects.toThrow("no origin record");
    await expect(lookupAsn(txt, "192.0.2.1")).rejects.toThrow("origin lookup");
  });
});
