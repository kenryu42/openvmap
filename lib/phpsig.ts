interface Signal {
  kind: string;
  evidence: string;
  weight: number;
}

export type Verdict = "likely" | "possible" | "unlikely" | "none";

export type VersionStatus = "fixed_or_later" | "below_fixed_release" | "no_official_fix" | "unknown";

const fixedVersions: Readonly<Record<string, string>> = {
  "8.5": "8.5.12",
  "8.4": "8.4.27",
  "8.3": "8.3.36",
  "8.2": "8.2.35",
};

export interface PhpResult {
  verdict: Verdict;
  score: number;
  signals: Signal[];
  cms?: string[];
  php_version?: string;
  version_status?: VersionStatus;
  long_session_cookie?: boolean;
}

const signalWeight = {
  namesPhp: 6,
  namesOtherStack: -4,
  sharedHostServer: 1,
  sameSitePhpLink: 3,
} as const;

const otherStackPoweredBy = ["ASP.NET", "Express", "Next.js", "Phusion"];
const sharedHostServer = "litespeed";
const longestSessionIdPhpMakes = 256;

const rePhpVersion = /PHP\/(\d+\.\d+(?:\.\d+)?)/i;
const reMeta = /<meta\s/gi;
const reGenName = /name\s*=\s*["']generator["']/gi;
const reContentWord = /content/gi;
const reContent = /content\s*=\s*["']([^"']+)["']/iy;
const rePhpLink = /(?:href|src|action)\s*=\s*["']([^"']*\.php)(?:[?"'#])/gi;

interface CmsRule {
  name: string;
  weight: number;
  markers?: string[];
  gens?: string[];
  cookies?: string[];
}

const cmsRules: CmsRule[] = [
  { name: "WordPress", weight: 5, markers: ["/wp-content/", "/wp-includes/", "/wp-json/"], gens: ["wordpress"] },
  { name: "EC-CUBE", weight: 5, markers: ["eccube", "ec-cube"], gens: ["ec-cube"] },
  { name: "Drupal", weight: 5, markers: ["drupal.settings", "/sites/default/files/"], gens: ["drupal"] },
  { name: "Joomla", weight: 5, gens: ["joomla"] },
  { name: "Concrete CMS", weight: 5, gens: ["concrete5", "concrete cms"] },
  { name: "baserCMS", weight: 5, gens: ["basercms"] },
  { name: "a-blog cms", weight: 5, gens: ["a-blog cms"], markers: ["/acms/"] },
  { name: "Magento", weight: 5, markers: ["magento_", "/static/frontend/"] },
  { name: "MediaWiki", weight: 5, gens: ["mediawiki"] },
  { name: "Laravel", weight: 5, cookies: ["laravel_session"] },
  { name: "CakePHP", weight: 5, cookies: ["cakephp"] },
  { name: "Movable Type", weight: 1, gens: ["movable type"] },
  { name: "Hugo", weight: -3, gens: ["hugo"] },
  { name: "Jekyll", weight: -3, gens: ["jekyll"] },
  { name: "Gatsby", weight: -3, gens: ["gatsby"] },
  { name: "Next.js", weight: -3, gens: ["next.js"], markers: ["/_next/static/"] },
  { name: "Nuxt", weight: -3, markers: ["/_nuxt/"] },
  { name: "Wix", weight: -3, gens: ["wix.com"] },
  { name: "Shopify", weight: -3, markers: ["cdn.shopify.com"] },
  { name: "Squarespace", weight: -3, gens: ["squarespace"] },
  { name: "STUDIO", weight: -3, markers: ["studio.design"] },
  { name: "Jimdo", weight: -3, markers: ["jimstatic.com", "jimcdn.com"] },
];

export function analyzePhp(headers: Headers, body: string, page: URL): PhpResult {
  const signals: Signal[] = [];
  let score = 0;
  const cms: string[] = [];
  const add = (kind: string, evidence: string, weight: number) => {
    signals.push({ kind, evidence, weight });
    score += weight;
  };
  const addCms = (rule: CmsRule, evidence: string) => {
    if (cms.includes(rule.name)) return;
    cms.push(rule.name);
    add("cms", `${rule.name}: ${evidence}`, rule.weight);
  };

  let version = "";
  for (const v of values(headers, "x-powered-by")) {
    if (v.toUpperCase().includes("PHP")) {
      add("x-powered-by", v, signalWeight.namesPhp);
      const m = rePhpVersion.exec(v);
      if (m) version = m[1];
    } else if (otherStackPoweredBy.some((s) => v.includes(s))) {
      add("x-powered-by", v, signalWeight.namesOtherStack);
    }
  }
  const server = headers.get("server") ?? "";
  if (server !== "") {
    const m = rePhpVersion.exec(server);
    if (m) {
      add("server", server, signalWeight.namesPhp);
      if (version === "") version = m[1];
    } else if (server.toLowerCase().includes(sharedHostServer)) {
      add("server", server, signalWeight.sharedHostServer);
    }
  }

  const cookies = new Map<string, string>();
  for (const c of headers.getSetCookie()) {
    const pair = c.split(";", 1)[0];
    const eq = pair.indexOf("=");
    const name = (eq < 0 ? pair : pair.slice(0, eq)).trim();
    cookies.set(name.toLowerCase(), eq < 0 ? "" : pair.slice(eq + 1));
  }
  const sid = cookies.get("phpsessid");
  let longCookie = false;
  if (sid !== undefined) {
    add("cookie", "PHPSESSID", signalWeight.namesPhp);
    const n = Buffer.byteLength(sid);
    if (n > longestSessionIdPhpMakes) {
      longCookie = true;
      add("cookie", `PHPSESSID value is ${n} characters (abnormal)`, 0);
    }
  }

  const lower = body.toLowerCase();
  const gen = generator(body);
  const genLower = gen.toLowerCase();
  if (gen !== "") add("generator", gen, 0);
  for (const rule of cmsRules) {
    for (const g of rule.gens ?? []) {
      if (genLower !== "" && genLower.startsWith(g)) addCms(rule, "generator meta");
    }
    for (const m of rule.markers ?? []) {
      if (lower.includes(m)) addCms(rule, "body contains " + m);
    }
    for (const c of rule.cookies ?? []) {
      if (cookies.has(c)) addCms(rule, "cookie " + c);
    }
  }
  for (const link of body.matchAll(rePhpLink)) {
    if (!sameSite(link[1], page)) continue;
    add("php-link", link[0].trim(), signalWeight.sameSitePhpLink);
    break;
  }

  const verdict: Verdict = score >= 5 ? "likely" : score >= 2 ? "possible" : score < 0 ? "unlikely" : "none";
  return {
    verdict,
    score,
    signals,
    ...(cms.length > 0 && { cms }),
    ...(version !== "" && { php_version: version, version_status: versionStatusOf(version) }),
    ...(longCookie && { long_session_cookie: true }),
  };
}

function sameSite(href: string, page: URL): boolean {
  let url: URL;
  try {
    url = new URL(href, page);
  } catch {
    return false;
  }
  const a = url.hostname.replace(/^www\./, "");
  const b = page.hostname.replace(/^www\./, "");
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

function values(h: Headers, name: string): string[] {
  const v = h.get(name);
  return v === null ? [] : v.split(", ");
}

function generator(body: string): string {
  const gts: number[] = [];
  for (let i = body.indexOf(">"); i >= 0; i = body.indexOf(">", i + 1)) gts.push(i);
  const contents = [...body.matchAll(reContentWord)].map((m) => m.index);
  const names = [...body.matchAll(reGenName)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  const nameStarts = names.map((n) => n.start);
  const nextGt = (i: number) => gts[firstAtOrAfter(gts, i)] ?? body.length;
  const contentAt = (i: number) => {
    reContent.lastIndex = i;
    const m = reContent.exec(body);
    return m ? { value: m[1], end: reContent.lastIndex } : undefined;
  };

  const tags: { start: number; end: number }[] = [];
  for (const m of body.matchAll(reMeta)) {
    const start = m.index + m[0].length;
    if (tags.length > 0 && start <= tags[tags.length - 1].end) continue;
    tags.push({ start, end: nextGt(start) });
  }
  for (const t of tags) {
    const n = names[firstAtOrAfter(nameStarts, t.start)];
    if (!n || n.start >= t.end) continue;
    for (let i = firstAtOrAfter(contents, t.end) - 1; i >= 0 && contents[i] >= n.end; i--) {
      const c = contentAt(contents[i]);
      if (c) return c.value.trim();
    }
  }
  for (const t of tags) {
    for (let i = firstAtOrAfter(contents, t.end) - 1; i >= 0 && contents[i] >= t.start; i--) {
      const c = contentAt(contents[i]);
      if (!c) continue;
      const n = names[firstAtOrAfter(nameStarts, c.end)];
      if (n && n.start < nextGt(c.end)) return c.value.trim();
    }
  }
  return "";
}

function firstAtOrAfter(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function versionStatusOf(v: string): VersionStatus {
  const parts = v.split(".");
  if (parts.length < 2) return "unknown";
  const fixed = fixedVersions[`${parts[0]}.${parts[1]}`];
  if (fixed === undefined) {
    if (!/^[+-]?\d+$/.test(parts[0]) || !/^[+-]?\d+$/.test(parts[1])) return "unknown";
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    return major > 8 || (major === 8 && minor > 5) ? "fixed_or_later" : "no_official_fix";
  }
  if (parts.length < 3) return "unknown";
  return compare(v, fixed) >= 0 ? "fixed_or_later" : "below_fixed_release";
}

export function fixedFor(v: string): string {
  const parts = v.split(".");
  return (parts.length >= 2 && fixedVersions[`${parts[0]}.${parts[1]}`]) || "?";
}

function compare(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < 3; i++) {
    const x = atoi(pa[i]);
    const y = atoi(pb[i]);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function atoi(s: string | undefined): number {
  return s !== undefined && /^[+-]?\d+$/.test(s) ? Number(s) : 0;
}
