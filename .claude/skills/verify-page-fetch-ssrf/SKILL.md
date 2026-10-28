---
name: verify-page-fetch-ssrf
description: Model-check (TLA+/TLC) that the /api/php Worker's page fetch never delivers a request to a private address, however the checked site's DNS answers change between lookups and wherever it redirects. Use before committing any change to lib/check.ts checkPage/fetchPage, lib/safety.ts (safeTransport, publicAddresses, isPublicAddress, isCloudflareAddress), worker/pinned.ts, worker/certs.ts, lib/dns.ts webHosts, or worker/index.ts's wiring of them, and whenever someone asks whether a change to the page request, redirects, the Cloudflare-proxy path or the certificate probe is still SSRF-safe.
---

# Verify the page fetch against SSRF

**The property.** During one `/api/php` check, every page request the Worker sends and every certificate probe it opens reaches a public address, and the check sends at most 8 page requests.

**The harm if it breaks.** Anyone can submit any domain on `/check`. A site owner who controls DNS and redirects could make OpenVMap's Worker send GET requests into private networks (127.0.0.1, 10/8, 169.254.169.254 and the rest of `isPublicAddress`'s table) or hammer a site with requests.

The check is a TLA+ model of one `checkPage` run (`model/PageFetch.tla`), checked with TLC over every order of steps. The adversary is the checked site's owner, who picks each DNS answer and each server response. Every lookup can answer differently from the one before (DNS rebinding, TTL 0), and every redirect can go to any http(s) URL, including IP literals and other ports.

## Run

From the repo root:

```sh
.claude/skills/verify-page-fetch-ssrf/scripts/check
```

It needs Java 11 or later (`java` on PATH). On first run it downloads TLC `tla2tools.jar` v1.7.4 from the tlaplus GitHub release into `~/.cache/openvmap-tla/v1.7.4/` and checks its SHA-256. It runs TLC once on `model/PageFetch.cfg`, takes about 2 s and explores about 230,000 distinct states.

Exit 0 and this output mean every rule holds:

```
PASS TypeOK, NoPageRequestReachesPrivateAddress, NoCertProbeReachesPrivateAddress, PageRequestsWithinBudget, no deadlock
... 230208 distinct states found ...
```

Exit 1 prints `FAIL`, the broken rule, and TLC's shortest path to it, with the `url`, `checked` and `pageRequestsDelivered` values at each step. Exit 3 means Java or the TLC download is missing.

## Read every result with /statechart

Read each result, pass or fail, with the pstack `/statechart` skill. Give it `model/PageFetch.tla` with `model/PageFetch.cfg`, the view module `model/view.mjs`, and a scratch output folder outside the repo. At the sync commit it lists every rule under "Rules that hold". A broken rule comes with its shortest path in plain words. After a first break it stops each run at a state bound and may list other rules as "not checked"; for those, trust `scripts/check` on a copy of the config without the broken rule.

The model has more than 500 states, so `/statechart` draws only bug paths, and none on a clean run. If you need the whole chart, shrink `Urls` or the limits in a scratch copy, never in the repo.

## Does my change touch this?

The change touches this check if it edits any row of the coverage table below, adds a new way for the Worker to open a connection or call `fetch()` during a check, or changes what `parseDomain` lets through as a domain. Pure formatting, renames that keep behaviour, and changes to the report, the PHP verdict (`lib/phpsig.ts`), `lib/http1.ts` parsing, the rate limiter or the cache do not.

If the change touches it, update the model first so it describes the new code, then run the check. Never edit the model to make a result go away.

## Model to code

Each action in `PageFetch.tla` is one step in the code. Nothing else runs inside one check between these steps, because `fetchPage` awaits each request before the next.

