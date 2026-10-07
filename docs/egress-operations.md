# Egress operating procedure

Official reference checked 7 October 2026: https://supabase.com/docs/guides/platform/manage-your-usage/egress
Free currently includes separate 5 GB cached and 5 GB uncached quotas. CDN hits still count; browser reuse avoids the transfer. These figures are not an entitlement to unlimited free availability. Recheck the dashboard and pricing before rollout.

## Review and response

Use the organization's Usage dashboard and select the correct cycle/project. Review all-project usage too: the organization is the quota boundary. Record cached GB, uncached GB, elapsed cycle days and cycle length in an external operations note. Do not mix a combined total with the separate uncached metric. Confirm the actual reset date rather than assuming a calendar month.

Review daily during the first week after rollout and weekly once stable. This is a procedure, not an installed automation. No account credentials or dashboard polling are embedded in the app.

Run `node scripts/egress-budget.mjs <cachedGB> <uncachedGB> <elapsedDays> <cycleDays>`. It calculates each category separately. Projected use above 2.5 GB calls for investigation; actual use at 4 GB is urgent; 5 GB is quota reached. Linear projections in the first three days are weak evidence. Compare against activity (users, visits and exports), not just a single day.

At investigation: inspect high-request Storage paths and database query frequency, identify cache-busting URLs, repeated export requests, public hotlinks or unexpected polling. At urgent: keep all testing local, pause nonessential bulk jobs and large exports operationally, and investigate before resuming them. Do not silently disable core business writes. Quota errors should show a clear retry message; a cooldown is not a quota cap.

Keep email notifications enabled. Dashboard alerts/this calculator do not enforce a spending cap, reserve bandwidth, reverse already used egress or guarantee that restrictions will not occur. Do not upgrade a plan to resolve a quota incident without the user's explicit spending decision.

## Data-saving mode review

The default flow already uses 240px thumbnails, loads images only near the viewport and requests larger variants for detail/export. A second toggle would add state and regression paths without measured evidence that it is needed. Keep this efficient default for now. Revisit if actual traffic shows card images still dominate or users need metered-network controls. If added later, change browsing image size only; never silently reduce PDF quality. No service worker business-data cache is introduced.
