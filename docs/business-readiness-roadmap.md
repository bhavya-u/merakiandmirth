# Meraki & Mirth: durable business operations checklist

Reviewed 17 October 2026 against the current application, migrations and release notes. This is a proposed roadmap, not a claim that these features are implemented. Priorities favour preventing lost money, broken commitments and unrecoverable mistakes. Implement one vertical workflow at a time; do not turn this small business app into an ERP.

## What already exists

Product/combo creation, catalogue PDFs, quotations, customer/vendor records, order stages, stock movements, expense approval, image optimization and paged operational reads exist. Tags are now enabled in the production-backed preview. Quote revisions and expense adjustments are implemented on the feature branch but still have separate production release work.

Important distinction: the database contains order_payments and order_fulfilment_tasks foundations, but the current app does not expose complete workflows for those tables. Reuse and validate them instead of adding competing ledgers. Profit currently comes from quote total minus a cost snapshot and expenses_total; its “realised” label is selected by order status, not proof of reconciled cash or complete actual costs.

## Implement in this order

### 1. One reliable release path — immediate
- [ ] Replace the hand-assembled preview built from an old commit with a reproducible build and explicit schema-compatible feature flags. Display build identifier and environment in an About panel.
- [ ] Track migration, web build and APK versions together. Release the already-built quote/expense features after their migration and device checks, rather than accumulating more unreleased work.
- [ ] Gate each release on sign-in, product save, quote save/reopen, PDF export and expense tests; retain the previous client bundle. Roll back clients without deleting newly collected data.
**Done when:** the same approved build can be identified on web and phone, and a failed release can be reversed using written steps. This directly addresses repeated “why is localhost different?” incidents.

### 2. Recovery that has actually been rehearsed — immediate
- [ ] Extend the existing backup tooling into a documented recurring operating process for database records, image objects and references; retain encrypted copies outside the production project with restricted access.
- [ ] Restore into an isolated environment and verify record counts, sample images, quotes and access rules. Proposed initial targets: no more than 24 hours of data loss and recovery within one business day; the owner must accept these targets.
- [ ] Include a complete business-data export and document how to access recovery material if the usual laptop is unavailable.
**Done when:** a restore drill succeeds and its date/result are recorded. A downloaded backup alone is insufficient. Account for backup egress and retention before scheduling large downloads.

### 3. Know exactly what clients owe — next business feature
- [ ] Expose the existing payment ledger: advances, partial balances, refunds, date, method and reference, with receipts and outstanding balance per order.
- [ ] Derive payment completion from recorded transactions. Reject duplicate submissions; correct mistakes with traceable reversals instead of rewriting settled history.
- [ ] Show overdue balances and promised payment dates. Keep delivery status separate from payment status.
**Done when:** multiple advances, a partial payment and a refund reconcile exactly to the order balance, and an unpaid order cannot appear paid merely through a status selection.

### 4. Protect pricing and measure actual profit
- [ ] Label the current percentage calculation accurately as markup. Cost × 1.45 is a 45% markup, approximately 31% gross margin before other costs. Do not silently change existing prices to cost ÷ 0.55.
- [ ] Show estimated profit after discounts, packaging, transport and complimentary items before sharing; flag quotes below an owner-defined floor, with a recorded override reason.
- [ ] Link actual purchases and direct expenses to orders and reconcile them against the estimate. Avoid counting both stock purchase cost and consumed-stock cost as order expense.
- [ ] Separate estimated contribution, actual contribution and cash collected; do not label contribution as business net profit without overhead treatment.
**Done when:** a worked example reconciles purchasing, stock consumption, discount, delivery, payment and profit without double counting. Historical accepted quotes retain their cost/pricing snapshots.

### 5. Never promise the same stock twice
- [ ] Add order reservations: on-hand, reserved and available stock; create reservations atomically on confirmation and release them on cancellation.
- [ ] Calculate component quantities from combo quantities, including repeated components where supported; show shortages before confirming delivery.
- [ ] Handle substitutions, damage, returns and partial fulfilment with explicit stock movements and reasons.
**Done when:** two simultaneous confirmations cannot over-reserve stock, retries cannot double-decrement, and cancelling an order releases only its own reservation.

