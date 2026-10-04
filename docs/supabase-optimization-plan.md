# Supabase optimization and reliability plan

Date: 2026-10-04. Status: reviewed implementation plan; no production changes made.

## Decision and non-negotiable constraints

Keep Supabase for authentication, operational data, and product images initially. Optimize and measure before introducing another provider. Preserve direct product uploads from web and Android. Keep the organization on Free, subject to verification of its actual subscription; do not activate paid transformations, add-ons, overage billing, or R2. Cloudflare is not required for this phase.

The objective is substantially lower traffic, bounded resource use, correct data, and recoverable failures. No finite free service can guarantee unlimited growth or uninterrupted availability. Free-plan quota exhaustion can still restrict the service. An image error must not block unrelated app features, but application code cannot keep Supabase operations available when the provider restricts the organization.

## Evidence and unknowns

Repository inspection found:

- 88 local WebPs total approximately 14 MB; original PNGs total approximately 193 MB. These are local file totals, not measured production downloads.
- A prior migration changes seeded product URLs to Supabase-hosted WebPs. Inspect live records and objects before claiming originals are the incident's cause. New uploads currently send the selected file unchanged.
- `imageMarkup` and `pickerImageMarkup` lack lazy-loading attributes. Navigation calls `renderAll`, rebuilding unrelated views.
- `hydrateFromSupabase` fetches eight data sources together; failure of one rejects the whole load. Many mutations repeat this full hydration.
- Product saves already disable the button and guard against concurrent submission. They do not persist a stable operation/product ID across retries; a failed follow-up step can make a successful write look unsuccessful.
- PDFs already share a promise cache within an export. Preloading is unbounded, failures can produce silent missing tiles, and fetch retries use `no-store`.
- Uploads already request a long cache lifetime. Verify actual response headers and device behaviour rather than assuming caching is absent.
- The existing roles are owner/staff, with additional expense permissions. Image authorization must use an explicit product-management capability; do not silently equate expense administration with image administration.
- This directory was not a Git repository when inspected. Establish a recoverable source snapshot or version control before implementation.

Unknown: actual plan, billing-cycle dates, quota incident details, production object inventory, current active APK versions, user/device counts, export frequency, traffic breakdown, and Android cache behaviour. These are baseline inputs, not reasons to postpone local preparation.

## Usage evidence supplied on October 4

The user's dashboard screenshot shows cached egress 16.336/5 GB (327%), uncached egress 2.173/5 GB (43%), storage 0.322/1 GB (32%), database 0.042/0.5 GB (8%), 8,062/500,000 Edge Function invocations, and one monthly active authenticated user. It explicitly says overages are not currently billed and restrictions may apply. The user reports the cycle resets October 8; that date is not visible in this screenshot.

Cached egress is the only breached quota visible here. This supports prioritizing asset delivery, but does not identify which objects, clients, or URLs caused the downloads. A single authenticated user does not count anonymous public-image requests or distinguish devices. Confirm project/date filters and inspect daily cached-egress trends and top object paths before attributing the incident to one workflow. Remaining uncached allowance cannot offset cached-egress overuse.

For an equivalent volume of activity, moving from 16.336 GB to below 5 GB requires more than 69.4% reduction; reaching the 2.5 GB engineering target requires about 84.7%. These are comparisons with observed usage to date, not full-cycle forecasts. Set the production cached-egress target to at least 85% reduction for matched activity, alongside the per-workflow acceptance gates. Keep uncached usage under its own budget: 2.173 GB already leaves little margin against the initial 2.5 GB operating target.

Do not assume enabling CDN caching solves this: these bytes were already served from the CDN. Prioritize reduced variant sizes and avoided device downloads, then bounded PDF behaviour and investigation of unexpected public traffic. Existing optimized seed images mean the local PNG-to-WebP saving cannot be applied to all observed traffic as a forecast. Local tests can validate correctness and transferred bytes; hosted measurements after reset must validate the reduction under representative real use.

## Phase 0 — Baseline, backups, and budgets

