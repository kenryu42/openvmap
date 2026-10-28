// The page request on Cloudflare's TCP sockets, which (unlike fetch()) adds no
// CF-Worker header for a site's firewall to refuse. Plain http connects to the
// address safeTransport checked, so DNS is not consulted again and a name that
// answers differently a second time cannot redirect it. https connects to the
// name, whose certificate the handshake checks (see safeTransport).

import { connect } from "cloudflare:sockets";
import { httpGet } from "../lib/http1";
import type { PinnedRequest } from "../lib/safety";

export const socketRequest: PinnedRequest = async (ip, url, headers, signal, maxBody) => {
  const https = url.protocol === "https:";
  const socket = connect(
    { hostname: https ? url.hostname.replace(/^\[|\]$/g, "") : ip, port: Number(url.port || (https ? 443 : 80)) },
    { secureTransport: https ? "on" : "off", allowHalfOpen: false },
  );
  const stop = () => void socket.close().catch(() => {});
  signal.addEventListener("abort", stop);
  try {
    return await httpGet(socket, url, headers, maxBody);
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
};
