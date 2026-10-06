# Optimization implementation checklist

Work proceeds in this order on the feature branch. Production rollout follows local verification. At each checkpoint review correctness, failure recovery, access control, egress impact and compatibility; record evidence before advancing.

- [x] Measure cold/warm image downloads and implement image variants, lazy loading and cache-safe URLs (see image-performance-results.md).
- [x] 1. Add private image migration history with atomic conditional apply/rollback; test conflicts, retries and access restrictions locally.
- [x] 2. Integrate the local migration tool with history, verified uploads, external JSON backups and a dry-run/rollback command. Preserve old objects.
- [ ] 3. Complete image release checks: interrupted uploads, saved PDF visual inspection and Android sharing.
- [x] 4. Map screen data dependencies; replace whole-workspace reloads with screen-specific queries and targeted invalidation. Verify fresh data after edits and navigation.
- [ ] 5. Add pagination and explicit field selection to growing lists; preserve searches, totals, exports and sorting semantics.
- [ ] 6. Deduplicate in-flight reads and bound retries; cancel obsolete requests and handle quota restrictions without retry loops.
- [ ] 7. Add usage review procedure for cached/uncached egress separately, monthly projections and proposed 2.5 GB/category operating target. Do not represent alerts as spending caps.
- [ ] 8. Review optional data-saving mode against measured needs; retain detail/export quality on demand.
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