1. Inspect the Supabase organization Usage screen for the current and incident periods. Separate cached and uncached egress, storage, database, auth, functions, and other projects in the same organization. Record restrictions and renewal date.
2. Inventory live image references and objects: path, byte size, format, dimensions, product mapping, duplicates, and missing assets. Inventory metadata first; avoid downloading every remote object merely to count it. Prefer existing local originals where identity can be verified.
3. Capture representative cold-cache and warm-cache sessions: sign-in, first product page, scrolling, search, edit/save, orders, quote and catalogue PDF, app restart, and second device. Record network requests, transferred bytes, latency, decoded-image memory where practical, and failures. Redact tokens and client details.
4. Back up source, database/schema, image references, and originals locally. Verify restoration on a small sample. Cloud backups themselves consume resources; exclude unnecessary bulk data and secrets from logs.
5. Set an initial engineering operating target below 50% of each verified monthly egress allowance and storage allowance. Treat cached and uncached budgets separately, leaving headroom for business records, migration, backups, and new devices.

Capacity model: monthly remote image downloads × measured average bytes per requested variant, plus PDF downloads and all non-image traffic. Use separate cold/warm scenarios and measured CDN hit mix. Do not treat the two egress quotas as one interchangeable pool or assume every repeat view is a cache hit.

Deliverable: baseline report and measurable targets. If the provider is already restricting service, optimizations reduce future usage but do not undo usage already incurred.

## Phase 1 — Fixed image variants and provider boundary

Introduce one image adapter used by list, picker, combo, detail, print, and native PDF code. It resolves a product image reference plus intended use into a variant URL. Keep storage provider details out of components.

Initial longest-side limits and provisional byte ceilings:

| Variant | Dimension limit | Byte ceiling | Usage |
| --- | --- | --- | --- |
| thumb | 240 px | 30 KB | Compact rows and pickers |
| grid | 640 px | 120 KB | Cards and collages |
| export | 1200 px | 300 KB | Print and PDF |
| detail | 1600 px | 500 KB | Product detail on demand |

These are engineering starting points. Validate on representative product photos, transparent backgrounds, fine details, and printed output. Adjust explicitly if quality is inadequate. Never upscale; preserve aspect ratio and orientation. Use bounded quality/resize attempts and show a useful error if the result cannot meet limits. Verify the browser actually produced WebP rather than silently accepting a fallback encoding. Originals are local backups, not routine screen assets; private source images must not live in a public bucket.

Create variants before uploading. Decode one source at a time and release canvas/object URLs promptly. Start with a 15 MB source-file limit and a 24-megapixel decoded-image limit, then verify on the weakest supported device. Unsupported/corrupt formats receive a clear conversion message, not a raw-upload fallback.

Add nullable provider, image key/version, and variant metadata to product records; retain legacy `photo` during rollout. Use immutable paths such as `products/<product-id>/<asset-id>/grid.webp`, with a stable UUID or content-derived version rather than a client-incremented counter. Do not overwrite cached paths or append random timestamps on reads.

Security: enforce membership/capability in database and Storage policies, constrain paths and bucket upload size/MIME types, and keep service-role credentials out of app bundles. Browser validation is an efficiency measure, not a security boundary. Exact content/dimension validation requires a trusted validation step if hostile uploads are in scope; bucket MIME checks alone do not prove valid image content.

## Phase 2 — Retry-safe saves and consistent business writes

- Generate a draft product ID and operation ID once, persist until completion/cancellation, and reuse on retry. Reuse completed variant uploads. Deduplicate identical asset content within the authorized workspace where useful.
- Store a unique operation record server-side so two tabs/devices cannot commit the same logical operation twice. Detect an operation ID reused with different input.
- Track upload stages and completion: pending, variants verified, database committed. Commit the product reference only after every required variant is present. Storage and SQL are not one transaction; explicitly recover partial uploads and lost success responses.
- Use an expected row version/updated timestamp to detect concurrent edits; surface a conflict rather than silently overwriting another user's changes.
- Keep the old image active until replacement commits. A failed upload does not invalidate the current product. Offer saving metadata without the failed replacement when appropriate.
- Separate primary save success from vendor refresh, screen reload, or notification failure. Reconcile by operation ID after ambiguous network errors before retrying.
- Extend idempotency and transactional boundaries to order/quote creation and inventory-changing actions. Snapshot quote prices/product details needed for historical correctness; later catalogue edits must not change old order totals.
- Retry only transient failures, with bounded backoff and jitter; respect Retry-After. Never loop on authorization, validation, quota, or conflict errors.

## Phase 3 — Fetch and render only what is needed

