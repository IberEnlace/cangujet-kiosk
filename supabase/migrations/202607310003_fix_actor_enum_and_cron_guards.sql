-- Migration: 202607310003_fix_actor_enum_and_cron_guards.sql
-- Description: Adds 'staff' to public.order_actor_type enum if missing and guards pg_cron notification URL calls.

-- 1. Ensure 'staff' value exists in public.order_actor_type enum
do $$ begin
  alter type public.order_actor_type add value if not exists 'staff';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- 2. Guard pg_cron scheduled notification processing against null Vault secret URL
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unschedule existing job if present
    perform cron.unschedule('morrow-process-notifications');

    -- Re-schedule with explicit non-null & non-empty URL guard
    perform cron.schedule(
      'morrow-process-notifications',
      '*/5 * * * *',
      $cron$
      do $$
      declare
        v_url text;
      begin
        select decrypted_secret into v_url from vault.decrypted_secrets where name = 'morrow_notification_processor_url' limit 1;
        if v_url is not null and trim(v_url) <> '' then
          perform net.http_post(
            url := v_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-morrow-internal-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'morrow_notification_internal_secret' limit 1), '')
            ),
            body := '{}'::jsonb
          );
        end if;
      exception
        when others then null;
      end $$;
      $cron$
    );
  end if;
exception
  when others then null;
end $$;
