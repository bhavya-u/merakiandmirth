# Image release runner

Use `scripts/release/image-migration.mjs` for a reviewed release. `scripts/local/*` remain local-only. Credentials are JSON `{ "url": "https://PROJECT.supabase.co", "key": "ADMIN_KEY" }` in a restricted, ignored file; never pass keys on the command line. Use a new private output directory per snapshot. Do not run two commands against one directory concurrently.

Commands take `MODE DIRECTORY --credentials FILE --project-ref PROJECT`. With `PROJECT=local`, only `http://127.0.0.1:54321` is accepted. Hosted endpoints must match the explicit project reference. Redirects are rejected and requests have timeouts.

1. `inventory`: export every catalogue row through keyset pages and back up referenced product image bytes with SHA-256 hashes. Up to three objects download concurrently. Object limit is 30 MiB; conservative total download budget is 500 MiB. Unsupported/external URLs stop the run. Existing snapshots are never overwritten. Use `inventory ... --resume` after interruption: it verifies existing bytes and unchanged catalogue rows before continuing. A changed catalogue requires a fresh/reconciled snapshot.
2. `prepare`: generate all four variants from the backed-up production bytes, respecting the app's pixel/byte budgets. This runs locally, with no uploads. Do not use synthetic seed records or an old local manifest as production input.
3. `plan`: compare the current catalogue to the backup and write exact previous/new URLs, batch ID and manifest. Prints the SHA-256 of the plan. This is a read-only dry run, not a deployment.
4. After release gates and production-write authorization, `apply ... --approve-plan SHA256`: verifies original backups, every local variant's hash/format/dimensions and immutable version path before uploads. Refuses changed business fields or unrelated photo changes. Uploads without overwrite, downloads each variant to verify remote bytes, and calls the guarded photo-only RPC. Progress is saved per product. Use `--product ID` for a canary from the same reviewed plan, then omit it for the full batch. A rerun uses the same batch/URLs. Verification downloads also consume egress.
5. `rollback ... --approve-plan SHA256`: uses paginated database history and guarded rollback RPCs. Conflicts stop rather than overwrite later edits. Both apply and rollback export history in a finally block and retain all old objects. `after.json` records whether business fields still match; concurrent business edits may legitimately produce a mismatch and must be investigated, never overwritten by restoring entire rows.

Companion tools:

- `backup-records.mjs DIRECTORY CREDENTIALS_FILE PROJECT_REF` exports 18 application tables and rechecks their hashes. It refuses to overwrite an existing records snapshot. This is not a transaction-consistent full database dump: schema, Auth secrets/users, Vault and unreferenced object bytes are excluded. No general full-database restore guarantee is implied.
- `inventory-storage.mjs DIRECTORY CREDENTIALS_FILE PROJECT_REF` recursively pages catalogue Storage metadata for headroom calculations. Run during a quiet period; offset-based Storage listing can change under concurrent object writes.

Backups are outside Supabase, on this Mac, not an independent off-site disaster-recovery copy. Treat business exports as private. Keep the directory and old objects through at least one successful usage cycle. No cleanup command is provided.

Validation: `node --test tests/*.test.mjs`, `node scripts/local/test-release-runner.mjs`. The latter verifies backup/resume, preparation, dry-run, corrupted-file refusal, apply/retry, unchanged business fields and rollback/retry against local Supabase, restoring the original fixture photo afterward. It leaves new immutable test objects for inspection.
