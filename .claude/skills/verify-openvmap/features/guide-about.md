# Guide and About

The guide explains php2shell and what a small business should do; the About page says what requests the tool makes, what it stores, which domains to check, and its terms. The footer links `Privacy` and `Terms` jump to sections of About.

## Sub-features

- `guide-page` renders the guide with heading `php2shell: a guide for small businesses`.
- `about-page` renders heading `About this tool` with sections including `The requests it makes`, `What it stores`, `Which domains to check`, `Terms and disclaimer`.
- `about-anchors` footer `Privacy` opens `/about#privacy` (`What it stores`) and `Terms` opens `/about#terms` (`Terms and disclaimer`).

## How to get to it (user POV)

- Nav links `Guide` and `About` on every page.
- Footer links `Privacy` and `Terms` on every page.
- `Read the guide` links where the home page and report offer them.

## Driving it with agent-browser

Preconditions:

- Baseline from the README. No `/api/php` calls are made.

- **Guide.** `agent-browser open "$URL/"`, `agent-browser find role link click --name "Guide"`. `get url` is `$URL/guide/php2shell`; snapshot has heading level 1 `php2shell: a guide for small businesses`, and the nav `Guide` link is the current page.
- **About.** `agent-browser find role link click --name "About"`. `get url` is `$URL/about`; headings `About this tool`, `What it stores`, `Terms and disclaimer`.
- **Privacy anchor.** `agent-browser find role link click --name "Privacy"`. `get url` ends `/about#privacy`; `agent-browser eval 'document.getElementById("privacy").getBoundingClientRect().top < innerHeight'` is `true`.
- **Proof.** Snapshot and screenshot of each page under `$RUN/evidence/guide-about/`.

## Gotchas

- The guide body is rendered from `content/guide/php2shell/en.md` / `content/guide/php2shell/ja.md`; content edits there show up only after a fresh `launch` (it rebuilds).
- The About page's request list is the project's public promise about traffic; when Worker behaviour changes, check this page still matches it.
