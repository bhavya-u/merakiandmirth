# Product discovery, catalogue cards and claim sharing

## Decisions and sequence

1. Use uniform square image crops, matching the combo detail cards. Remove decorative plus signs entirely so they cannot overlap. Originals and stored variants remain unchanged; this is export-time presentation only.
2. Reuse the existing collection_tags field as general product tags rather than introduce a second tag store. Normalize case/spacing and aliases (bags/bag, addon/add-on). Keep structured product roles for compatibility; include them in the searchable tag vocabulary. Search names and tags in Product Library, combo picker and individual catalogue. No per-keystroke database requests.
3. Copy a concise WhatsApp-ready claim summary to the clipboard; show an honest failure message if copying is unavailable. Never send automatically.
4. Verify the existing extra-amount claim edit workflow: claimant-only, unsettled, reason required, audit snapshot, retry protection and fresh approval. Preserve this scope; original claims and settled accounting records are not overwritten.
5. Run focused tests and local SQL checks, render PDFs with mixed image ratios, review browser controls, refresh compatible previews and push.

## Checklist

- [x] Uniform catalogue image cards; no overlapping plus signs
- [x] Product create/edit accepts reusable tags
- [x] Name/tag search across library, combo picker and gift exports
- [x] WhatsApp claim-copy action with error handling
- [x] Existing claim amount edit verified and labelled clearly
- [x] Tests, local SQL and PDF/browser review complete
- [x] Previews refreshed and changes pushed

## Release boundary

Production schema remains unchanged. General tags reuse the pending 202610160001_product_catalogue_tags migration; claim edits require the pending 202610110001_expense_adjustments migration. Schema-independent PDF and clipboard changes can run in port 4173's compatible preview. Full feature set runs locally on port 4174.

## Verification

48 automated tests passed. Local SQL checks covered claim ownership, audit history, idempotent retries, revision conflicts, reapproval and settled-claim protection. Browser checks verified product tag save/reopen, tag-only search, role/tag catalogue filtering, WhatsApp clipboard output and the edit dialog. Mixed-ratio PDF layouts were rendered and visually inspected; temporary local product and claim records were removed. Production data and stored images were not modified.
