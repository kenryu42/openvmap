# PHP check API

`POST /api/php` is the only dynamic endpoint. The site's own check page sends `{"domain": "<domain>"}` as JSON; the Worker fetches that site's front page once, reads its certificate issuer, and answers the page result with `age_s`. It refuses anything that is not the site's own page calling it, and limits each client to 10 calls a minute.

## Sub-features

- `api-answer` returns `http`, `php`, `headers`, `tls` and `age_s` for a valid domain.
- `api-cache` serves a repeat within an hour from cache, `age_s` > 0.
- `api-origin` refuses a foreign or missing `Origin` with 403 `{"error":"origin"}`.
- `api-content-type` refuses any media type but `application/json` (case and parameters ignored) with 415 `{"error":"content-type"}`, including two `Content-Type` headers sent together.
- `api-method` refuses non-POST with 405 `{"error":"method"}` and `Allow: POST`.
- `api-invalid` refuses a body that is not a domain with 400 `{"error":"invalid"}`.
- `api-limit` answers 429 `{"error":"limited"}` with `Retry-After: 60` after 10 calls a minute.

## How to get to it (user POV)

- Indirectly, every check from the check page (see check-domain).
- Directly, an HTTP client posting to `/api/php`; only the guards are reachable that way.

## Driving it with scripts/openvmap

Preconditions:

- Baseline from the README. `S=.claude/skills/verify-openvmap/scripts/openvmap`.

- **Answer.** `$S api "$RUN" '{"domain":"lolipop.jp"}'`. Last line `HTTP 200`; body has `"verdict":"likely"`, `"issuer_cn":"GlobalSign GCC R46 DV TLS CA 2025"` and `"age_s":0` on a cold instance.
- **Cache.** Repeat the call. `HTTP 200` and `"age_s"` greater than 0.
- **Foreign origin.** `$S api-raw "$RUN" -X POST -H 'Content-Type: application/json' -H 'Origin: https://elsewhere.invalid' --data '{"domain":"example.com"}'`. `{"error":"origin"}` and `HTTP 403`.
- **Content type.** `$S api-raw "$RUN" -X POST -H "Origin: $URL" -H 'Content-Type: text/plain' --data '{"domain":"example.com"}'`. `{"error":"content-type"}` and `HTTP 415`. The same with both `-H 'Content-Type: application/json' -H 'Content-Type: text/plain'` is also `HTTP 415`; `-H 'Content-Type: Application/JSON; charset=utf-8'` is `HTTP 200`.
- **Method.** `$S api-raw "$RUN" -X GET`. `{"error":"method"}` and `HTTP 405`; add `-i` to see `Allow: POST`.
- **Invalid.** `$S api "$RUN" '{"domain":"not a domain"}'`. `{"error":"invalid"}` and `HTTP 400`.
- **Limit.** `for i in $(seq 1 12); do $S api "$RUN" '{"domain":"example.com"}' | tail -1; done | sort | uniq -c`. Counts of `HTTP 200` plus earlier calls in the minute total 10; the rest are `HTTP 429`.
- **Proof.** Redirect each call's output to `$RUN/evidence/php-api/<sub-feature>.txt`.

## Gotchas

- `api-raw` adds no headers of its own, so each guard is probed with exactly the headers you pass.
- Origin and content type are checked before the limiter, the limiter before the cache: refused calls do not use up the budget, cached ones do.
- Cache API works in local `wrangler dev`; deployed on `workers.dev` it does not (README), so `api-cache` proves local behaviour only.
- The Origin check compares host and port; `http://localhost:<port>` is a different host from `127.0.0.1:<port>`.
