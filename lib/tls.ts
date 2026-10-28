// Reads which certificate authority issued a site's certificate, from the
// start of one TLS 1.2 handshake: a ClientHello, then the server's
// Certificate message, which TLS 1.2 sends unencrypted (TLS 1.3 encrypts
// it, so a server that speaks only 1.3 gives no answer). The connection is
// closed once the certificates arrive; no key exchange, no HTTP request.
// Runtime-neutral: the Worker feeds it a cloudflare:sockets connection.

export interface TlsCert {
  subject_cn?: string;
  subject_o?: string;
  issuer_cn?: string;
  issuer_o?: string;
}

export interface TlsInfo {
  host: string;
  chain?: TlsCert[];
  error?: string;
  distrusted_root?: string;
}

export type CertProbe = (host: string, signal: AbortSignal) => Promise<TlsCert[]>;

const suites = [0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8, 0xc009, 0xc013, 0xc00a, 0xc014, 0x009c, 0x009d, 0x002f, 0x0035];
const groups = [0x001d, 0x0017, 0x0018];
const sigAlgs = [0x0403, 0x0503, 0x0603, 0x0804, 0x0805, 0x0806, 0x0401, 0x0501, 0x0601, 0x0201, 0x0203];

const extensionType = {
  serverName: 0x0000,
  supportedGroups: 0x000a,
  ecPointFormats: 0x000b,
  signatureAlgorithms: 0x000d,
  renegotiationInfo: 0xff01,
} as const;
const hostNameType = 0;
const onlyUncompressedPoints = [1, 0];
const emptyRenegotiatedConnection = [0];
const tls12 = [0x03, 0x03];
const noSessionId = [0];
const onlyNullCompression = [1, 0];
const explicitVersionTag = 0xa0;

function clientHello(serverName: string, random: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): Uint8Array {
  const name = new TextEncoder().encode(serverName);
  const ext = (type: number, data: number[]) => [...u16(type), ...u16(data.length), ...data];
  const extensions = [
    ...ext(extensionType.serverName, [...u16(name.length + 3), hostNameType, ...u16(name.length), ...name]),
    ...ext(extensionType.supportedGroups, [...u16(groups.length * 2), ...groups.flatMap(u16)]),
    ...ext(extensionType.ecPointFormats, onlyUncompressedPoints),
    ...ext(extensionType.signatureAlgorithms, [...u16(sigAlgs.length * 2), ...sigAlgs.flatMap(u16)]),
    ...ext(extensionType.renegotiationInfo, emptyRenegotiatedConnection),
  ];
  const body = [
    ...tls12,
    ...random,
    ...noSessionId,
    ...u16(suites.length * 2),
    ...suites.flatMap(u16),
    ...onlyNullCompression,
    ...u16(extensions.length),
    ...extensions,
  ];
  const handshake = [1, ...u24(body.length), ...body];
  return new Uint8Array([0x16, 0x03, 0x01, ...u16(handshake.length), ...handshake]);
}

export async function readChain(stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }, host: string): Promise<TlsCert[]> {
  const writer = stream.writable.getWriter();
  await writer.write(clientHello(host));
  writer.releaseLock();
  const reader = stream.readable.getReader();
  try {
    let buf = new Uint8Array(0);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("connection closed before the certificate");
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;
      const got = readCertificates(buf);
      if (got && "error" in got) throw new Error(got.error);
      if (got) return got.certs.map(certNames);
    }
  } finally {
    reader.releaseLock();
  }
}

function readCertificates(data: Uint8Array): { certs: Uint8Array[] } | { error: string } | null {
  const hs: number[] = [];
  let off = 0;
  while (off + 5 <= data.length) {
    const type = data[off];
    const len = (data[off + 3] << 8) | data[off + 4];
    if (off + 5 + len > data.length) break;
    const frag = data.subarray(off + 5, off + 5 + len);
    off += 5 + len;
    if (type === 0x15) return { error: `TLS alert ${frag[1] ?? "?"}` };
    if (type !== 0x16) return { error: `unexpected TLS record ${type}` };
    hs.push(...frag);
    for (let m = 0; m + 4 <= hs.length;) {
      const mlen = (hs[m + 1] << 16) | (hs[m + 2] << 8) | hs[m + 3];
      if (m + 4 + mlen > hs.length) break;
      if (hs[m] === 11) return { certs: certificateList(new Uint8Array(hs.slice(m + 4, m + 4 + mlen))) };
      if (hs[m] === 14) return { error: "server sent no certificate" };
      m += 4 + mlen;
    }
  }
  if (off === 0 && data.length >= 5 && data[0] !== 0x15 && data[0] !== 0x16) return { error: "not a TLS server" };
  if (data.length > 256 * 1024) return { error: "no certificate in the first 256 KiB" };
  return null;
}

function certificateList(b: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const end = Math.min(b.length, 3 + ((b[0] << 16) | (b[1] << 8) | b[2]));
  for (let off = 3; off + 3 <= end;) {
    const len = (b[off] << 16) | (b[off + 1] << 8) | b[off + 2];
    out.push(b.subarray(off + 3, off + 3 + len));
    off += 3 + len;
  }
  return out;
}

function certNames(der: Uint8Array): TlsCert {
  const tbsCertificate = tlv(der, tlv(der, 0).start);
  const version = der[tbsCertificate.start] === explicitVersionTag ? tlv(der, tbsCertificate.start) : undefined;
  const serialNumber = tlv(der, version?.end ?? tbsCertificate.start);
  const signatureAlgorithm = tlv(der, serialNumber.end);
  const issuer = tlv(der, signatureAlgorithm.end);
  const validity = tlv(der, issuer.end);
  const subject = tlv(der, validity.end);
  const i = names(der, issuer);
  const s = names(der, subject);
  return clean({ subject_cn: s.cn, subject_o: s.o, issuer_cn: i.cn, issuer_o: i.o });
}

interface Tlv {
  tag: number;
  start: number;
  end: number;
}

function tlv(b: Uint8Array, off: number): Tlv {
  if (off + 2 > b.length) throw new Error("truncated certificate");
  let len = b[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 3) throw new Error("bad length in certificate");
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | b[start + k];
    start += n;
  }
  if (start + len > b.length) throw new Error("truncated certificate");
  return { tag: b[off], start, end: start + len };
}

function names(b: Uint8Array, name: Tlv): { cn?: string; o?: string } {
  const out: { cn?: string; o?: string } = {};
  for (let set = name.start; set < name.end;) {
    const s = tlv(b, set);
    for (let seq = s.start; seq < s.end;) {
      const q = tlv(b, seq);
      const oid = tlv(b, q.start);
      const value = tlv(b, oid.end);
      const o = b.subarray(oid.start, oid.end);
      const text = decodeString(value.tag, b.subarray(value.start, value.end));
      if (o.length === 3 && o[0] === 0x55 && o[1] === 0x04) {
        if (o[2] === 0x03) out.cn ??= text;
        if (o[2] === 0x0a) out.o ??= text;
      }
      seq = q.end;
    }
    set = s.end;
  }
  return out;
}

function decodeString(tag: number, v: Uint8Array): string {
  if (tag === 0x1e) {
    let s = "";
    for (let k = 0; k + 1 < v.length; k += 2) s += String.fromCharCode((v[k] << 8) | v[k + 1]);
    return s;
  }
  return new TextDecoder(tag === 0x14 ? "latin1" : "utf-8").decode(v);
}

function clean(c: TlsCert): TlsCert {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u24(n: number): number[] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