| Model                                                   | Code (at the sync commit)                                                           | What the model keeps                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Addresses`, `IsPublicAddress`, `IsCloudflareAddress`   | `lib/safety.ts:39` `isPublicAddress`, `:82` `isCloudflareAddress`                   | Three kinds of address: public, private (any address `isPublicAddress` refuses), Cloudflare (public and in the Cloudflare table). The tables themselves are not checked here.     |
| `WebHosts`, `Candidates`                                | `lib/dns.ts:70` `webHosts`; `lib/check.ts:191`                                      | https apex, https www, http apex, http www, in that order. A `www.` domain has one host, a subset of this.                                                                        |
| `RequestBudgetSpent`                                    | `lib/check.ts:212`                                                                  | Stops all candidates at 8 requests.                                                                                                                                               |
| `requests' = requests + 1` in the three request actions | `lib/check.ts:216`                                                                  | Counted before the transport runs, so a refused URL counts.                                                                                                                       |
| `PortRefused`                                           | `lib/safety.ts:118-121`                                                             | Port other than 80/443, and also stands for credentials in the URL.                                                                                                               |
| `PublicAddressesRefuse` / `PublicAddressesAccept`       | `lib/safety.ts:127` calling `publicAddresses` (`:157-166`)                          | One lookup (A and AAAA together) gives any set of addresses. IP literals answer themselves. Accepted only when non-empty and every address is public.                             |
| `Direct`                                                | `lib/safety.ts:128`                                                                 | Checked addresses outside Cloudflare.                                                                                                                                             |
| `SocketToCheckedAddress`                                | `lib/safety.ts:131-134` then `worker/pinned.ts:13-14` with `secureTransport: "off"` | Plain http connects to one checked direct address. No second lookup.                                                                                                              |
| `SocketByName`                                          | same, https branch of `worker/pinned.ts:14`                                         | Connects by name, so the platform looks the name up again (any address). TLS completes only where a server holds a certificate for the name.                                      |
| `PlainHttpCannotBePinned`                               | `lib/safety.ts:129-130`                                                             | Every checked address is Cloudflare's and the URL is plain http: refused before any request, since neither a socket nor `fetch()` can be pinned there.                            |
| `FetchThroughEdge`                                      | `lib/safety.ts:142` `get(url.href, ...)`                                            | Every checked address is Cloudflare's and the URL is https. `fetch()` looks the name up again; as `SocketByName`, TLS completes only where a server holds the name's certificate. |
| `SiteRedirects`, `RedirectRefused`                      | `lib/check.ts:229-247`                                                              | Up to 5 redirects per candidate to any URL in `Urls`. Refused: over the limit, a bad `Location`, a non-http(s) scheme.                                                            |
| `SiteFailsOrAnswers4xx`, `SiteAnswersPage`              | `lib/check.ts:220-223`, `:255-266`                                                  | Transport error or 4xx goes to the next candidate. 2xx or a 3xx without `Location` ends the page fetch.                                                                           |
| `CertProbeRefused`, `CertProbeConnects`                 | `lib/check.ts:179-186`; `worker/certs.ts:11-17`                                     | Up to two hosts. Each looks up with `publicAddresses`, then connects by address to a checked direct address.                                                                      |
| `pageRequestsDelivered`, `certProbesConnected`          | (history only)                                                                      | Where each request or probe landed, and by which route.                                                                                                                           |

Wiring: `worker/index.ts` builds `safeTransport({ resolver, pinned: socketRequest })` and `socketCerts({ resolver })`. If either changes (no `pinned`, a different resolver, another transport), the model's routing no longer describes the Worker.

## Rules

- `NoPageRequestReachesPrivateAddress`: no page request is delivered to a private address.
- `NoCertProbeReachesPrivateAddress`: no certificate probe connects to a private address.
- `PageRequestsWithinBudget`: at most 8 page requests per check.
- `TypeOK`, and no deadlock (`Done` is the only step from the end state).

## Findings

**F1 (fixed): rebinding a Cloudflare-only name delivered a plain-http GET to a private address.** Found at `dde6f38`, fixed by the commit `fix(safety): refuse plain http to hosts only on Cloudflare's proxy`. Before the fix, in the code's terms:

1. A visitor checks `rebind.example`. Every address its DNS returns is in Cloudflare's ranges (for example `104.16.0.1`).
2. `safeTransport` accepted it. `direct` was empty, so it skipped `pinned` and called `fetch("http://rebind.example/")`.
3. `fetch()` looks the name up again. This time the name answers `127.0.0.1` (or `10.0.0.5`, `169.254.169.254`).
4. The GET reached that address. Only then did the missing `CF-RAY` header make `safeTransport` drop the answer.

