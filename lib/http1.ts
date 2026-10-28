import type { PageResponse } from "./check";

type Stream = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

const maxHeaderBytes = 64 * 1024;
const crlf = new Uint8Array([13, 10]);
const endOfHeaders = new Uint8Array([13, 10, 13, 10]);

export async function httpGet(stream: Stream, url: URL, headers: Record<string, string>, maxBody: number): Promise<PageResponse> {
  const lines = [`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`];
  for (const [k, v] of Object.entries(headers)) {
    if (/[\r\n]/.test(k + v)) throw new Error("bad request header");
    lines.push(`${k}: ${v}`);
  }
  lines.push("Accept-Encoding: gzip, deflate", "Connection: close", "", "");
  const writer = stream.writable.getWriter();
  await writer.write(new TextEncoder().encode(lines.join("\r\n")));
  writer.releaseLock();

  const r = new ByteReader(stream.readable.getReader());
  try {
    for (;;) {
      const head = await r.until(endOfHeaders, maxHeaderBytes);
      if (!head) throw new Error("connection closed before the response");
      const { status, headers: h } = parseHead(new TextDecoder("latin1").decode(head));
      const isInterimResponse = status >= 100 && status < 200;
      if (isInterimResponse) continue;
      const raw = status === 204 || status === 304 ? new Uint8Array(0) : await readBody(r, h, maxBody);
      return { status, headers: h, body: await decode(raw, h.get("content-encoding"), maxBody) };
    }
  } finally {
    r.release();
  }
}

function parseHead(text: string): { status: number; headers: Headers } {
  const [statusLine, ...rest] = text.split("\r\n");
  const m = statusLine.match(/^HTTP\/1\.[01] (\d{3})/);
  if (!m) throw new Error("not an HTTP/1.x response");
  const headers = new Headers();
  for (const line of rest) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    try {
      headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
    } catch {}
  }
  return { status: Number(m[1]), headers };
}

async function readBody(r: ByteReader, h: Headers, max: number): Promise<Uint8Array<ArrayBuffer>> {
  if (/\bchunked\b/i.test(h.get("transfer-encoding") ?? "")) {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for (;;) {
      const line = await r.until(crlf, 1024);
      if (!line) break;
      const n = parseInt(new TextDecoder().decode(line), 16);
      if (!Number.isFinite(n) || n === 0) break;
      const chunk = await r.take(Math.min(n, max - size));
      parts.push(chunk);
      size += chunk.length;
      if (size >= max || chunk.length < n) break;
      await r.take(crlf.length);
    }
    return concat(parts);
  }
  const length = h.get("content-length");
  return r.take(length !== null && /^\d+$/.test(length) ? Math.min(Number(length), max) : max);
}

async function decode(raw: Uint8Array<ArrayBuffer>, encoding: string | null, max: number): Promise<string> {
  const e = (encoding ?? "").trim().toLowerCase();
  if (e !== "gzip" && e !== "deflate") return new TextDecoder().decode(raw);
  try {
    const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(c) {
        c.enqueue(raw);
        c.close();
      },
    });
    const out = input.pipeThrough(new DecompressionStream(e));
    const reader = out.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done || !value) break;
      parts.push(value);
      size += value.length;
      if (size >= max) {
        void reader.cancel().catch(() => {});
        break;
      }
    }
    return new TextDecoder().decode(concat(parts).subarray(0, max));
  } catch {
    return "";
  }
}

class ByteReader {
  private buf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private ended = false;
  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async fill(): Promise<boolean> {
    if (this.ended) return false;
    const { value, done } = await this.reader.read();
    if (done || !value) {
      this.ended = true;
      return false;
    }
    this.buf = concat([this.buf, value]);
    return true;
  }

  async until(delim: Uint8Array, limit: number): Promise<Uint8Array | null> {
    for (;;) {
      const i = indexOf(this.buf, delim);
      if (i >= 0) {
        const out = this.buf.subarray(0, i);
        this.buf = this.buf.subarray(i + delim.length);
        return out;
      }
      if (this.buf.length > limit) throw new Error("response header too large");
      if (!(await this.fill())) return null;
    }
  }

  async take(n: number): Promise<Uint8Array<ArrayBuffer>> {
    while (this.buf.length < n && (await this.fill()));
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(out.length);
    return out;
  }

  release(): void {
    this.reader.releaseLock();
  }
}

function indexOf(b: Uint8Array, d: Uint8Array): number {
  outer: for (let i = 0; i + d.length <= b.length; i++) {
    for (let j = 0; j < d.length; j++) if (b[i + j] !== d[j]) continue outer;
    return i;
  }
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
