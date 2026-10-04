-- A confirmed celebration is simply waiting for its advance. Keep that
-- operational fact in the workflow rather than exposing a redundant status.
-- "Dropped" replaces the older, less specific "Cancelled" terminal state.

update public.orders
set status = 'Confirmed'
where status = 'Advance pending';

update public.orders
set status = 'Dropped'
where status = 'Cancelled';

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders add constraint orders_status_check check (status in (
  'Enquiry', 'Quotation sent', 'Follow-up', 'Confirmed', 'Advance paid',
  'Procurement', 'Packaging', 'Ready for dispatch', 'Out for delivery',
  'Delivered', 'Full amount paid', 'Closed', 'Lost', 'Dropped'
));

create or replace function public.queue_order_telegram_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_name text := coalesce(nullif(new.customer_name, ''), 'Client not added');
  combo_name text := coalesce(nullif(new.items -> 0 ->> 'comboName', ''), new.title);
  delivery_date text := coalesce(to_char(new.delivery_date, 'DD Mon YYYY'), 'Not set');
  delivery_area text := nullif(new.delivery_area, '');
  order_details text := format(
    E'Client: %s\nCelebration: %s\nCurated set: %s\nQuantity: %s curated sets\nQuote total: ₹%s\nDelivery: %s%s',
    client_name,
    new.title,
    combo_name,
    new.qty,
    to_char(new.total, 'FM999G999G999G990D00'),
    delivery_date,
    case when delivery_area is null then '' else E'\nDelivery area: ' || delivery_area end
  );
begin
  if tg_op = 'INSERT' and new.status = 'Quotation sent' then
    insert into public.operation_notifications (order_id, event_type, message)
    values (new.id, 'quote_shared', 'Meraki & Mirth — Quote shared' || E'\n\n' || order_details)
    on conflict (order_id, event_type, channel) do nothing;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status in ('Enquiry', 'Quotation sent', 'Follow-up')
       and new.status in ('Confirmed', 'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch', 'Out for delivery', 'Delivered', 'Full amount paid', 'Closed') then
      insert into public.operation_notifications (order_id, event_type, message)
      values (new.id, 'order_converted', 'Meraki & Mirth — Order converted' || E'\n\n' || order_details || E'\nCurrent stage: ' || new.status)
      on conflict (order_id, event_type, channel) do nothing;
    end if;

    if new.status = 'Advance paid' then
      insert into public.operation_notifications (order_id, event_type, message)
      values (new.id, 'advance_paid', 'Meraki & Mirth — Advance payment received' || E'\n\n' || order_details || E'\nAdvance status: marked paid')
      on conflict (order_id, event_type, channel) do nothing;
    end if;

    if new.status = 'Full amount paid' then
      insert into public.operation_notifications (order_id, event_type, message)
      values (new.id, 'final_amount_paid', 'Meraki & Mirth — Final amount received' || E'\n\n' || order_details || E'\nPayment status: full amount paid')
      on conflict (order_id, event_type, channel) do nothing;
    end if;

    if new.status = 'Closed' then
      insert into public.operation_notifications (order_id, event_type, message)
      values (new.id, 'order_closed', 'Meraki & Mirth — Order successfully closed' || E'\n\n' || order_details || E'\nStatus: completed and closed')
      on conflict (order_id, event_type, channel) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.queue_order_telegram_notification() from public;
