# Provider status pages

The provider list shows every tracked hosting, DNS, CDN and mail provider with its status on the current incident (php2shell) and a link to its notice. Each provider has its own page with the status, summary, customer action, source, verified date and how the tool recognises it.

## Sub-features

- `providers-list` shows heading `Provider security status`, one link per provider, and a source link per provider named `<Name> link` (`<名前> リンク`) though it shows only `link`.
- `providers-detail` shows heading `<Name>: security status`, a status (`patched`, …), confidence (`official notice` / secondary), date, `Summary`, `Customer action:`, `Source:` link and `Verified:` date.
- `providers-identifiers` lists what the tool matches on (ASNs, AS names, host patterns) under `How this tool recognises the provider`.
- `providers-from-report` links from a report's provider chip to that provider.

## How to get to it (user POV)

- Nav link `Provider status` (`事業者の対応状況`) on every page.
- `See provider status` on the home page.
- `/providers/<id>` directly, e.g. `/providers/xserver`, `/providers/lolipop`.
- `Provider status` link at the top of a detail page goes back to the list.

## Driving it with agent-browser

Preconditions:

- Baseline from the README. No `/api/php` calls are made.

- **List from nav.** `agent-browser open "$URL/"`, `agent-browser find role link click --name "Provider status"`. `get url` is `$URL/providers`; snapshot has heading `Provider security status` and links `Xserver`, `SAKURA internet`, `Lolipop (GMO Pepabo)`, and source links `Xserver link` and `SAKURA internet link`; no link is named just `link`.
- **Detail.** `agent-browser find role link click --name "Xserver" --exact`. `get url` is `$URL/providers/xserver`; heading `Xserver: security status`, text `patched`, `official notice`, `Summary`, `Customer action:`, a source link starting `https://www.xserver.ne.jp/`, and `AS131965` under `How this tool recognises the provider`.
- **Back.** `agent-browser find role link click --name "Provider status"` returns to `$URL/providers`.
- **Unknown id.** `agent-browser open "$URL/providers/no-such-provider"` shows the not-found page (HTTP 404 from `curl -s -o /dev/null -w '%{http_code}' "$URL/providers/no-such-provider"`).
- **Proof.** Snapshot and screenshot of list and detail under `$RUN/evidence/providers/`.

## Gotchas

- Statuses and dates come from `data/providers.yaml`, which the daily vendor workflow edits; assert structure and one known provider, not a full list or exact counts.
- A source link's accessible name starts with the provider's name, so `find role link --name "Xserver"` can match both the provider and its source link; use `--exact` or `--name "Xserver link"` for the source.
- The detail page's `Provider status` link and the nav item have the same name; both go to the list.
