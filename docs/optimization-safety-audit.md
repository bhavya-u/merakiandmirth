# Optimization safety audit — 7 October 2026

Reviewed commit bb4a8d9. Verdict: NOT READY FOR PRODUCTION SIGN-OFF. Local regression success does not establish zero data-loss or breakage risk.

## Open findings

1. High: Existing product deletion rewrites every combo from the client's cached snapshot, then deletes the product in a second request (`deleteProduct`). A concurrent combo edit can be overwritten; a failure between requests leaves partial business changes. Use a server transaction that locks/updates only affected rows, with conflict handling. This behavior predates the optimization but still blocks a broad data-safety guarantee.
2. High: Existing order creation and inventory updates are not retry-idempotent transactions. `saveOrder` creates a fresh order on retry and links it separately; `saveInventory` inserts a stock movement and updates product settings in parallel. Lost responses or partial failures can cause duplicate orders/movements on retry. Add server-side operation IDs and atomic RPCs; distinguish committed writes from refresh failures. These behaviors predate the optimization.
3. Medium: New paginated order detail can become stale after editing an order loaded on page two. Refresh resets the list to page one, while renderOrders only refreshes the open dialog if its order is still in the loaded array. Load the open detail separately after successful mutations or retain/refetch the selected record outside page state.
4. Medium: Hydration publishes occasion/item state before checking whether returned orders still match the selected date range. Changing filters mid-request can return early after partially updating memory, without rendering or publishing other datasets. Validate all response identity/range guards before any state assignments and add a regression test.
5. Release work incomplete: production-capable migration runner, actual production inventory, verified external data/object backup, and production dry run are not complete. Local variant installer verifies type/length but does not verify remote content hashes or paginate its administrative inventory/history beyond the API default row cap. Do not repurpose it for production unchanged.
6. Device verification incomplete: actual Android PDF sharing, WebView behavior and interrupted real-network upload checks remain. Failure-injection upload tests use the actual function with simulated Storage responses; they are not full device tests.

## Data preservation evidence

New SQL migrations are additive. Image migration changes only photo references and records prior URLs in the same transaction. Rollback checks the current URL before restoring the old one. The local installer does not delete old Storage objects. Transactional and CLI rollback/reapply tests confirm later edits are preserved and prices/stock are unchanged. These are positive controls, not a substitute for independent production backup and restore testing.

## Verification rerun

17 Node tests passed. Local integration suite passed auth/member/outsider access, image access, anonymous upload denial and production isolation checks. SQL apply/rollback tests, actual CLI dry-run/apply/rollback/reapply/conflict tests, expense totals with 61 temporary claims and order totals/profit/date/client counts with 61 temporary orders passed. Static web bundle build passed. All test fixture mutations were rolled back/restored. Production was not modified.

Previous browser tests verified 50→62 order pagination and 50→61 expense pagination with complete totals, and basic screen navigation. These do not cover every CRUD failure/concurrency scenario. No blanket end-to-end sign-off is issued.

## Optimization limitations still applicable

Catalogue and directories still load all metadata in bounded transport batches; they do not implement progressive server-side search or bound total memory. Data reuse is 30 seconds and can display another user's changes with that delay. Monitoring is a documented procedure/calculator, not an installed alert service. Production egress reductions remain unmeasured.
