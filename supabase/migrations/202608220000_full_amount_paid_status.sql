-- Final payment is distinct from physical delivery. Profit is recognised only
-- once this milestone (or the subsequent Closed status) has been reached.
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders add constraint orders_status_check check (status in (
  'Enquiry', 'Quotation sent', 'Follow-up', 'Confirmed', 'Advance pending',
  'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch',
  'Out for delivery', 'Delivered', 'Full amount paid', 'Closed', 'Lost', 'Cancelled'
));
