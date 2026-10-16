# Expense and catalogue enhancements

Branch: feature/expense-export-and-combo-pdf. Production rollout is not included in this checkpoint.

- [x] Optional discount type saved in the existing quotation JSON and shown in preview, exports and order detail.
- [x] One combo per catalogue page, complete 1–12 product gallery, larger tiles and contained aspect ratios. Existing optimized export images are reused; originals are not requested. Native rendering increases tile resolution to at most 720 px with three concurrent preload tasks.
- [x] Excel settlement export, current-month claim-date range by default (India time), explicit all-history option, summary and complete detail sheets. Text remains text, monetary values remain numbers, and summaries use integer cents. The workbook is generated on the device and supports browser download/native sharing.
- [x] RLS-scoped snapshot RPC avoids inconsistent paged exports. Exports exceeding 10,000 claims are refused with a smaller-range instruction. Export occurs only on request and the Excel library loads lazily.
- [x] Claimant-only extra-amount adjustment, reason, original amount preservation, append-only application audit history, transaction receipts for retries, revision conflicts and approval reset. Settled claims are immutable through the adjustment RPC.
- [x] Versioned review and settlement endpoints reject stale screens. Legacy endpoints refuse adjusted claims so an older app cannot approve an unseen changed amount.
- [x] Local rollback-only integration and workbook serialization checks. Native PDF layout samples cover 1, 3, 6 and 12 products. Isolated local APK built.
- [ ] User verifies Excel opening/sharing and PDF readability on their Android phone.
- [ ] Apply the new migration to production, then distribute the production client, after review/testing approval.

## Review notes

The additional amount field is an absolute extra total, not an increment. Reducing or removing an extra amount also requires a reason and reapproval. Rejected, unsettled claims can be amended by their claimant and return to pending. Descriptions, mileage rates, original amounts and settled records cannot be rewritten through this feature.

The export date filter is the claim creation date, not settlement date. The summary is explicitly scoped to that range. No third-party service receives workbook contents. A file already downloaded/shared cannot be revoked on sign-out; an export still being prepared is cancelled if the app session changes.

Deployment order matters: apply 202610110001_expense_adjustments.sql before the new app. Keep the previous app bundle available; older clients cannot review or settle adjusted claims and must update. The isolated preview uses port 4174; the existing production-backed preview on 4173 is left unchanged.

## Dependency review

ExcelJS is pinned at 4.4.0 and used only for workbook generation, not opening untrusted workbooks. Its transitive uuid advisory concerns buffer-based v3/v5/v6 operations; this export path does not use those APIs. Compatible patches were applied to the existing Capacitor Android runtime, DOMPurify and xmldom dependencies. npm audit still reports existing development-tool findings (including the old tar dependency under @capacitor/assets), and uuid findings. This checkpoint does not claim a clean dependency audit; do not run a forced downgrade/upgrade as part of release without separate compatibility review.

## Edit saved quotations

- Implemented Orders → View details → Edit quotation for Enquiry, Quotation sent and Follow-up. Confirmed/fulfilment orders are protected.
- Reuses the quote form, updates the same ID/code, preserves historical unit cost and price unless the margin/combo changes, and retains prior database rows in member-only quotation_revisions.
- Atomic RPC rejects stale full-row snapshots and deduplicates retried saves. Status, original quote timestamp, expenses and ownership are retained.
- Legacy card-addon quotes are blocked from editing because the current form cannot represent those fields safely. A removed combo must be restored first.
- Already shared PDFs/messages are static: download and resend after saving changes. Revision history is stored for recovery; no history/restore UI is included.
- 37 Node tests pass; local SQL covers update identity, audit snapshot, retry, stale edit, confirmed status and access denial. Production migration and device/browser acceptance remain before release.
- Deploy 202610130001_quote_revisions.sql before the updated client. No production changes made for this feature.

## Individual gift catalogue

- Catalogue Studio now has an individual product catalogue: inclusive selling-price range, occasion, role, collection tag and India date-added filters; selection and select-all; optional client name; price visibility toggle defaults on.
- Selling price is round((base cost + buffer) × 1.45), without intermediate rounding. Budget filters use the same price even when the PDF hides prices. Product role and comma-separated collection tags are editable in Product Library. Existing products remain unclassified.
- Two large photos per A4 page; optimized export images, per-export deduplication, maximum 100 selected products. Supplier/cost/buffer metadata is excluded from client PDFs. No extra metadata queries on filter changes. Failed image loading aborts export rather than silently dropping a stored photo.
- 42 Node tests pass, including filter intersections, India date boundaries, markup rounding, tag normalization, PDF pagination and price omission. Local migration and metadata update verified. Browser selection/export verified with a four-page, eight-product PDF and no prices. Price-on and price-off PDF layouts visually inspected.
- Apply 202610160001_product_catalogue_tags.sql before deploying the updated client. Applied to local test database only; production and the production-backed port 4173 remain unchanged. Local preview: port 4174. Native Android share remains to be checked on a device as part of release acceptance.
