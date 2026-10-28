import { ipBytes, unmapV4 } from "./ip";

export type TxtLookup = (name: string) => Promise<string[]>;

export interface AsnResult {
  asn: number;
  prefix: string;
  cc: string;
  as_name: string;
}

export function txtLookup(r: { resolveTxt(name: string): Promise<string[][]> }): TxtLookup {
  return async (name) => (await r.resolveTxt(name)).map((chunks) => chunks.join(""));
}

export async function lookupAsn(txt: TxtLookup, ip: string): Promise<AsnResult> {
  const name = cymruName(ip);
  let recs: string[];
  try {
    recs = await txt(name);
  } catch (err) {
    throw new Error(`asn: origin lookup ${ip}: ${errText(err)}`);
  }
  if (recs.length === 0) throw new Error(`asn: no origin record for ${ip}`);
  const { asns, prefix, cc } = parseOrigin(recs[0]);
  const r: AsnResult = { asn: asns[0], prefix, cc, as_name: "" };
  try {
    const nameRecs = await txt(`AS${r.asn}.asn.cymru.com`);
    if (nameRecs.length > 0) r.as_name = parseAsName(nameRecs[0]);
  } catch {}
  return r;
}

export function cymruName(ip: string): string {
  const { labels, v4 } = reversed(ip);
  return labels + (v4 ? "origin.asn.cymru.com" : "origin6.asn.cymru.com");
}

export function reverseName(ip: string): string {
  const { labels, v4 } = reversed(ip);
  return labels + (v4 ? "in-addr.arpa" : "ip6.arpa");
}

function reversed(ip: string): { labels: string; v4: boolean } {
  const parsed = ipBytes(ip);
  if (!parsed) throw new Error(`asn: not an IP address: ${JSON.stringify(ip)}`);
  const b = unmapV4(parsed);
  if (b.length === 4) return { labels: `${b[3]}.${b[2]}.${b[1]}.${b[0]}.`, v4: true };
  let out = "";
  for (let i = b.length - 1; i >= 0; i--) {
    out += `${(b[i] & 0x0f).toString(16)}.${(b[i] >> 4).toString(16)}.`;
  }
  return { labels: out, v4: false };
}

export function parseOrigin(txt: string): { asns: number[]; prefix: string; cc: string } {
  const f = fields(txt);
  if (f.length < 3) throw new Error(`asn: unexpected origin record ${JSON.stringify(txt)}`);
  const asns: number[] = [];
  for (const s of f[0].split(/\s+/).filter(Boolean)) {
    if (!/^\d+$/.test(s) || Number(s) > 0xffffffff) throw new Error(`asn: bad ASN in ${JSON.stringify(txt)}`);
    asns.push(Number(s));
  }
  if (asns.length === 0) throw new Error(`asn: no ASN in ${JSON.stringify(txt)}`);
  return { asns, prefix: f[1], cc: f[2] };
}

export function parseAsName(txt: string): string {
  const f = fields(txt);
  return f.length < 5 ? "" : f[4];
}

function fields(txt: string): string[] {
  return txt.split("|").map((s) => s.trim());
}

function errText(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === "ENOTFOUND" || code === "ENODATA") return "no such host";
  if (code) return code;
  return err instanceof Error ? err.message : String(err);
}
