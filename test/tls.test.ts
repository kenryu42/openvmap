import { readFileSync } from "node:fs";
import net from "node:net";
import { Duplex } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { readChain } from "@/lib/tls";

const der = (tag: number, ...parts: number[][]): number[] => {
  const body = parts.flat();
  const n = body.length;
  const len = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return [tag, ...len, ...body];
};
const utf8 = (s: string) => [...new TextEncoder().encode(s)];
const attr = (oid: number, value: string) => der(0x31, der(0x30, der(0x06, [0x55, 0x04, oid]), der(0x0c, utf8(value))));
const name = (cn: string, o?: string) => der(0x30, ...(o ? [attr(0x0a, o)] : []), attr(0x03, cn));
const version = der(0xa0, der(0x02, [2]));
const serial = der(0x02, [1]);
const ecdsaWithSha256 = der(0x30, der(0x06, [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
const cert = (subject: number[], issuer: number[]) =>
  der(
    0x30,
    der(
      0x30,
      version,
      serial,
      ecdsaWithSha256,
      issuer,
      der(0x30, der(0x17, utf8("250101000000Z")), der(0x17, utf8("351231000000Z"))),
      subject,
      der(0x30, der(0x30, der(0x06, [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])), der(0x03, [0, 4])),
    ),
    ecdsaWithSha256,
    der(0x03, [0]),
  );

const u24 = (n: number) => [n >> 16, (n >> 8) & 0xff, n & 0xff];
const record = (type: number, body: number[]) => [type, 0x03, 0x03, body.length >> 8, body.length & 0xff, ...body];
const handshake = (type: number, body: number[]) => [type, ...u24(body.length), ...body];

function serverFlight(chain: number[][]): Uint8Array {
  const hello = handshake(2, [0x03, 0x03, ...Array.from({ length: 32 }, () => 7), 0, 0xc0, 0x2f, 0]);
  const list = chain.flatMap((c) => [...u24(c.length), ...c]);
  const certificate = handshake(11, [...u24(list.length), ...list]);
  const half = Math.floor(certificate.length / 2);
  return new Uint8Array([
    ...record(0x16, hello),
    ...record(0x16, certificate.slice(0, half)),
    ...record(0x16, certificate.slice(half)),
    ...record(0x16, handshake(14, [])),
  ]);
}

function readHello(b: Buffer): { sni: string; offersTls13: boolean } {
  let p = 5 + 4 + 2 + 32;
  p += 1 + b[p];
  p += 2 + b.readUInt16BE(p);
  p += 1 + b[p];
  const end = p + 2 + b.readUInt16BE(p);
  let sni = "";
  let offersTls13 = false;
  for (p += 2; p < end;) {
    const type = b.readUInt16BE(p);
    const len = b.readUInt16BE(p + 2);
    if (type === 0x0000) sni = b.subarray(p + 9, p + 4 + len).toString();
    if (type === 0x002b) offersTls13 = true;
    p += 4 + len;
  }
  return { sni, offersTls13 };
}

let server: net.Server | undefined;
afterEach(() => server?.close());

async function serve(reply: (hello: Buffer) => Uint8Array | null): Promise<{ port: number; hellos: Buffer[] }> {
  const hellos: Buffer[] = [];
  server = net.createServer((sock) => {
    sock.once("data", (hello) => {
      hellos.push(hello);
      const out = reply(hello);
      if (!out) return sock.end();
      for (let i = 0; i < out.length; i += 7) sock.write(out.subarray(i, i + 7));
    });
    sock.on("error", () => {});
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as net.AddressInfo).port, hellos };
}

async function probe(port: number, host: string) {
  const sock = net.connect(port, "127.0.0.1");
  await new Promise((resolve) => sock.once("connect", resolve));
  try {
    return await readChain(Duplex.toWeb(sock) as unknown as Parameters<typeof readChain>[0], host);
  } finally {
    sock.destroy();
  }
}

describe("reading a site's certificate chain", () => {
  it("returns the names of the chain, leaf first, from a TLS 1.2 handshake", async () => {
    const leaf = cert(name("*.cca.gov.in"), name("EM DV TLS CA - G2A-1", "eMudhra Technologies Limited"));
    const ca = cert(name("EM DV TLS CA - G2A-1", "eMudhra Technologies Limited"), name("emSign Root TLS CA - G1", "eMudhra Technologies Limited"));
    const { port, hellos } = await serve(() => serverFlight([leaf, ca]));

    expect(await probe(port, "www.cca.gov.in")).toEqual([
      { subject_cn: "*.cca.gov.in", issuer_cn: "EM DV TLS CA - G2A-1", issuer_o: "eMudhra Technologies Limited" },
      {
        subject_cn: "EM DV TLS CA - G2A-1",
        subject_o: "eMudhra Technologies Limited",
        issuer_cn: "emSign Root TLS CA - G1",
        issuer_o: "eMudhra Technologies Limited",
      },
    ]);
    expect(readHello(hellos[0])).toEqual({ sni: "www.cca.gov.in", offersTls13: false });
  });

  it("reads the names of real certificate chains (an eMudhra G1 chain and a Japanese host's)", async () => {
    const chainOf = (file: string) =>
      [...readFileSync(`test/fixtures/tls/${file}`, "utf8").matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map((m) => [
        ...Buffer.from(m[1].replace(/\s+/g, ""), "base64"),
      ]);
    let s = await serve(() => serverFlight(chainOf("cca-gov-in-chain.pem")));
    expect(await probe(s.port, "www.cca.gov.in")).toEqual([
      { subject_cn: "*.cca.gov.in", issuer_cn: "EM DV TLS CA - G2A-1", issuer_o: "eMudhra Technologies Limited" },
      {
        subject_cn: "EM DV TLS CA - G2A-1",
        subject_o: "eMudhra Technologies Limited",
        issuer_cn: "emSign Root TLS CA - G1",
        issuer_o: "eMudhra Technologies Limited",
      },
      {
        subject_cn: "emSign Root TLS CA - G1",
        subject_o: "eMudhra Technologies Limited",
        issuer_cn: "emSign Root CA - G1",
        issuer_o: "eMudhra Technologies Limited",
      },
    ]);
    server!.close();

    s = await serve(() => serverFlight(chainOf("sakura-ad-jp-chain.pem")));
    expect(await probe(s.port, "www.sakura.ad.jp")).toEqual([
      {
        subject_cn: "www.sakura.ad.jp",
        subject_o: "SAKURA internet Inc.",
        issuer_cn: "Cybertrust Japan SureServer EV CA G3",
        issuer_o: "Cybertrust Japan Co., Ltd.",
      },
      { subject_cn: "Cybertrust Japan SureServer EV CA G3", subject_o: "Cybertrust Japan Co., Ltd.", issuer_o: "SECOM Trust Systems CO.,LTD." },
    ]);
  });

  it("reports a server that refuses TLS 1.2 (alert), one that is not TLS, and one that hangs up", async () => {
    let s = await serve(() => new Uint8Array(record(0x15, [2, 70])));
    await expect(probe(s.port, "a.test")).rejects.toThrow("TLS alert 70");
    server!.close();

    s = await serve(() => new TextEncoder().encode("HTTP/1.1 400 Bad Request\r\n\r\n"));
    await expect(probe(s.port, "a.test")).rejects.toThrow("not a TLS server");
    server!.close();

    s = await serve(() => null);
    await expect(probe(s.port, "a.test")).rejects.toThrow("connection closed before the certificate");
  });
});