- Render/load the active view and its explicit dependencies, not every view. Separate authentication/access verification from optional expenses, vendor, image, and reporting loads.
- Introduce stable server pagination and search, initially 24 products per page; use a deterministic tie-breaker on ID. Cancel superseded searches and ignore stale responses. Add query indexes based on actual filters and query plans.
- Load image URLs only near the viewport, use explicit dimensions/aspect ratios and asynchronous decoding, and render placeholders on error. Native lazy loading is useful but not an exact download quota; use an observer-controlled source when a strict prefetch boundary is needed.
- Paginate orders, contacts, inventory, and expenses as they grow. Move totals/counts to scoped aggregate queries so pagination does not produce incomplete business totals.
- Replace global rehydration after writes with the affected row/list refresh and targeted invalidation. Deduplicate concurrent requests and avoid duplicate auth-triggered loads.
- Keep page dependencies explicit: quote combo components, contact order counts, and stock totals must remain complete after pagination. Do not calculate global values from the visible page.

## Phase 4 — Cache with defined correctness and lifetime

- Use immutable versioned URLs and verify long-lived Cache-Control behaviour in real browser and Android responses. Avoid automatic `no-store`, URL randomization, or preload-all behaviour.
- Start with ordinary HTTP caching. Add a bounded persistent image cache only where measured WebView/PDF behaviour requires it; use an LRU eviction policy, initially 100 MB, and recover from storage denial or eviction.
- Cache only requested public catalogue assets. Do not put client addresses, financial records, or tokens into a shared application cache. Scope product metadata to user/workspace and schema version, give it a short TTL (initially five minutes), and clear it on sign-out/account change.
- Use cached product metadata for fast display with freshness indicators; refresh in the background. Require authoritative validation for price-sensitive saves and inventory operations. Cached data never grants access or authorizes a write.
- Cache eviction, missing files, and service-worker upgrades must recover without a reinstall. Never report an offline write as saved. A full offline-write queue is deferred because conflict handling would add substantial risk.

## Phase 5 — Predictable PDF and print exports

- Capture an immutable product/quote snapshot at export start. Fetch only the required unique export variants; retain existing per-export deduplication while isolating it from other concurrent exports.
- Limit downloads initially to three concurrent requests. Bound fetch and decode time, expose progress and cancellation, and cap total export image bytes based on supported device tests.
- Remove the automatic cache-bypassing retry. Retry transient failures at most twice using normal caching; report missing-image names. Default to stopping an incomplete export, with an explicit user choice to continue with placeholders.
- Apply the same readiness rules to browser printing: load export variants before opening print, regardless of screen lazy loading. Optimize packaged logos too.
- Release decoded images and temporary buffers after completion. Reuse downloaded assets through the normal device cache. Check native sharing and browser PDF output visually.

## Phase 6 — Migration and compatible rollout

1. Add backward-compatible schema and adapter support; test with legacy URLs, missing images, combos, and new references.
2. Generate a manifest mapping current product references to verified sources and new variants. Include current user uploads, not just the 88 seeded products. Quarantine ambiguous mappings.
3. Upload in small resumable batches with strict concurrency/byte limits; verify existence, MIME type, dimensions, and hashes where feasible. Avoid repeated full downloads for verification.
4. Switch a small sample of products using conditional updates that preserve edits made since inventory. Record old/new mappings and operation IDs for rollback.
5. Keep legacy `photo` pointing to a compatible optimized URL while old APKs exist. Freeze or enforce safe legacy upload paths before tightening bucket policies; do not silently break existing staff devices.
6. Test web and an actual supported Android device. Build one updated internal APK and pilot with a small staff group before general rollout.
7. Roll out remaining references only after functional and byte-budget gates pass. Retain old referenced assets for at least 30 days and until active old clients are accounted for. Revert mappings/configuration if needed.

Do not delete the legacy column or bucket as part of the first release. Migration downloads and dual storage need quota headroom too.

## Phase 7 — Operations, recovery, and growth decisions

