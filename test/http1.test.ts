import http from "node:http";
import net from "node:net";
import { Duplex } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { httpGet } from "@/lib/http1";

let server: http.Server | undefined;
afterEach(() => server?.close());

async function serve(handler: http.RequestListener) {
  const seen: { method?: string; url?: string; headers: http.IncomingHttpHeaders }[] = [];
  server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as net.AddressInfo).port, seen };
}

async function get(port: number, path = "/", maxBody = 512 * 1024) {
  const sock = net.connect(port, "127.0.0.1");
  await new Promise((resolve) => sock.once("connect", resolve));
  try {
    const url = new URL(`http://site.test:${port}${path}`);
    return await httpGet(Duplex.toWeb(sock) as unknown as Parameters<typeof httpGet>[0], url, { "User-Agent": "vmap/test" }, maxBody);
  } finally {
    sock.destroy();
  }
}

describe("the pinned page request's HTTP/1.1 GET", () => {
  it("sends one GET for the host and returns status, headers and body", async () => {
    const { port, seen } = await serve((_req, res) => {
      res.setHeader("X-Powered-By", "PHP/8.3.36");
      res.setHeader("Set-Cookie", ["PHPSESSID=abc; Path=/", "lang=ja; Path=/"]);
      res.end("<html>hello</html>");
    });
    const res = await get(port, "/?q=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-powered-by")).toBe("PHP/8.3.36");
    expect(res.headers.getSetCookie()).toEqual(["PHPSESSID=abc; Path=/", "lang=ja; Path=/"]);
    expect(res.body).toBe("<html>hello</html>");
    expect(seen).toEqual([
      expect.objectContaining({
        method: "GET",
        url: "/?q=1",
        headers: expect.objectContaining({ host: `site.test:${port}`, "user-agent": "vmap/test" }) as Record<string, string>,
      }),
    ]);
  });

  it("reads chunked and gzip bodies, as most PHP sites send", async () => {
    let s = await serve((_req, res) => {
      res.write("<html>");
      res.write("chunked");
      res.end("</html>");
    });
    expect((await get(s.port)).body).toBe("<html>chunked</html>");
    server!.close();

    s = await serve((_req, res) => {
      res.setHeader("Content-Encoding", "gzip");
      res.end(gzipSync("<html>compressed</html>"));
    });
    expect((await get(s.port)).body).toBe("<html>compressed</html>");
  });

  it("returns a redirect without following it, and stops reading at the body cap", async () => {
    let s = await serve((_req, res) => {
      res.writeHead(301, { Location: "https://www.site.test/" });
      res.end();
    });
    const redirect = await get(s.port);
    expect([redirect.status, redirect.headers.get("location")]).toEqual([301, "https://www.site.test/"]);
    server!.close();

    s = await serve((_req, res) => res.end("x".repeat(100_000)));
    expect((await get(s.port, "/", 1000)).body).toBe("x".repeat(1000));
  });
});
