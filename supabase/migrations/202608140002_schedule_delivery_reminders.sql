-- The API URL and publishable key are stored in Supabase Vault before this migration runs.
-- The job invokes the JWT-protected Edge Function each hour without exposing either value.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'delivery-reminders-hourly'
  ) then
    perform cron.schedule(
      'delivery-reminders-hourly',
      '0 * * * *',
      $job$
        select net.http_post(
          url := (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'meraki_mirth_cron_project_url'
          ) || '/functions/v1/delivery-reminders',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'meraki_mirth_cron_publishable_key'
            )
          ),
          body := jsonb_build_object('source', 'supabase-cron'),
          timeout_milliseconds := 10000
        );
      $job$
    );
  end if;
end;
$$;
