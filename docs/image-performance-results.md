# Image optimization checkpoint — 6 October 2026

Implemented on `feature/performance-optimization`, with local Supabase only. Production data and storage have not been migrated.

## Measurements

Local browser measurements use a same-origin proxy preserving Storage cache headers so Resource Timing can expose transfer sizes. They measure image bodies, not total page bytes or hosted CDN billing. A fresh benchmark query gives a cold image URL namespace.

| Scenario | Image responses | Image body bytes |
| --- | ---: | ---: |
| Before: cold Studio | 88 | 14,800,014 |
| Before: warm Studio | 0 network / 88 cached | 0 |
| After: cold Studio | 8 | 54,036 |
| After: warm Studio | 0 network / 8 cached | 0 |
| After: scroll and visit library, cumulative | 32 | 642,120 |

The cold Studio reduction was 99.6% in this desktop viewport. This is not a forecast of monthly egress. Scrolling, additional screens, new devices, cache eviction, public image traffic and exports add downloads.

All 88 local products have four variants generated from the original PNGs:

| Variant | Maximum dimension | Maximum bytes/image | Total fixture bytes |
| --- | ---: | ---: | ---: |
| Thumbnail | 240 px | 30,000 | 651,662 |
| Card | 640 px | 120,000 | 3,688,090 |
| Export | 1200 px | 300,000 | 9,998,678 |
| Detail | 1600 px | 500,000 | 14,800,014 |

Images preserve proportions and are never enlarged. Keeping four versions increases stored bytes but reduces bytes transferred during ordinary browsing. Original assets and prior local photo references remain available.

## Engineering review

- Legacy URLs still work. Only the explicit `variants-v1/<version>/<size>.webp` contract changes size. The DB stores a usable card URL, including for older app versions.
- New uploads prepare all variants before starting Storage writes. Supported inputs: JPEG, PNG, WebP, at most 15 MiB and 24 megapixels. Pixel count is checked after browser decoding; this is a usability bound, not protection against malicious uploads or decode memory exhaustion.
- Versioned immutable paths retain one-year browser cache headers. No cache-busting timestamps on reads. Replacing an image creates a new version.
- A row references the new version only after all four uploads succeed. In-dialog retries reuse completed uploads and a stable new-product ID. This is not a transaction across Storage and Postgres; abandoned uploads still need eventual orphan cleanup.
- IntersectionObserver supplies image URLs only near the viewport. Removed cards are unobserved. Hidden views do not request their image sets. Older browsers lacking IntersectionObserver fall back to eager loading.
- Browser print images load eagerly and decode before printing; a failure shows a message. PDF image preloading uses three workers and cached requests with a 15-second fetch timeout, without an automatic cache-bypassing retry.
- Client conversion does not enforce a server storage quota. Public image URLs remain fetchable outside the app. These changes cannot guarantee perpetual free-tier availability.

## Verification

Passed: JS syntax checks, image helper tests, static mobile web bundle generation, local integration suite (auth, member isolation, anonymous upload denial, 88 product photos, no production URLs/cron secrets), browser canvas conversion and all four budgets, cold/warm image transfers, library navigation, detail rendering, and catalogue print image readiness using export variants. No browser console errors observed in the checked flow.

The local browser conversion fixture produced valid WebP sizes of 5,006 / 15,422 / 42,548 / 61,940 bytes. The catalogue export selected three export variants and all images decoded successfully.

Not yet verified: a physical Android build/share flow, saved PDF visual inspection, interrupted upload recovery end to end, production traffic and production migration. Keep these as release gates, not assumed successes. Real local prices remain synthetic.

## Reproduce

1. Start local Supabase and run `npm run local:seed` if needed.
2. Run `npm run local:images` (requires `cwebp`, macOS `sips`). This installs local variants and saves previous photo references in ignored `.local/image-variants/rollback-*.json`.
3. Start `npm run local:serve` and sign in using ignored `.local/test-accounts.json`.
4. Open `http://127.0.0.1:4173/?benchmark=<new-run-name>` for cold measurements; reload the same URL for warm measurements.
5. Open `/image-checks` on that server for browser upload conversion checks.
6. Run `npm run images:test`, `npm run local:test`, and `node scripts/build-web.mjs`.

Do not point these local scripts at production. A future production migration needs a separate reviewed inventory, backup, dry run, conditional updates and rollback procedure after quota availability returns.
