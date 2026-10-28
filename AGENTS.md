<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Vendor data

- Leave vendor data updates to the daily `vendor-sources` workflow. Edit the vendor data by hand only for what it leaves in the issue (a held move to `patched`, a failed run). If `data/source-hashes.json` or `data/news-seen.json` conflicts, take `main`'s version and re-run `bun run check-sources --accept <id>` for the provider you handled. If `data/tool-activity.json` conflicts, take `main`'s version; the daily `tool-activity` workflow keeps it current, and `bun run check-tools` refreshes it when you add a tool.

## Comments

- Do not write code comments. Say it in code: a clearer name, a named value, a type.
- A fact that code cannot express goes in the commit message body, with its source.
- Only these directives are allowed: a `#!` hashbang on a file's first line, a bare
  `/** @internal */`, `/// <reference … />`, `// oxlint-disable-next-line <rules> -- <reason>` and
  `// @ts-expect-error <reason>`, with the last two written as `{/* … */}` inside JSX.
- A fact about an external tool that code cannot express stays only when the maintainer adds it to
  the `allow` map in `scripts/comment-lint.json`. Never add entries there or to its `exclude` list
  yourself. Deleting an entry whose comment is gone is fine.
- `bun run lint:comments`, part of `bun run check`, enforces this. To fix a failure, follow
  `.agents/skills/fix-comment-lint/SKILL.md`.
