# Optimization implementation checklist

Work proceeds in this order on the feature branch. Production rollout follows local verification. At each checkpoint review correctness, failure recovery, access control, egress impact and compatibility; record evidence before advancing.

- [x] Measure cold/warm image downloads and implement image variants, lazy loading and cache-safe URLs (see image-performance-results.md).
- [x] 1. Add private image migration history with atomic conditional apply/rollback; test conflicts, retries and access restrictions locally.
- [x] 2. Integrate the local migration tool with history, verified uploads, external JSON backups and a dry-run/rollback command. Preserve old objects.
- [ ] 3. Complete image release checks: interrupted uploads, saved PDF visual inspection and Android sharing.
- [ ] 4. Map screen data dependencies; replace whole-workspace reloads with screen-specific queries and targeted invalidation. Verify fresh data after edits and navigation.
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
