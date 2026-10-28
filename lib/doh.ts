import type { Resolver } from "./dns";

export const dohService = {
  company: "Cloudflare, Inc.",
  host: "cloudflare-dns.com",
  privacyPolicy: "https://developers.cloudflare.com/1.1.1.1/privacy/public-dns-resolver/",
};
const endpoint = `https://${dohService.host}/dns-query`;
const timeoutMs = 5_000;

const types = { A: 1, NS: 2, CNAME: 5, PTR: 12, MX: 15, TXT: 16, AAAA: 28 } as const;
type RecordType = keyof typeof types;

const rcodes: Record<number, string> = { 2: "ESERVFAIL", 3: "ENOTFOUND", 5: "EREFUSED" };

interface Answer {
  name: string;
  type: number;
  data: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function dohResolver(o: { fetch?: Fetch } = {}): Resolver {
  const get = o.fetch ?? ((input, init) => fetch(input, init));

  async function query(name: string, type: RecordType): Promise<string[]> {
    const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
    let res: Response;
    try {
      res = await get(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw Object.assign(new Error(timedOut ? "timeout" : "DNS-over-HTTPS request failed"), timedOut ? { code: "ETIMEOUT" } : {});
    }
    if (!res.ok) throw new Error(`DNS-over-HTTPS answered HTTP ${res.status}`);
    const body = (await res.json()) as { Status: number; Answer?: Answer[] };
    if (body.Status !== 0) {
      const code = rcodes[body.Status];
      throw Object.assign(new Error(code ?? `DNS response code ${body.Status}`), code ? { code } : {});
    }
    const data = (body.Answer ?? []).filter((a) => a.type === types[type]).map((a) => a.data);
    if (data.length === 0) throw Object.assign(new Error("ENODATA"), { code: "ENODATA" });
    return data;
  }

  const host = (d: string) => (d.endsWith(".") ? d.slice(0, -1) : d);
  return {
    resolve4: (h) => query(h, "A"),
    resolve6: (h) => query(h, "AAAA"),
    resolveCname: async (h) => (await query(h, "CNAME")).map(host),
    resolveNs: async (h) => (await query(h, "NS")).map(host),
    resolveMx: async (h) =>
      (await query(h, "MX")).map((d) => {
        const [priority, exchange = ""] = d.split(/\s+/);
        return { priority: Number(priority), exchange: host(exchange) };
      }),
    resolveTxt: async (h) => (await query(h, "TXT")).map(txtChunks),
    resolvePtr: async (n) => (await query(n, "PTR")).map(host),
  };
}

function txtChunks(data: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(data))) {
    out.push(m[1].replace(/\\(\d{3}|.)/g, (_, e: string) => (e.length === 3 ? String.fromCharCode(Number(e)) : e)));
  }
  return out.length > 0 ? out : [data];
}