- Record lightweight aggregate request/byte/error metrics with sampling and bounded retention. Browser cross-origin timing can hide byte sizes; use controlled network captures and provider usage as the authoritative comparison. Never store secrets or customer payloads in telemetry.
- Review provider usage daily during the pilot and weekly afterward. Configure available provider notifications; custom 50/70/85% thresholds and forecasting need verified metrics access. Monitoring can lag and is not a hard spending or availability cap.
- At 50% of either allowance, investigate growth and revise forecast. At 70% or a projected breach, enable an app conservation mode: stop background refresh/preload and repeated bulk exports. At 85%, default to text-only catalogue screens and cached-image exports until reviewed. Essential operations still require an available provider.
- App limits do not prevent third-party downloads of public URLs or old-client traffic. Treat public image hotlinking/abuse as residual risk. CORS and obscured URLs are not access control. If this becomes material, assess authenticated images or static hosting and the sharing tradeoffs.
- Weekly database export, local original backups on each image batch, monthly restore exercise and reference audit. Schedule only after setup and consent for the actual automation; this document creates no scheduled jobs.
- Cleanup uses mark-and-sweep with a dry-run report, retention grace, a fresh reference check, and exclusion of active uploads and historical document references. Never apply a blanket age-based rule to active product images.
- If measured optimized usage is projected above 70% for two consecutive weekly reviews, or operational restrictions recur, revisit architecture before the next limit. Cloudflare static assets remain an option for published catalogue images; direct upload publishing would need separate design. Do not enable R2 or paid services automatically.

## Acceptance gates

- Baseline and post-change comparisons use identical tasks and cold/warm conditions. Aim for at least 80% less image transfer on the current first-view workflow; measure rather than promise this before knowing live assets.
- No originals in routine product views or exports. No images requested by inactive views; offscreen images remain unfetched beyond the agreed prefetch margin.
- On a controlled warm-cache repeat within lifetime, unchanged images transfer no response bodies. Record legitimate revalidation, eviction, and device differences separately.
- Double-click, lost response, partial variant upload, restart/retry, and simultaneous duplicate operation tests yield one logical product/order and one referenced completed asset set; abandoned partial objects are recoverable.
- Unauthorized/inactive users cannot upload, replace, delete, or claim another workspace's asset. Test actual database and Storage policies, not just hidden UI controls.
- Failed optional tables or images do not prevent access to unaffected screens. Provider-wide restriction produces a clear state without retry storms.
- Pagination preserves full-catalogue search, correct totals, quote component resolution, and stable page navigation during edits.
- PDFs have visible progress, bounded concurrency, cancellation, complete images or an explicit omission choice, and correct totals/layout on web and Android.
- Verify quota forecasting with observed traffic, including cache misses and one extra device. Stay below operating targets over a representative pilot; a full billing cycle provides stronger evidence than a short test.
- Rollback the pilot mapping and restore a sample backup successfully before retiring old assets.

## Principal engineer review and changes incorporated

1. Corrected the incident hypothesis: local PNG size is not evidence of production PNG egress; seed migration already uses WebP.
2. Replaced permanent-cache assumptions with versioning, eviction recovery, and cold-device capacity planning.
3. Kept existing PDF deduplication and save-button safeguards; added missing recovery and concurrency semantics rather than duplicating them.
4. Added trusted enforcement, operation uniqueness, partial-upload recovery, and concurrent-edit protection; client guards alone are insufficient.
5. Accounted for hidden-view rendering and pagination dependencies so bandwidth savings do not corrupt totals or omit products.
6. Split image failures from provider-wide restrictions; no claim that same-provider storage isolation guarantees order availability.
7. Added staged migration, old-APK compatibility, rollback manifests, and retention tied to actual references.
8. Made monitoring advisory, accounted for public URL abuse, and removed any implication that alerts enforce a spending cap.
9. Deferred speculative infrastructure and full offline writes. Implement the measured bottlenecks first while preserving an adapter for future change.

## Execution order and user input

Implement phases 0–2 first, then view/data loading, caches and exports; migrate only after the new paths are tested. Operational safeguards ship with the pilot, not as an afterthought.

Local work can begin with the current repository. Before production migration, obtain authorized Supabase access or the Usage breakdown, verify the Free subscription, inventory live assets, and identify staff APK versions. Cloudflare login is not needed for this plan. No credentials should be pasted into chat. Production readiness requires device testing and a measured baseline; no implementation is claimed by saving this document.

## Sources checked

- Supabase pricing: https://supabase.com/pricing
- Egress accounting, independent quotas, usage visibility and restrictions: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- Storage bandwidth optimization: https://supabase.com/docs/guides/storage/serving/bandwidth
- Cost controls: https://supabase.com/docs/guides/platform/cost-control
- CDN fundamentals: https://supabase.com/docs/guides/storage/cdn/fundamentals
- Optional future static hosting: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

Provider pricing and policy must be rechecked before deployment. Current published Free allowances are not an unlimited-usage or permanent-service guarantee.
