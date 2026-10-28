import { describe, expect, it } from "vitest";
import { normalizeDomain, parseDomain, resolveZone, type Resolver } from "@/lib/dns";

const notFound = () => Promise.reject(Object.assign(new Error("queryA ENOTFOUND"), { code: "ENOTFOUND" }));

const fake: Resolver = {
  resolve4: (h) => (h === "example.co.jp" ? Promise.resolve(["203.0.113.10"]) : h === "www.example.co.jp" ? Promise.resolve(["104.16.1.1"]) : notFound()),
  resolve6: (h) => (h === "www.example.co.jp" ? Promise.resolve(["2606:4700::1"]) : notFound()),
  resolveCname: (h) => (h === "www.example.co.jp" ? Promise.resolve(["example-co-jp.cdn.cloudflare.net"]) : notFound()),
  resolveNs: (h) => (h === "example.co.jp" ? Promise.resolve(["ns2.xserver.jp", "ns1.xserver.jp"]) : notFound()),
  resolveMx: (h) =>
    h === "mail.test"
      ? Promise.resolve([
          { exchange: "b.mx.test", priority: 10 },
          { exchange: "c.mx.test", priority: 5 },
          { exchange: "a.mx.test", priority: 10 },
        ])
      : notFound(),
  resolvePtr: () => notFound(),
  resolveTxt: () => Promise.resolve([]),
};

describe("resolveZone", () => {
  it("resolves NS, hosts and CNAMEs, and warns on a missing MX", async () => {
    const { zone, warnings } = await resolveZone(fake, "https://Example.co.jp/path");
    expect(zone.domain).toBe("example.co.jp");
    expect(zone.ns).toEqual(["ns1.xserver.jp", "ns2.xserver.jp"]);
    expect(zone.hosts).toHaveLength(2);
    expect(zone.hosts[0].cname).toBeUndefined();
    expect(zone.hosts[1]).toEqual({
      name: "www.example.co.jp",
      cname: "example-co-jp.cdn.cloudflare.net",
      ips: ["104.16.1.1", "2606:4700::1"],
    });
    expect(warnings).toEqual(["MX example.co.jp: no such host"]);
  });

  it("looks up NS and MX on the parent of a www host and checks only that host", async () => {
    const { zone, warnings } = await resolveZone(fake, "www.example.co.jp");
    expect(zone.domain).toBe("www.example.co.jp");
    expect(zone.ns).toEqual(["ns1.xserver.jp", "ns2.xserver.jp"]);
    expect(zone.hosts.map((h) => h.name)).toEqual(["www.example.co.jp"]);
    expect(warnings).toEqual(["MX example.co.jp: no such host"]);
  });

  it("sorts MX by preference, then name", async () => {
    const { zone } = await resolveZone(fake, "mail.test");
    expect(zone.mx).toEqual(["c.mx.test", "a.mx.test", "b.mx.test"]);
  });

  it("follows a CNAME chain to its end", async () => {
    const chain: Resolver = {
      ...fake,
      resolve4: () => Promise.resolve(["192.0.2.1"]),
      resolveCname: (h) => (h === "www.a.test" ? Promise.resolve(["x.cdn.test."]) : h === "x.cdn.test" ? Promise.resolve(["y.edge.test"]) : notFound()),
    };
    const { zone } = await resolveZone(chain, "a.test");
    expect(zone.hosts[1].cname).toBe("y.edge.test");
  });

  it("never puts the resolver's address in a warning", async () => {
    const r: Resolver = {
      ...fake,
      resolveNs: () => Promise.reject(Object.assign(new Error("queryNs ETIMEOUT 192.168.1.1:53"), { code: "ETIMEOUT" })),
    };
    const { warnings } = await resolveZone(r, "example.co.jp");
    expect(warnings[0]).toBe("NS example.co.jp: timeout");
  });
});

describe("normalizeDomain", () => {
  it.each([
    ["Example.JP.", "example.jp"],
    ["https://example.jp/a?b#c", "example.jp"],
    ["  example.jp  ", "example.jp"],
    ["http://www.example.jp:8080/x", "www.example.jp:8080"],
  ])("%s → %s", (input, want) => {
    expect(normalizeDomain(input)).toBe(want);
  });
});

describe("parseDomain", () => {
  it.each([
    ["Example.co.jp", "example.co.jp"],
    ["https://www.example.co.jp/path?q=1", "www.example.co.jp"],
    ["例え.jp", "xn--r8jz45g.jp"],
  ])("accepts %s", (input, want) => {
    expect(parseDomain(input)).toBe(want);
  });

  it.each([
    "http://evil/..",
    "127.0.0.1",
    "http://127.0.0.1/",
    "::1",
    "[::1]",
    "localhost",
    "foo.localhost",
    "example.jp:8080",
    "user@example.jp",
    "exa mple.jp",
    "-bad.example.jp",
    "a..b.jp",
    "",
    "a".repeat(300) + ".jp",
    ("a".repeat(60) + ".").repeat(5) + "jp",
    "1.2.3.4.5",
  ])("rejects %j", (input) => {
    expect(parseDomain(input)).toBeNull();
  });
});
