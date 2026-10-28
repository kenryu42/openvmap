---
name: verify-openvmap
description: Launch OpenVMap (the provider and security-incident checker in this repo) as the real built site plus its Cloudflare Worker, drive it in a headless browser with agent-browser, and capture proof. Use when you need to show that a change to the check page, the report, the provider pages, the en/ja switch or the /api/php Worker actually works for a user, not only in vitest.
---

# Verify OpenVMap

OpenVMap is a static Next.js export (`out/`) served by a Cloudflare Worker (`worker/index.ts`) that also answers `POST /api/php`. A user types a domain on `/` (or `/ja`), lands on `/check#<domain>`, and the page then:

1. resolves DNS and Team Cymru ASNs **from the browser** over Cloudflare DoH (`cloudflare-dns.com`),
2. calls `POST /api/php` on the same origin, where the Worker GETs the site's front page once and opens one TLS 1.2 connection to read the certificate issuer,
3. renders the report (checklist, providers, PHP verdict, actions, message template) and a `Copy JSON` button.

So the surface to verify is the **browser UI**, with `/api/php` as a secondary HTTP surface. The harness is `agent-browser` (headless Chrome, `/opt/homebrew/bin/agent-browser`) plus the helper `scripts/openvmap` in this skill.

A run needs the internet: DoH from the browser and the Worker's GET/TLS to the checked site are real network calls. No mocks exist on the user path; none are needed.

## Which domains to check

Only domains the project already names for live checks (`test/known_domains.yaml`) or that the user explicitly gives you. Never invent one, and never check a domain from a user's message unless they asked you to verify with it. The two baselines:

| Domain        | Why                                                | Expect                                                                                                                                                                                        |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `example.com` | IANA-reserved, Cloudflare-proxied                  | PHP `no signals`; eMudhra row `Not fully checked: the certificate could not be read`; JSON `tls.error` says `behind Cloudflare's proxy`                                                       |
| `lolipop.jp`  | Not on Cloudflare; a hosting provider in the table | PHP `likely PHP`; provider `Lolipop (GMO Pepabo)` `patched`; eMudhra row `Not found on this site (certificate issued by GlobalSign nv-sa)`; JSON `tls.chain[0].issuer_cn` set, no `tls.error` |

`example.com` **never exercises the certificate reader** (Workers cannot open sockets to Cloudflare addresses). Any change to `lib/tls.ts`, `worker/certs.ts`, `worker/pinned.ts`, `lib/safety.ts` or the CA/eMudhra checklist must be proven on `lolipop.jp` (or another non-Cloudflare domain from the list). `lolipop.jp` also proves the bundled Mozilla roots: its chain ends at GlobalSign Root R46, which the macOS system store lacks.

## Launch

From the repo root:

```sh
S=.claude/skills/verify-openvmap/scripts/openvmap
$S launch            # next build, then wrangler dev on a free port; ~5-60 s
$S launch --no-build # reuse the current out/ (only when you just built HEAD)
```

It prints the doctor result and ends with `RUN_DIR=<dir>`. Ready means that line was printed: the doctor passed, so the page is served and the Worker answers `/api/php`. Capture it:

```sh
RUN=<the RUN_DIR it printed>
URL=$(sed -n 's/^url=//p' "$RUN/instance/meta")
export AGENT_BROWSER_SESSION="openvmap-$(basename "$RUN")"
```

What launch does, so you can debug it:

- Refuses to start without `SALT=<anything>` in `.dev.vars` (the Worker answers 500 without it). Never print that file.
- Runs `bun run build`, which writes the repo's `.next/` and `out/`, then copies `out/` to `$RUN/instance/assets` so later builds do not change a running instance.
- Writes Bun's Mozilla roots to `$RUN/instance/roots.pem` and passes them via `SSL_CERT_FILE`, as `scripts/dev.ts` does.
- Starts `wrangler dev` on 127.0.0.1 with its own free `--port` and `--inspector-port`, `--persist-to $RUN/instance/state` (Cache API and rate-limiter state), in its own process group. Logs: `$RUN/instance/wrangler.log`, `$RUN/instance/build.log`.

Do not use `bun run dev` for verification: it uses fixed ports 3000/8787 that the user's own dev server likely holds. `bun run preview` also uses the fixed 8787 and the shared `.wrangler/state`.

