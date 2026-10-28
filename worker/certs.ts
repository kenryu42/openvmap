import { connect } from "cloudflare:sockets";
import { untilAborted, type Resolver } from "../lib/dns";
import { isCloudflareAddress, publicAddresses } from "../lib/safety";
import { readChain, type CertProbe } from "../lib/tls";

export function socketCerts(o: { resolver: Resolver; timeoutMs?: number }): CertProbe {
  const timeoutMs = o.timeoutMs ?? 5_000;
  return async (host, signal) => {
    const both = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    const timedOut = `timeout after ${timeoutMs / 1000} s`;
    const addresses = await untilAborted(publicAddresses(host, o.resolver), both, timedOut);
    // Workers cannot open sockets to Cloudflare's addresses; visitors of a
    // proxied site get Cloudflare's certificate there, not the origin's.
    const direct = addresses.filter((a) => !isCloudflareAddress(a));
    if (direct.length === 0) throw new Error("behind Cloudflare's proxy (visitors get Cloudflare's certificate, not the origin's)");
    const ip = direct.find((a) => !a.includes(":")) ?? direct[0];
    const socket = connect({ hostname: ip, port: 443 }, { secureTransport: "off", allowHalfOpen: false });
    const stop = () => void socket.close().catch(() => {});
    both.addEventListener("abort", stop);
    try {
      return await readChain(socket, host);
    } catch (err) {
      if (both.aborted) throw new Error(timedOut);
      throw err;
    } finally {
      both.removeEventListener("abort", stop);
      stop();
    }
  };
}
