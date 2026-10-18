# MISTAKES.md

## Enforced Rules (check every task)
_(none yet)_

## Patterns (promote at 3 hits)
_(none yet)_

## Observations (first sightings)
- 2026-10-17: Derived an HMAC signing key via `store.Encrypt` (upstream `oauthState`) → Encrypt uses a random nonce, so the "key" differs per call and every OAuth callback failed `invalid state` → derive signing keys with `Store.MACKey(ctx, purpose)` (sha256 of the persisted crypto key + purpose). (hits: 1)
- 2026-10-17: Returned 502 from `/api/google/callback` on exchange errors → Cloudflare replaces origin 502/504 bodies with its own page, hiding the message → return 500 and `log.Printf` the error; CDNs pass 500 bodies through. (hits: 1)
- 2026-10-17: vite-plugin-pwa (workbox generateSW) `navigateFallback` served `index.html` for `/api/google/callback`, so the browser never hit the server after Google's redirect → any top-level navigation under `/api/` (OAuth callbacks, ICS exports, share links) must be in `workbox.navigateFallbackDenylist` (`/^\/api\//`); after changing it, users need the old SW unregistered or an autoUpdate cycle. (hits: 1)
- 2026-10-17: Cal's feed colours are `slate|mint|sky|violet|amber|orange|rose|red`; upstream passed `"iris"` for the Google feed, which the web palette doesn't know → use `paletteForHex` / a listed name. (hits: 1)
