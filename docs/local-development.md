# Local development

This environment runs real Supabase Auth, Postgres and Storage on this Mac. It does not use the hosted project's quota. Production data and credentials are not imported.

## Requirements and start

Installed tools: Colima 0.10.3, Docker CLI 29.8.2, project-pinned Supabase CLI 2.75.0. Node 20+ is required. Supabase uses PostgreSQL 17 locally; confirm the production major version after access returns before relying on migration parity.

```sh
brew install colima docker
colima start --cpu 4 --memory 6 --disk 40
npm ci
npm run local:start
npm run local:seed
npm run local:serve
```

Open http://127.0.0.1:4173. Local Studio: http://127.0.0.1:54323. Test emails remain in the local mail viewer on port 54324.

The first startup downloads containers and applies every migration followed by `supabase/seed.sql`. Later starts reuse local data. The seed script is repeatable: it reuses account passwords, upserts image objects, and does not duplicate sample records. Passwords are generated into `.local/test-accounts.json` with owner-only permissions and are never committed. Use owner@example.test or staff@example.test; outsider@example.test exercises denied workspace access.

Fixtures: 88 product records with local WebPs and synthetic prices/stock, a sample supplier, client, combo, and quotation. Real production prices/orders are not reproduced. Tests can modify fixture data; use a reset if a pristine baseline is needed.

In another terminal:

```sh
npm run local:test
```

## Isolation

- Startup refuses a hosted-project linkage (`supabase/.temp/project-ref`). Existing linkage on this Mac was preserved in `.local/supabase-linkage-backup`; do not restore it while using local scripts.
- The local scripts require the exact loopback Supabase API URL and use the fixed local container name. They do not read `.env` or link to a remote project.
- `local:serve` injects only the local public key. The production configuration file is unchanged. Browser CSP blocks connections and images from production domains. Frontend libraries are served from installed packages; external fonts are removed for local testing.
- Only allowlisted app files and assets are served. Environment files, database source, and generated test credentials are inaccessible over the dev server. The server binds to loopback and rejects unrelated Host headers.
- Supabase seed removes cron jobs and replaces production image URLs with local URLs. Local Edge Runtime is disabled. No Vault, Telegram, or production credentials are imported. App notification dispatch is disabled in the local configuration. Database triggers may still create local queue records for realistic testing, but no messages are delivered.
- Use `npm run local:serve`, not the legacy `npm start` static server: the latter serves the production configuration and repository directory.
- Do not expose the local stack to the internet or import production secrets. These fixture credentials and service-role keys are only for local testing.

## Stop and reset

```sh
npm run local:stop
colima stop
```

Stopping retains local database data. To deliberately discard local test data and replay migrations, run `npx --no-install supabase db reset --local`, then `npm run local:seed`. Never use `--linked`, `db push`, or remote URLs for this workflow. Reset affects local data only but is destructive to local test edits.

## Limits of local validation

The hosted CDN, provider quota enforcement, actual production traffic, real business records, and device-specific Android caching need separate production/device validation. The current dev server is Mac-browser-only; Android requires a separately reviewed debug-only network configuration, not changes to production cleartext rules.

The larger performance implementation follows `supabase-optimization-plan.md`. This change establishes the test environment; it does not claim the egress reduction has been achieved.

## Dependency notes

The Homebrew CLI installed initially (2.119.0) could not start with the old linked service metadata. Project scripts use the pinned 2.75.0 CLI and refuse linkage. Its tar dependency is overridden to 7.5.22. Existing audit findings in Capacitor asset tooling and PDF dependencies require a separate compatibility-reviewed upgrade; no broad automatic audit fix was applied.

## Verification completed on October 5, 2026

All existing migrations applied to the fresh local PostgreSQL instance. The seed was run twice and integration checks passed: member and outsider login/access rules, all workspace table queries, 88 local WebP objects, authenticated upload/delete, denied anonymous/non-member uploads, zero cron jobs/Vault secrets/hosted image references, local-only frontend config, CSP, and denial of access to private files through the dev server. Browser sign-in persisted across reload; all 91 image elements in the active Studio view decoded from local URLs. Full Android/device and hosted-CDN tests are still pending.
