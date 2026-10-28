import type { Resolver } from "@/lib/dns";

const notFound = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));

export function singleSiteResolver(domain: string): Resolver {
  return {
    resolve4: (h) => (h === domain || h === `www.${domain}` ? Promise.resolve(["203.0.114.10"]) : notFound()),
    resolve6: () => notFound(),
    resolveCname: () => notFound(),
    resolveNs: () => notFound(),
    resolveMx: () => notFound(),
    resolvePtr: () => notFound(),
    resolveTxt: (name) =>
      name.startsWith("AS")
        ? Promise.resolve([["64512 | JP | apnic | 2010-01-01 | EXAMPLE-NET - Example Hosting, JP"]])
        : Promise.resolve([["64512 | 203.0.114.0/24 | JP | apnic | 2010-01-01"]]),
  };
}
