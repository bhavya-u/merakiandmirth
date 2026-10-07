# Optimization implementation checklist

Work proceeds in this order on the feature branch. Production rollout follows local verification. At each checkpoint review correctness, failure recovery, access control, egress impact and compatibility; record evidence before advancing.

- [x] Measure cold/warm image downloads and implement image variants, lazy loading and cache-safe URLs (see image-performance-results.md).
- [x] 1. Add private image migration history with atomic conditional apply/rollback; test conflicts, retries and access restrictions locally.
- [x] 2. Integrate the local migration tool with history, verified uploads, external JSON backups and a dry-run/rollback command. Preserve old objects.
- [ ] 3. Complete image release checks: interrupted uploads, saved PDF visual inspection and Android sharing.
- [x] 4. Map screen data dependencies; replace whole-workspace reloads with screen-specific queries and targeted invalidation. Verify fresh data after edits and navigation.
- [x] 5. Add pagination and explicit field selection to growing lists; preserve searches, totals, exports and sorting semantics.
- [x] 6. Deduplicate in-flight reads and bound retries; cancel obsolete requests and handle quota restrictions without retry loops.
- [x] 7. Add usage review procedure for cached/uncached egress separately, monthly projections and proposed 2.5 GB/category operating target. Do not represent alerts as spending caps.
- [x] 8. Review optional data-saving mode against measured needs; retain detail/export quality on demand.
- [ ] 9. Prepare production inventory, external backup, dry run and release/rollback instructions. Verify production availability and release checks before migration.
- [ ] 10. Roll out and compare actual production usage; retain previous app release and images through an agreed rollback window. Review orphan cleanup separately.

Migration history records only image references, never restores whole product rows. Rollback must not overwrite a subsequent edit. Service-role-only migration functions are not exposed to the app. An external backup remains necessary if the database is unavailable. Production mutations are not performed by the local scripts.

## Checkpoint 1 evidence

Local migration `202610060001` applied. Transactional test passed for apply, duplicate apply, stale-reference conflict, later-edit rollback conflict, rollback, duplicate rollback and client privilege denial. Test fixture changes were rolled back. History and URL changes commit atomically. Production untouched.

Checkpoint 2 implementation is present: installer verifies variant response type/length, calls guarded RPC, writes external reference/history JSON and supports `--dry-run` and `--rollback <batch UUID>`. Dry run correctly reported zero changes for the already optimized local catalogue. End-to-end CLI test passed on p00001: dry-run with no writes, verified apply, external backup, rollback preview, rollback, duplicate rollback, reapply, conflict preserving a later edit (exit code 1), exported final history and unchanged prices/stock. Original fixture photo restored in cleanup. HEAD requests are time-bounded and reject redirects; partial apply exports history in a finally block.

## Checkpoint 3 evidence — partial, device verification pending

- Upload failure-injection tests passed against the app's actual upload function: failure before write, lost response after successful write, resuming remaining variants, no repeated completed uploads, stable resulting URL.
- Native share bridge contract test passed: PDF written to CACHE and returned URI forwarded to Share. This uses simulated plugins and is not a device test.
- Android sync and debug assembly passed with installed JDK 21. Filesystem and Share plugins included. No device was attached (`adb devices` empty), so real share-sheet and Android WebView decoding checks remain open. The generated debug APK uses the existing build configuration and was not installed or launched against production.
- Saved two-page native catalogue layout fixture rendered and visually inspected: three-, six-, twelve-product layouts have visible images, readable labels and no overlapping/clipped content. This uses the actual app drawing functions with a Node image decoder and simulated share destination; browser print and Android sharing are separate paths.
- Reproduce: `node --test tests/image-upload-recovery.test.mjs`; `node scripts/local/check-catalogue-pdf.mjs`; `pdftoppm -png .local/catalogue-layout-check.pdf .local/catalogue-layout-check` (PDF helper uses the existing Sharp dependency). The sample PDF is ignored local test output, not a customer document.

Review: retain checkpoint 3 as incomplete until an Android test device is available. Production data unchanged. Database-fetching work can proceed independently, but production release remains gated on device verification.

## Checkpoint 4 evidence

Screen dependency map and targeted refreshes implemented. Studio/catalogues read items + occasions; library also reads vendors; quotes also reads clients; orders reads items + occasions + orders; contacts reads items + orders + clients + vendors; inventory reads items; expenses reads claims + policies + approvers. Studio startup now requests two datasets rather than eight (access/session calls excluded).

Writes refresh only affected datasets, with items included for order status/deletion to account for stock effects. Cached raw order rows are remapped when catalogue items change. Screen navigation deliberately refreshes dependencies for freshness; it is not yet a persistent query cache and can add requests compared with the previous zero-read navigation. Request reuse is checkpoint 6.

Tests passed for query selection, preserving unrelated state, all-or-nothing response publication, recovery after failure and suppressing queued reads from a previous auth epoch. Refreshes serialize to avoid older results overwriting newer refreshes. Account transitions clear in-memory data and reject obsolete access responses. Local browser smoke checks passed for 88 Studio products, one order, expense approvers and client order counts with no console errors. Static web build and syntax checks passed. Mutation refresh mappings reviewed; exhaustive UI mutation regressions remain part of release testing. Production unchanged.

## Checkpoint 5 — expense pagination completed, other lists pending

