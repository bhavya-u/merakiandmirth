-- Telegram notifications are queued in the database, so they are not lost when
-- an admin closes the web page or Android app immediately after an update.
alter table public.operation_notifications
  drop constraint if exists operation_notifications_status_check;

alter table public.operation_notifications
  add constraint operation_notifications_status_check
  check (status in ('pending', 'processing', 'sent', 'failed'));

alter table public.operation_notifications
  add column if not exists processing_started_at timestamptz;

create index if not exists operation_notifications_processing_idx
  on public.operation_notifications (processing_started_at)
  where status = 'processing';

-- Claims a small batch with SKIP LOCKED, preventing two app sessions or the
-- scheduled processor from sending the same Telegram message twice.
create or replace function public.claim_operation_notifications(p_limit integer default 25)
returns table (id uuid, message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.operation_notifications
     set status = 'pending',
         processing_started_at = null,
         failure_reason = 'Retrying after an interrupted delivery attempt.'
   where status = 'processing'
     and processing_started_at < now() - interval '10 minutes';

  return query
  with queued as (
    select notification.id
      from public.operation_notifications notification
     where notification.channel = 'telegram'
       and notification.status = 'pending'
     order by notification.created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.operation_notifications notification
     set status = 'processing',
         processing_started_at = now()
    from queued
   where notification.id = queued.id
  returning notification.id, notification.message;
end;
$$;

revoke all on function public.claim_operation_notifications(integer) from public;

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
    'Client: %s\nCelebration: %s\nCurated set: %s\nQuantity: %s curated sets\nQuote total: ₹%s\nDelivery: %s%s',
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
       and new.status in ('Confirmed', 'Advance pending', 'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch', 'Out for delivery', 'Delivered', 'Full amount paid', 'Closed') then
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

drop trigger if exists orders_telegram_notifications on public.orders;
create trigger orders_telegram_notifications
after insert or update of status on public.orders
for each row execute function public.queue_order_telegram_notification();

-- A five-minute safety net delivers queued messages even if a device closes
-- before it can call the Edge Function after a successful save.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'telegram-operational-notifications-every-five-minutes'
  ) then
    perform cron.schedule(
      'telegram-operational-notifications-every-five-minutes',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'meraki_mirth_cron_project_url') || '/functions/v1/telegram-notifications',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'meraki_mirth_cron_publishable_key')
          ),
          body := jsonb_build_object('source', 'supabase-cron'),
          timeout_milliseconds := 10000
        );
      $job$
    );
  end if;
end;
$$;
