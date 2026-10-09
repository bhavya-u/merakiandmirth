# Production optimization preparation — 9 October 2026

Verdict: preparation approved; production deployment withheld pending Android verification and production-write authorization. Read-only production work was explicitly authorized. No production records, schema, objects or billing settings were changed.

## Captured evidence

- Administrative catalogue read succeeded (HTTP 200). This does not test every end-user login path or establish current remaining egress allowance.
- 281 catalogue rows: 228 products and 53 combos. All 228 product image references have externally saved original bytes, with SHA-256 hashes; 321,775,699 bytes downloaded for the completed image backup (failed/partial requests can add traffic).
- 18 application tables exported and re-read for matching hashes. Auth/Vault secrets, schema and unreferenced object bytes are excluded. This is not a full transactional database dump. No general database-restore guarantee is made.
- Storage catalogue metadata: 305 objects totaling 375,078,870 bytes.
- Generated all four variants for every production product locally. Grid contact sheet visually reviewed: all products present, portrait/landscape shapes preserved, no blank/corrupt tiles apparent. This does not replace full-resolution/device review.
- Full dry run: 228 photo-reference changes; no prices, stock, client/order data or combo definitions in the write payload.
- Plan SHA-256: `3d7792b8cad36d0f51a7b0cc774cb8f56ec8cbb4bc7a4cc00b41904a8a8b7221`.

## Storage/download sizing

| Output | Aggregate bytes across product references |
| --- | ---: |
| Thumbnail | 1,917,358 |
| Grid | 10,482,968 |
| PDF/export | 27,315,052 |
| Detail | 35,562,936 |

Unique new objects total 74,015,186 bytes. Preserving every existing object gives a conservative projected stored total of 449,094,056 bytes. Grid bytes are approximately 96.7% smaller than the backed-up original total. This comparison is image payload sizing, not a measured monthly egress reduction. Remote hash verification adds approximately one download of the new variants during migration; public traffic, first visits, cache eviction and exports still consume quota.

## Remaining release gates

1. Real Android WebView decoding, image upload/interruption recovery and PDF Save/Share. No Android device was attached during preparation.
2. Check the actual current billing allowance/headroom, active production clients, target database version and migration ledger before applying SQL.
3. Production-write authorization, then additive migrations `202610060001`, `202610060002`, `202610060003`, `202610090001` before client deployment. The production API schema currently lacks `apply_image_migration`, `rollback_image_migration`, both order/client summary RPCs, expense summary, and the three atomic business-write RPCs.
4. Revalidate backup/plan against current rows before rollout. The runner refuses unrelated changes; reconcile them rather than forcing stale writes.
5. Run a small production canary before the full batch; verify actual user access, totals and exports. Observe cached/uncached egress after deployment per egress-operations.md. Retain previous app and images for the rollback window.

Private recovery artifacts are in `.local/production-release/20261009/`; administrator credentials are in the separate restricted `credentials.json` alongside that directory. Neither is committed or served by the local app. Keep this Mac's backup safe; it is outside Supabase but not off-site.

Android preparation now includes a separately built and archive-verified `Meraki Local` APK at `.local/android-test/meraki-local-debug.apk`. It cannot replace the production app because its application ID differs. No device was connected for runtime verification; this does not close the Android gate.