Expense ledger now selects only rendered/action fields and loads 50 records plus one lookahead record. Load-more uses a `(created_at, id)` descending cursor instead of an offset, excludes duplicate IDs and rejects responses after account/ledger refresh changes. Editing a claim refreshes page one so review/settlement state is current. Full ledger totals and per-person balances come from an invoker-rights SQL summary respecting the underlying RLS; they are not calculated from the loaded page. Anonymous execution is denied. Summary and page reads are separate statements, so concurrent external edits may briefly differ until refresh.

Validation: 10 Node tests passed; static web build passed; local SQL test with 61 temporary claims verified complete count/amount and invoker/anonymous privileges. Fixtures rolled back. Browser load-more interaction and other-list pagination remain release/regression work; orders and contact totals must move to complete summaries before limiting their rows. Production deployment requires migration 202610060002 before the updated client. Production unchanged.

## Checkpoint 5 — order pagination verified

Orders now use 50-row cursor pages (plus one lookahead row), ordered by created_at and id. Date bounds are applied on the server using UTC days, matching the existing created_at date-key display. Dashboard summaries cover the complete selected range; client counts/latest-order summaries cover all matching orders independently of loaded pages. Summary functions use invoker rights and deny anonymous execution. Orders outside the loaded page can be retrieved individually for detail display.

Verification: 10 Node tests and static build passed. Transactional SQL fixture with 61 completed orders validated complete count, legacy unit-cost profit calculation, inclusive date boundaries and client counts. Browser verified 50 visible rows with total 62, load-more to 62, hidden exhausted button, client count 62, and empty date range with zero rows/total. Exact temporary fixture IDs were deleted after verification; original sample order retained. Migration 202610060003 must precede client deployment. Production unchanged.

Remaining pagination scope: product and directory searches still operate on their full fetched arrays and need server-search design before introducing limits. Checkpoint 5 remains open for those lists; request deduplication can proceed independently.

## Checkpoint 6 — request safeguards

Navigation reuses datasets for 30 seconds in memory; no business-data disk cache. Date-filtered order keys are separate. Writes bypass reuse, failed reads do not become fresh, and auth transitions clear reuse timestamps and abort active workspace reads. Serialized repeated navigation avoids concurrent duplicate reads and reuses the first result. Workspace REST reads/read-only RPC fetches have a 20-second timeout through response headers; quota/rate responses (402/429) pause subsequent reads for 30 seconds. No app-level automatic retry loop. Read-only summary RPCs no longer show a misleading saving overlay. In-flight reads already started before a quota response may finish. SDK authentication behavior is separate.

13 Node tests and static build passed, including forced write refresh, queued navigation reuse, quota cooldown without network traffic and caller-abort propagation. Browser and integration regression checks remain part of the cumulative release review.

## Checkpoints 7–8

Added docs/egress-operations.md and a tested offline projection calculator. No recurring dashboard monitor has been installed and no production usage has been inferred. Reviewed optional data-saving mode: retain the existing efficient thumbnail/lazy-loading default; revisit a toggle only if production measurements justify it.

## Checkpoint 5 — catalogue/directory completeness decision

Orders/expenses use progressive 50-row UI pages. Catalogue items, vendors, clients and client summaries now fetch explicit fields through 500-row keyset batches, publish only a complete successful result, and reuse recent data. Tests cover 1,001 records and later-page failure without publishing a truncated list. This closes the API row-limit correctness gap while preserving full local searches, quote autofill, combo composition and exports. It does NOT reduce the total cold metadata bytes for these datasets or bound their total in-memory size. A server-search/selected-ID architecture remains a future scaling change if these lists become large; it is not claimed implemented. Current egress savings come from image work, progressive operational ledgers and short read reuse. Product/combo writes also refresh order summaries to keep legacy derived profit consistent after price/composition edits.

## Checkpoint 9 preparation; rollout blocked

Production rollout/backup/rollback procedure is saved in docs/production-rollout.md. Actual production inventory, verified external object backup and production dry run remain pending, so checkpoints 9 and 10 are not marked complete. Device sharing verification is also still outstanding. Production changes must not be inferred from local success. Checkpoint 5 is complete within the documented design: progressive order/expense pages and complete, bounded metadata transport pages; it does not claim server-side catalogue search.

## Cumulative regression review — 7 October 2026

All 17 Node tests, local auth/member/outsider isolation and image-access integration checks, transactional migration rollback tests and both summary SQL tests passed. Browser smoke checks passed after bounded metadata paging and short read reuse: 88 products, one sample client's correct order count, expense screen and no console errors. Expense UI was additionally checked with 61 temporary claims: 50 displayed with full INR 610 total, then 61 after Load more with unchanged total and hidden exhausted control. Exact temporary fixtures removed afterward.

Awaiting Android test device for actual PDF sharing/WebView verification (request sent to user). Production inventory, external backup and deployment remain unexecuted. No paid services enabled, no scheduled monitoring installed, and no production data changed.

## Safety audit supersedes release assumptions

See docs/optimization-safety-audit.md. Full local regression passed, but release sign-off is withheld: new detail-refresh/hydration race findings, existing non-atomic/non-idempotent business writes, production migration/backup gaps and Android device tests remain. Completed checklist boxes indicate implemented scope, not a guarantee of data safety or a production approval.
