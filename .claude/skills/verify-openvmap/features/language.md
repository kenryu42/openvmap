# Language switch

Every page exists in English (no prefix) and Japanese (`/ja`). The header link `日本語` / `English` switches to the same page in the other language, and on a report it keeps the checked domain and re-renders the report in that language.

## Sub-features

- `lang-page` switches any page to its counterpart (`/providers` ↔ `/ja/providers`, `/guide/php2shell` ↔ `/ja/guide/php2shell`).
- `lang-report` switches `/check#<domain>` ↔ `/ja/check#<domain>` and shows the report in the new language.
- `lang-ui` translates nav and controls: `Check`/`チェック`, `Provider status`/`事業者の対応状況`, `Guide`/`対応ガイド`, `About`/`このツールについて`, `Domain`/`ドメイン`, `Check` button/`調べる`, `Copy JSON`/`JSON をコピー`, `Copied`/`コピーしました`.

## How to get to it (user POV)

- Header link `日本語` on English pages, `English` on Japanese pages.
- Opening a `/ja/...` URL directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the README. A report switch costs one more `/api/php` call (served from cache).

- **Report to Japanese.** Check `example.com` as in check-domain, then `agent-browser find role link click --name "日本語"` and `agent-browser wait --text "JSON をコピー" --timeout 45000`. `get url` is `$URL/ja/check#example.com`; snapshot has heading `example.com`, heading `確認した項目`, button `php2shell（CVE-2026-109618 / CVE-2026-109619） 痕跡なし`.
- **Back to English.** `agent-browser find role link click --name "English"`, `wait --text "Copy JSON" --timeout 45000`; `get url` is `$URL/check#example.com`.
- **Japanese form.** `agent-browser open "$URL/ja"`, `agent-browser find label "ドメイン" fill "lolipop.jp"`, `agent-browser find role button click --name "調べる"`; `get url` is `$URL/ja/check#lolipop.jp`.
- **Static page.** `agent-browser open "$URL/providers"`, click `日本語`; `get url` is `$URL/ja/providers`.
- **Proof.** Snapshot and screenshot in each language under `$RUN/evidence/language/`.

## Gotchas

- The switch is a full page load, so the report is recomputed: DoH again and one `/api/php` call against the rate limit. Install the clipboard recorder again before `Copy JSON`.
- The Japanese PHP and status words differ from the English ones (`痕跡なし` for `no signals`); assert on Japanese strings from `lib/messages/ja.ts`, not translations you guess.
