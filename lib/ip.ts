const v4Part = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const v4 = new RegExp(`^${v4Part}(\\.${v4Part}){3}$`);

export function isIP(s: string): 0 | 4 | 6 {
  if (v4.test(s)) return 4;
  if (!s.includes(":") || /[^0-9a-fA-F:.]/.test(s)) return 0;
  try {
    new URL(`http://[${s}]/`);
    return 6;
  } catch {
    return 0;
  }
}

export function ipBytes(ip: string): Uint8Array | null {
  const kind = isIP(ip);
  if (kind === 4) return Uint8Array.from(ip.split(".").map(Number));
  if (kind !== 6 || ip.includes("%")) return null;

  let head = ip;
  let tail: number[] = [];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4) {
    tail = v4[1].split(".").map(Number);
    head = ip.slice(0, -v4[1].length) + "0:0";
  }
  const [left, right] = head.includes("::") ? head.split("::") : [head, undefined];
  const groups = (s: string | undefined) => (s ? s.split(":").filter((g) => g !== "") : []);
  const l = groups(left);
  const r = groups(right);
  const words = right === undefined ? l : [...l, ...Array<string>(8 - l.length - r.length).fill("0"), ...r];
  const out = new Uint8Array(16);
  words.forEach((w, i) => {
    const n = parseInt(w, 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 0xff;
  });
  if (tail.length === 4) out.set(tail, 12);
  return out;
}

export function unmapV4(b: Uint8Array): Uint8Array {
  if (b.length === 16 && b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return b.slice(12);
  }
  return b;
}