Each instance allows 10 `/api/php` calls a minute (the Worker's `LIMITER`; locally every caller is the same client). Browser checks, language switches and `$S api` all count. Plan a run within that, or wait a minute.

Isolation: any number of runs can coexist (own port, state, assets, browser session). Two `launch` calls building at the same moment both write `.next/`/`out/`; start launches one after another.

## Doctor

```sh
$S doctor "$RUN"
```

Read-only. Checks the process group is alive, the port is owned by it, `GET /` serves the OpenVMap page, `/api/php` refuses a foreign Origin with `{"error":"origin"}` (proves the Worker runs, not just static files), and that the build is from the current `HEAD` (`WARN` if HEAD moved or the tree was dirty at build time; relaunch to verify new code). Run it first whenever anything looks off. Never drive a server you did not launch; `$S list` shows this skill's runs.

## Drive

Each run uses its own browser via `AGENT_BROWSER_SESSION` (exported above). Prefer accessible names; the ones below are real (English UI; Japanese in `features/language.md`).

```sh
agent-browser open "$URL/"
agent-browser find label "Domain" fill "lolipop.jp"
agent-browser find role button click --name "Check"
agent-browser wait --text "Copy JSON" --timeout 45000   # appears once the PHP check settled: done, limited or unavailable
agent-browser get text main | grep -E "Too many checks|could not be run" && echo "PHP check did not run"  # must print nothing
agent-browser get url                                    # $URL/check#lolipop.jp
agent-browser snapshot                                   # ARIA tree with the checklist and provider table
```

`Copy JSON` is the user's way to get the full report. Headless Chrome refuses `clipboard read` (even after `Browser.grantPermissions`), so record what the button hands to the clipboard, then click it:

```sh
agent-browser eval 'const write = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (text) => { window.__openvmapCopied = text; return write(text); }; "recording"'
agent-browser find role button click --name "Copy JSON"
agent-browser wait --text "Copied"
agent-browser eval 'window.__openvmapCopied' --json | jq -r '.data.result' > "$RUN/evidence/<feature>/report.json"
```

The patch lives only in the current document; redo it after any navigation or reload.

`/api/php` from the shell (the safety hook blocks inline `curl --data` to a variable URL, and the helper only ever targets this run's localhost URL):

```sh
$S api "$RUN" '{"domain":"lolipop.jp"}'      # as the site's own page sends it; prints body, then "HTTP 200"
$S api-raw "$RUN" -X GET                     # only your curl args, for the guards: {"error":"method"} HTTP 405
```

## Evidence

Put every artifact under `$RUN/evidence/<feature-id>/`. It sits outside the repo (`${TMPDIR}/openvmap-verify/<run-id>/evidence/` by default, override with `OPENVMAP_VERIFY_ROOT`) and survives `stop`. Never commit it: it contains checked domains, and this project stores none.

A proof contains:

- the user action and the resulting state: a screenshot before submitting (`agent-browser screenshot <path>`) and a whole-page one after, plus `agent-browser snapshot > report.aria.txt`. Report sections below the fold fade in on a scroll-driven `view()` timeline and stay invisible in `screenshot --full`, even with reduced motion. Make the viewport as tall as the page instead:

  ```sh
  H=$(agent-browser eval 'document.documentElement.scrollHeight' --json | jq -r .data.result)
  agent-browser set viewport 1280 "$H"
  agent-browser screenshot "$RUN/evidence/<feature>/report.png"
  agent-browser set viewport 1280 720
  ```

- the report JSON captured from `Copy JSON`, with the assertion you made on it (for example `jq '.tls.chain[0].issuer_cn'`);
- the side effect: `agent-browser network requests --clear` before the action and `agent-browser network requests --filter api/php > network.txt` after, showing the one `POST /api/php` and its status; for cache behaviour, `$S api` twice and the second `age_s` > 0;
- the build identity: the `$S doctor "$RUN"` output saved as `doctor.txt`.

Exercise the real path: type in the form or open the `/check#<domain>` URL a user would share. Do not call `runCheck` or React state from `eval`; the clipboard recorder above observes output and changes nothing the page does.

## Cleanup

```sh
agent-browser close                 # closes only this run's browser session
$S stop "$RUN"                      # kills this run's process group, checks the port is free, deletes $RUN/instance
ls "$RUN/evidence"                  # the proof is still there
```

`stop` kills by the recorded process group, never by name, so the user's own `bun run dev` or other runs survive. Run cleanup after failed attempts too. Old evidence dirs are yours to delete once reported.

## Features

The maintained map is in [features/README.md](features/README.md). A proof covers every entry point the feature file lists, not just the convenient one.
