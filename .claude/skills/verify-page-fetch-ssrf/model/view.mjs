export const title = "One /api/php check: page requests and certificate probes";

const reachedPrivate = (v) => v.pageRequestsDelivered.some((d) => d.address === "private") || v.certProbesConnected.includes("private");

export const state = (v) => {
  if (reachedPrivate(v)) return "A request reached a private address";
  switch (v.phase) {
    case "request":
      return "Next URL to request";
    case "send":
      return v.checked.some((a) => a !== "cloudflare") ? "Addresses checked, one is off Cloudflare" : "Addresses checked, all on Cloudflare's proxy";
    case "answer":
      return "Page request delivered";
    case "cert probe":
      return "Reading the certificate";
    default:
      return "Check finished";
  }
};

export const group = (v) => (reachedPrivate(v) ? "broken" : "ok");
export const colors = { broken: "orange", ok: "teal" };

const labels = {
  RequestBudgetSpent: "8 requests used",
  PortRefused: "the URL's port is refused",
  PublicAddressesRefuse: "DNS gives no address or a private one",
  PublicAddressesAccept: "DNS gives only public addresses",
  SocketToCheckedAddress: "http GET on a socket to the checked address",
  SocketByName: "https on a socket opened by name",
  FetchThroughEdge: "https fetch() through the edge, which looks the name up again",
  PlainHttpCannotBePinned: "plain http to a Cloudflare-only host is refused",
  SiteFailsOrAnswers4xx: "the site fails or answers 4xx",
  SiteAnswersPage: "the site answers the page",
  SiteRedirects: "the site redirects",
  RedirectRefused: "the redirect is refused",
  CertProbeRefused: "the certificate host is refused",
  CertProbeConnects: "the probe connects to a checked address",
  Done: null,
};

export const step = (action) => labels[action] ?? null;