### 6. A daily work list that prevents missed deliveries
- [ ] Turn the existing fulfilment-task foundation into procurement, packing, dispatch and delivery tasks with owner, due date and blocked reason.
- [ ] Add a compact “Today / Next 7 days / Overdue” screen combining tasks, delivery commitments and unpaid balances. Link directly to the action.
- [ ] Record packing checks and handover/delivery evidence only where useful; make reminder retries deduplicated and visible. Human-confirmed copy/share is sufficient initially.
**Done when:** someone other than the founder can see what must happen today and identify the person responsible without reconstructing WhatsApp conversations.

### 7. Procurement matched to confirmed demand
- [ ] Group shortages by vendor; track quantities ordered, promised arrival, actual cost and partial receipts. Receive goods into the existing stock ledger.
- [ ] Show supplier price/lead-time history and a fallback supplier for important products.
**Done when:** a partial supplier delivery updates stock once and the remaining shortage stays visible against affected orders. Start with lightweight purchase records, not a complex procurement suite.

### 8. Follow up on sales without building a CRM
- [ ] Add next follow-up date, responsible person, quote expiry and loss reason to the existing enquiry/order flow.
- [ ] Provide a short follow-up queue and user-initiated WhatsApp copy actions; identify repeat clients without duplicating contacts.
**Done when:** every open enquiry has a next action or explicit closed reason. Report conversion using a defined period/cohort rather than mixing unrelated dates.

### 9. Protect records when the team grows
- [ ] Make owner/staff capabilities explicit for pricing, customer data, refunds, deletion and exports; enforce them server-side and test denial paths.
- [ ] Add revision checks to product edits so one staff member cannot silently overwrite another's changes. Extend existing audit patterns to material price and payment changes.
- [ ] Archive referenced products/clients instead of removing historical meaning; provide a clear correction/recovery path.
**Done when:** stale edits are rejected, staff permissions are demonstrably enforced, and historical orders remain intelligible after catalogue changes.

### 10. Make weak connectivity and growth predictable
- [ ] Preserve unsaved form drafts with clear local-only status, expiry and sign-out cleanup. Never show “saved” until the server confirms it; reuse retry identifiers for writes.
- [ ] Add privacy-safe error reporting and a small operational checklist: failed saves, export failures, quota trend, backup freshness and notification failures. No customer names, images or credentials in diagnostic logs.
- [ ] Measure browsing transfer, export transfer, initial-load latency and interaction responsiveness on a representative Android device. Establish budgets from the measured optimized baseline and fail regressions against it.
- [ ] Move product filtering/pagination server-side only when measured catalogue size/load warrants it; retain thumbnails, lazy loading and stable image URLs. Avoid continuous polling and full-catalogue refreshes after unrelated writes.
**Done when:** an interrupted save can be retried without duplication and a release cannot quietly restore the previous image/egress problem. Free-tier capacity is finite; document the owner's fallback decision if optimized demand exceeds it.

## After these workflows are trustworthy

- [ ] A small monthly owner report: collected revenue, receivables, contribution, stock tied up, repeat clients and on-time deliveries. Define every metric and reconcile it to underlying records before adding charts.
- [ ] Consistent receipt/invoice numbering and accountant-ready exports if the business needs them. Confirm applicable tax requirements with the business's accountant before implementing tax logic; this review is not a tax determination.
- [ ] Tag suggestions/merge aliases and optional bulk tagging once manual tagging becomes a real bottleneck. Do not automatically relabel existing products without review.

## Deliberately defer

AI recommendations/chatbots, customer accounts, payment gateways, automated marketing, multi-warehouse management, elaborate loyalty programmes, full offline synchronization and new storage providers. Revisit only when a measured business need justifies their ongoing cost and support burden.

## Delivery discipline

Each item needs an owner scenario, data model review, one small end-to-end implementation, failure-path tests and owner acceptance on Android before release. No fixed duration is promised from this review: payments, reservation concurrency and cost reconciliation are larger changes; follow-up queues and tag cleanup are smaller. Refine estimates after designing each workflow. The highest-value first product feature is payment/outstanding-balance tracking; release consistency and recovery are prerequisites, not reasons to delay it indefinitely.
