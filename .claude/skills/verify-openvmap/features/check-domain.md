# Check a domain

A user enters a domain and gets one report page: which companies run its web, DNS, mail and certificate, whether the front page looks like PHP, each provider's status on the current incident (php2shell) and its own incidents, what to do next, a message template, and the whole report as JSON.

## Sub-features

- `check-form` submits the home page form and lands on `/check#<domain>`, lowercased (`Example.COM` becomes `example.com`).
- `check-link` opens a shared `/check#<domain>` URL directly and runs the same check.
- `check-report` shows the domain heading, the `What this check covers` checklist, the providers table, the PHP section, actions and the message template.
- `check-php` shows the PHP verdict from the Worker (`likely PHP`, `no signals`, …) after the DNS part renders.
- `check-tls` names the certificate issuer in the eMudhra row, or says it could not be read.
- `check-json` copies the report as JSON with `Copy JSON`, button text changes to `Copied`.
- `check-invalid` shows `"<input>" is not a domain name. Enter it as example.com.` with a new form.
- `check-empty` shows `No domain was given to check.` for `/check` with no fragment.
- `check-limited` shows `Too many checks in a short time, so the PHP check is paused for you. Try again in about a minute.` when the Worker answers 429.

## How to get to it (user POV)

- Home page `/` (or `/ja`): type into the `Domain` box and choose `Check` (`調べる` in Japanese), or press Enter.
- The form under an invalid or empty result.
- A link someone shares: `/check#<domain>` or `/ja/check#<domain>`.
- Editing the fragment on an open report (the page re-checks on `hashchange`).

## Driving it with agent-browser

Preconditions:

- Baseline from the README; `agent-browser network requests --clear` run before each check.

- **Form, Cloudflare site.** `agent-browser open "$URL/"`, `agent-browser find label "Domain" fill "Example.COM"`, screenshot, `agent-browser find role button click --name "Check"`, `agent-browser wait --text "Copy JSON" --timeout 45000`. `get url` is `$URL/check#example.com`; the snapshot has heading `example.com`, button `php2shell (CVE-2026-109618 / CVE-2026-109619) no signals`, and the eMudhra row says `Not fully checked: the certificate could not be read`.
- **Form, non-Cloudflare site (certificate path).** Same with `lolipop.jp`. Snapshot has `php2shell (CVE-2026-109618 / CVE-2026-109619) likely PHP`, button `Lolipop (GMO Pepabo) DNS Web patched`, and `Not found on this site (certificate issued by GlobalSign nv-sa)`.
- **PHP check really ran.** `agent-browser get text main | grep -E "Too many checks|could not be run"` prints nothing, and `network requests --filter api/php` shows one `POST $URL/api/php (Fetch) 200`.
- **JSON.** Install the clipboard recorder (SKILL.md), click `Copy JSON`, `wait --text "Copied"`, save `report.json`. For `lolipop.jp`: `jq -e '.domain=="lolipop.jp" and .tool=="OpenVMap" and .php.verdict=="likely" and (.tls.chain[0].issuer_cn|length>0) and .tls.error==null'`. For `example.com`: `.php.verdict=="none"` and `.tls.error` contains `Cloudflare`.
- **Shared link.** `agent-browser open "$URL/check#lolipop.jp"`, `wait --text "Copy JSON" --timeout 45000`; same heading and checklist as the form run.
- **Invalid input.** `agent-browser open "$URL/check#not_a domain"`. `get text main` starts with `"not_a domain" is not a domain name. Enter it as example.com.` and a `Domain` textbox and `Check` button follow. No `/api/php` request is made.
- **Empty.** `agent-browser open "$URL/check"`. `get text main` contains `No domain was given to check.`
- **Rate limit.** Make 10 `scripts/openvmap api "$RUN" '{"domain":"example.com"}'` calls, then open `$URL/check#example.com`. The PHP section shows the `Too many checks…` text and `Copy JSON` still appears. Wait 60 s before the next recipe.
- **Proof.** `snapshot > report.aria.txt`, a page-tall `report.png` (SKILL.md, Evidence), `report.json`, `network.txt` under `$RUN/evidence/check-domain/`.

## Gotchas

- `Copy JSON` appears when the PHP check _settles_, including when it was rate-limited or failed. Waiting for it is not proof the Worker check ran; grep for the limited/unavailable text.
- `example.com` is behind Cloudflare: the Worker cannot open a TLS socket there, so it never proves the certificate reader. Use `lolipop.jp` for anything touching TLS, safety or the CA checklist.
- `screenshot --full` shows the providers table, PHP section, actions and template as blank space: they reveal only inside the viewport. Use the page-tall viewport from SKILL.md.
- `clipboard read` is denied in headless Chrome; use the `writeText` recorder, and redo it after each navigation.
- A domain with no A/AAAA records (e.g. `nonexistent-vmap-probe.invalid`) never calls `/api/php`; the report shows the no-hosts callout.
- The Worker caches each domain's PHP and certificate result for an hour in this instance's state, so a repeat check shows the earlier front-page result. Relaunch for a cold check.
- The checked-at time is shown in JST regardless of the machine's zone.
