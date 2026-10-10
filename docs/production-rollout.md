# Production image/performance rollout

Status: PRODUCTION ROLLOUT VERIFIED on 10 October 2026. See docs/production-rollout-20261010.md for the sanitized release status. Detailed production verification evidence is retained privately. Actual usage observation remains ongoing. All scripts under scripts/local are deliberately local-only; do not edit their host guard to deploy production.

## Release gates

- Verify the correct production project and billing cycle in the dashboard, and that normal authenticated reads succeed. A reported reset date is not proof of recovery.
- Run all Node tests, local integration tests, SQL summary/rollback tests and the web build at the release commit.
- On an Android test device verify login, image scrolling, image upload/retry, quotation/catalogue PDF generation and actual Save/Share. Use a separately configured test build for the local backend; the normal debug APK retains its production configuration and must not be used as a local fixture build.
- Capture production baseline counts and usage. Confirm adequate Storage headroom for old images plus all new variants. Check that all deployed clients understand a direct grid URL (older clients can still display it).

## Inventory and external backup

Run read-only queries through an authorized administrative connection, exporting results outside Supabase to restricted local files. Never put service-role credentials in frontend code, logs, screenshots or Git.

```sql
select id, kind, photo, updated_at from public.library_items where kind='product' order by id;
select bucket_id, name, metadata from storage.objects where bucket_id='catalogue' order by name;
select version from supabase_migrations.schema_migrations order by version;
```

If library_items has no updated_at column in the actual schema, omit that column; image comparisons use the exact previous URL. Export product business fields separately for before/after verification (prices, buffer, SKU, stock, supplier). Save file checksums and record project ID, release commit, timestamp and operator. Keep original image files outside Supabase too if not already backed up. Database metadata exports do not back up object bytes. Downloading backups consumes egress, so reuse verified local originals where hashes match rather than repeatedly exporting all media.

## Dry run and apply

1. Compare the real inventory with the generated manifest. Identify missing originals, mismatched IDs, duplicate paths, unsupported images and changed products. Stop on ambiguity; never assume the 88 local fixtures are a full production inventory.
2. Compute proposed old URL → grid URL changes, variant byte totals and remaining storage headroom. Preview the full list and rollback references before any product update. Do not migrate prices or stock from synthetic local data.
3. Apply additive migrations 202610060001 through 202610060003 and 202610090001 using the normal reviewed migration process. Keep previous app deployment available. Check RPC access as member/outsider/anonymous.
4. Upload immutable variants with no overwrite. Verify Content-Type, length, decodability and content hash against the source output. Preserve old objects. Keep an external progress ledger after each product, including upload failures.
5. Apply `apply_image_migration(batch, product, expected_previous_url, new_url)` per product. A conflict means a later edit: stop/reconcile it instead of forcing the write. Persist exported database history after partial success as well as full success.
6. Deploy the reviewed app only after its required SQL functions are present. Check a small set first: cold/warm navigation, product details, editing, summary totals, contacts and PDF export. Expand the migration only after those checks pass.
7. Compare business-field snapshots and image counts. Record exact release commit and batch IDs. Follow docs/egress-operations.md for real usage; no local percentage is a production forecast.

## Rollback

Restore the prior app release if necessary. Keep additive schemas in place. For data rollback invoke `rollback_image_migration(batch, product)` from the administrative runner and export final history. Conflicts preserve later user edits and require reconciliation. Retain previous images and external records for at least one successful usage cycle; obtain an explicit retention decision before any permanent cleanup. Never restore an entire products table just to undo image URLs.

## Known limits

A separate production-capable runner is shipped and documented in docs/release-runner.md. Production apply is verified; guarded rollback was tested locally but has not been needed in production. Actual post-release usage monitoring is still required. Catalogue and directory metadata still load fully through bounded batches to preserve full search/export semantics; a server-search/selected-ID design is a future scale change, not a benefit claimed by this release. Public object traffic and new devices remain potential quota consumers.
