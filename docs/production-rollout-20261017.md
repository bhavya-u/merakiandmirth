# Enhancement release — 17 October 2026

Release 1.1.0 (Android version code 2) includes the completed catalogue, editable individual-gift markup, product tags, online-vendor badges, quote editing, expense Excel export, audited extra-amount adjustments and WhatsApp claim-copy changes. The business-readiness roadmap remains a proposed backlog, not implemented functionality.

- [x] 50 automated tests pass.
- [x] Local rollback-only quote and expense integration checks pass, including access, stale revisions, retries and audit history.
- [x] Product-tag migration 202610160001 previously applied and verified.
- [x] Production migrations 202610110001 and 202610130001 applied atomically and recorded. Private pre-release snapshot saved; existing orders, claims and clients verified unchanged.
- [x] Full web bundle replaces the old partial preview builder. Port 4173 serves all released features with production login. Local auto-login remains confined to the local server on 4174.
- [x] APK built successfully; packaged files match the web bundle, production endpoint/public client key verified, no local login or development-server override included.
- [x] APK signature matches the previous internal APK; version code increased to allow in-place update.
- [ ] Final physical-device acceptance of this exact APK by the owner: sign in, tag save/search, custom-percentage PDF sharing, quote edit and expense export/adjustment.

Distribution: production-connected, debug-signed internal APK using the existing signing identity; not a Play Store release. Do not uninstall the previous production app before updating. Old clients cannot approve/settle adjusted claims and should be updated.

Recovery: retain the previous APK and private pre-release records. Do not remove revision tables or new columns to roll back the client; doing so would discard new history. An older client remains limited for adjusted claims. Restore data only through a reviewed recovery operation, never by blindly overwriting live records.