Commit `7e185ab` measured `fetch()` in `wrangler dev` reaching `127.0.0.1` this way (27 of 30 requests). Whether Cloudflare's production edge refuses private destinations was never tested. The fix refuses plain http to a host whose addresses are all Cloudflare's before sending anything, so it no longer depends on that. A replay against the real code (resolver answering `104.16.0.1`, a `fetch` stand-in that looks the name up again as `127.0.0.1` and sends to a local `node:http` server) delivered two GETs before the fix and none after. `test/safety.test.ts` "sends no plain-http request to a host entirely on Cloudflare" keeps it fixed.

If a change makes `NoPageRequestReachesPrivateAddress` break by the old path, ending in `FetchThroughEdge` with `scheme |-> "http"`, F1 is back.

## Is it a real bug or a modeling error?

When TLC reports a broken rule, replay its shortest path against the real code before you believe it, one model action per code step. Use `checkPage` and `safeTransport` with a fake resolver that returns the path's DNS answers in order, a `fetch` and `pinned` that record what they are given, and a local `node:http` server standing in for the private address. Follow the patterns in `test/safety.test.ts`. If the real code does not do what the path says, the model is wrong: find the action that does not match its row in the table above and fix it from the code. If it does, it is a bug. Report it with the path in the code's words, as F1 is written. Do not weaken a rule or the model, and do not change product code unless the user asks.

## Updating the model for an intended change

Edit the actions that the change touches so that each again matches one step in the code, and update their rows in the table. Write the update from the code, before you run it. Change a rule only when the promise changed on purpose, and say why in the commit body. Keep the limits (`RedirectsPerCandidate`, `RequestsPerCheck`) equal to `defaultLimits` in `lib/check.ts`.

## Shown to fail

Each holding rule was seen to break on a model edit that mirrors a code break:

| Code break                                                                             | Model edit                                            | Rule that broke                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| Drop `if (requests >= limits.requestsPerCheck)` in `lib/check.ts`                      | Remove `requests < RequestsPerCheck` guards           | `PageRequestsWithinBudget`           |
| `worker/certs.ts` connects to the host name, not the checked `ip`                      | `CertProbeConnects` picks from `ConnectByName`        | `NoCertProbeReachesPrivateAddress`   |
| `publicAddresses` accepts a host when any address is public (drop the `refused` check) | `PublicAddressesAccept` needs only one public address | `NoPageRequestReachesPrivateAddress` |
| `worker/pinned.ts` connects plain http to `url.hostname` (undo `7e185ab`)              | `SocketToCheckedAddress` picks from `ConnectByName`   | `NoPageRequestReachesPrivateAddress` |
| Drop `plainHttpCannotBePinned` in `lib/safety.ts` (F1 back)                            | `FetchThroughEdge` delivers plain http too            | `NoPageRequestReachesPrivateAddress` |

## Not covered

- The address tables. The model trusts that `isPublicAddress` refuses every private range, and that `ipBytes` parses every form a DoH answer or a WHATWG-normalized URL host can take. `test/safety.test.ts` covers examples, not every input.
- Cloudflare's own behaviour: whether production `fetch()` or `connect()` refuse private destinations, and whether `connect()` with `secureTransport: "on"` verifies the certificate against the name. The model assumes it verifies and assumes nothing else.
- Concurrency across visitors, the rate limiter and the cache in `worker/php.ts`, and `/api/source`.
- Timeouts and the 15 s deadline. They only end a check sooner.
- Which certificate host is probed first: both web hosts are the attacker's names, so order does not change what is reachable.
- The browser-side DoH lookups in `app/`, which never leave the visitor's browser.

## Sync

Last confirmed that the model describes the code at the commit `fix(safety): refuse plain http to hosts only on Cloudflare's proxy` (`lib/check.ts`, `lib/safety.ts`, `lib/dns.ts`, `worker/pinned.ts`, `worker/certs.ts`, `worker/index.ts`). It is named by subject so that rebasing the branch onto `main` keeps it findable.

To see whether the model may be stale:

```sh
sync=$(git log -1 --format=%h --fixed-strings --grep="fix(safety): refuse plain http to hosts only on Cloudflare's proxy")
git log --oneline "$sync"..HEAD -- lib/check.ts lib/safety.ts lib/dns.ts worker/pinned.ts worker/certs.ts worker/index.ts
```

Move the sync point forward only after you have read each of those commits, confirmed that the model and the table describe the code at the new commit, and run the check with the expected result. Then replace the subject above with the new commit's hash, and update the line numbers in the table at the same time. For drift across many commits, use the pstack `/maintain-formal-verification-skill` skill.
