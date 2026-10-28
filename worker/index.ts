import { defaultUserAgent } from "../lib/check";
import { dohResolver } from "../lib/doh";
import { version } from "../lib/meta";
import { safeTransport } from "../lib/safety";
import { socketCerts } from "./certs";
import { socketRequest } from "./pinned";
import { loadProviders } from "../lib/provider";
import { handlePhp } from "./php";
import { citedUrls, handleSource } from "./source";
import providersYaml from "../data/providers.yaml";

const cited = citedUrls(loadProviders(providersYaml));

interface Env {
  ASSETS: Fetcher;
  LIMITER: RateLimit;
  SALT: string;
  SOURCE_TOKEN?: string;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/source")
      return handleSource(request, { token: env.SOURCE_TOKEN ?? "", allowed: cited, fetch: (input, init) => fetch(input, init) });
    if (url.pathname !== "/api/php") return env.ASSETS.fetch(request);
    if (!env.SALT) return new Response("SALT is not set", { status: 500 });
    const resolver = dohResolver();
    return handlePhp(request, {
      transport: safeTransport({ resolver, pinned: socketRequest }),
      certs: socketCerts({ resolver }),
      userAgent: defaultUserAgent(version, new URL("/about", url).href),
      salt: env.SALT,
      limiter: env.LIMITER,
      cache: caches.default,
    });
  },
} satisfies ExportedHandler<Env>;
