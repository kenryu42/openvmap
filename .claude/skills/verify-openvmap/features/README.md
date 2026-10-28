# OpenVMap verification map

This directory is the maintained source for verifying what OpenVMap users see and do. Read this index, then follow the matching feature file as the recipe. Launch, doctor, evidence and cleanup are in [../SKILL.md](../SKILL.md).

## Baseline preconditions

- An instance started by this run with `scripts/openvmap launch`, and `scripts/openvmap doctor "$RUN"` all `ok` with no `WARN` about HEAD.
- `URL` and `AGENT_BROWSER_SESSION="openvmap-$(basename "$RUN")"` exported as SKILL.md shows.
- Internet access: DoH from the browser and the Worker's request to the checked site are real.
- Fewer than 10 `/api/php` calls in the last minute on this instance.
- Check only `example.com`, `lolipop.jp`, other domains in `test/known_domains.yaml`, or one the user gave for this purpose.

## Driving conventions

- Start each recipe from `agent-browser open "$URL/"` (or the page it names) so earlier state does not leak in.
- Find elements by label, role and accessible name (`find label`, `find role … --name`, `wait --text`), never by `@e` refs saved from an earlier snapshot or by coordinates.
- Shell calls to `/api/php` go through `scripts/openvmap api` or `api-raw`, never a hand-built URL.
- After any navigation, redo the clipboard recorder before clicking `Copy JSON`.

## Proof and skip reporting

- UI proof: a screenshot before the action, a full-page screenshot and `snapshot` after, saved under `$RUN/evidence/<feature-id>/`.
- Data proof: the `Copy JSON` payload and the `jq` assertion run on it.
- Side-effect proof: `network requests --filter api/php` showing the request and its status.
- Record the domain and entry point with each artifact. An entry point you could not reach is reported with the command and the unmet precondition, never as verified through another path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the user-visible behavior, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with agent-browser`, `Gotchas`. Keep implementation detail out except where a trap needs it.

## Features

- [Check a domain](./check-domain.md): the form and shared `/check#` links, the report, the PHP and certificate checks, `Copy JSON`, invalid and empty input.
- [PHP check API](./php-api.md): `POST /api/php` guards, answer shape, cache and rate limit.
- [Provider status pages](./providers.md): the provider list and each provider's detail page.
- [Language switch](./language.md): English and Japanese versions of every page, keeping the checked domain.
- [Guide and About](./guide-about.md): the current incident's guide (php2shell) and the About page with its privacy and terms anchors.
