# cangujet Supabase foundation

This repository implements Phases 1–7: the typed browser client, schema/RLS, staff authentication, shared menu repository and seed tooling, and secure order creation. Realtime, Nori persistence, Storage, and payment-provider integration remain deferred.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from Supabase **Project Settings → API**.
3. Never put a service-role key, database password, or AI-provider key in a `VITE_` variable.
4. Run `supabase db push`, or apply `supabase/migrations` in timestamp order.

If either browser variable is absent, the app logs a development warning and retains the existing local staff credentials. This preserves the demo; it is not a production authentication mode.

The Express runtime separately requires `SUPABASE_URL` and either
`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. The process that runs
`npm run dev:server` or `npm run start:server` must be allowed to resolve the
configured Supabase hostname and make outbound HTTPS connections on port 443.
Successful browser authentication does not verify this server-side path. An
`EACCES` transport code means the Node process is blocked by its execution
sandbox, firewall, or service policy; restart it in an environment with
outbound HTTPS permission. Retrying requests or changing credentials does not
repair an `EACCES` denial.

## Authentication setup

Disable public signup in Supabase Auth. Create staff through the dashboard or a future trusted admin workflow, then insert a matching profile:

```sql
insert into public.profiles (id, full_name, role, branch_id)
values ('AUTH_USER_UUID', 'Staff member', 'cashier', 'BRANCH_UUID');
```

The app restores the session, reads the protected profile, verifies `is_active`, and confirms its role matches the requested Admin, Cashier, or Kitchen workspace. Invalid or mismatched sessions are signed out. Customer kiosk and public display routes remain public.

Add localhost and the production Vercel URL under **Authentication → URL Configuration**. Configure the two public variables in Vercel for Preview and Production and redeploy.

## Authorization model

Every application table has RLS enabled. Authorization derives from `auth.uid()` and protected profile data through `current_user_role()`, `current_user_branch_id()`, and `is_admin()`.

- Anonymous users can only read active categories, available products, and available customizations.
- Anonymous order-table access is revoked. `public_order_status()` exposes only order number and public status.
- Admins manage menu and branch data. Profile writes require a future trusted server workflow.
- Cashiers read their branch and can create cashier orders tied to their identity.
- Kitchen users read their branch orders. Narrow status-update RPCs come in the orders phase.
- Nori has no anonymous database write access; persistence will use the server or an Edge Function.

## Remaining security work

- Create branch-safe operational RPCs and scoped realtime publication.
- Create staff/profile administration through a trusted server boundary.
- Define and automate Nori retention before enabling transcript persistence.
- Review Auth password rules, redirect allowlists, and audit logging.

The existing Node Nori provider boundary remains appropriate because AI keys stay server-side. The curated menu JSON remains the fallback, and `products.id` is text so the later idempotent seed can preserve stable Nori/cart identifiers.

## Operational notification email delivery

Apply `202607240002_notification_email_delivery.sql` and
`202607240003_operational_notifications.sql`, create and verify a sending domain
in Resend, then configure server-side Edge Function secrets:

```sh
supabase secrets set RESEND_API_KEY=...
supabase secrets set MORROW_NOTIFICATION_FROM_EMAIL=notifications@your-verified-domain.example
supabase secrets set MORROW_NOTIFICATION_FROM_NAME=cangujet
supabase secrets set MORROW_NOTIFICATION_INTERNAL_SECRET=a-random-value-of-at-least-24-characters
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
supabase functions deploy send-notification-email
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy device-heartbeat --no-verify-jwt
supabase functions deploy resend-webhook --no-verify-jwt
```

Never place these values in `VITE_` variables. `sent` means Resend accepted a
message; `delivered`, `delayed`, `failed`, `bounced`, and `complained` come from
the signed webhook.

The Admin UI sends manual reports and test messages to the same-origin Express
routes `/api/v1/admin/notifications/daily-report` and
`/api/v1/admin/notifications/test`. Express validates the Supabase access token,
requires an active branch administrator, and then calls the Edge Function with
server-only credentials. The browser must not call `send-notification-email`
directly.

Store the processor URL and the same internal secret in Supabase Vault before
applying the operational migration (or before the first cron run):

```sql
select vault.create_secret(
  'https://PROJECT_REF.supabase.co/functions/v1/process-notifications',
  'morrow_notification_processor_url'
);
select vault.create_secret(
  'THE_SAME_INTERNAL_SECRET',
  'morrow_notification_internal_secret'
);
```

The migration installs a `morrow-process-notifications` Supabase Cron job at
`*/5 * * * *`. It calls the processor through `pg_net`; the command reads its
URL and header value from Vault at execution time. Daily reports run in the
five-minute window beginning at `daily_report_time` in `branches.timezone`.
They cover the preceding local scheduled-time-to-scheduled-time business day.
Weekly reports cover Monday 00:00 through the following Monday 00:00 in branch
time. UTC storage plus unique local-period rows prevents duplicate runs through
DST transitions.

Configure this Resend webhook URL and select delivered, failed, bounced,
delivery-delayed, and complained events:

```text
https://PROJECT_REF.supabase.co/functions/v1/resend-webhook
```

Copy its signing secret into `RESEND_WEBHOOK_SECRET`. The endpoint rejects
missing, stale, or invalid Svix signatures and processes provider event IDs
idempotently.

Operational events must be inserted by trusted server workflows into
`notification_events`; database and browser code never calls Resend. Use a
stable event key such as `order_failure:{attempt}:{safe_code}`. Payment alerts
must remain unused until a real trusted payment integration inserts a failure
event. Devices call `device-heartbeat` with the internal header. Five minutes
without a heartbeat creates one offline incident; three consecutive sync
failures create one sync alert. A successful heartbeat clears the incident.

To verify deployment:

1. Send the existing test email and confirm separate delivery-log rows.
2. Use **Send Daily Report Now** and compare totals with branch orders.
3. Insert one safe order-failure event, run the processor, then repeat the same
   event key and confirm no second email.
4. Stop a test device heartbeat for over five minutes and confirm one offline
   alert; restore it and confirm its incident state clears.
5. Submit three failed sync heartbeats and confirm the threshold behavior.
6. Inspect `cron.job_run_details`, `notification_report_runs`,
   `notification_events`, and `notification_delivery_logs`.
7. Send a Resend test webhook and confirm the provider status changes.

To disable all operational notifications safely, turn off every notification
toggle for each branch. For an emergency global stop, unschedule the processor:

```sql
select cron.unschedule('morrow-process-notifications');
```

This preserves queued events and history. Reapply the same `cron.schedule`
statement from the migration to resume processing.

## Menu seed

The canonical local menu currently contains 10 categories, 37 stable products, 111 customization groups, and 313 options.

Set the server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in your shell, then run:

```sh
npm run supabase:seed-menu
npm run supabase:verify-menu
```

Never expose `SUPABASE_SECRET_KEY` through a `VITE_` variable. The seed controls the canonical menu fields, nutrition, availability, metadata, customization rows, and image references. Review production-owned edits before rerunning it. It uses upserts on category slug, product ID, product/group source ID, and group/option source ID.

The browser prefers a complete valid Supabase menu, caches it briefly, deduplicates concurrent requests, and falls back to the complete local JSON. Partial remote and local records are never merged.

## Secure order creation

Apply `202607230003_menu_metadata_secure_order_creation.sql`, then set `VITE_MORROW_BRANCH_CODE=MAIN`. The migration adds a development `MAIN` branch only when that code does not already exist; review its `Europe/Istanbul` timezone and 8% example tax rate before production.

`create_order(branch_id, source, order_type, items, customer_note, idempotency_key)` is a narrowly scoped security-definer RPC because anonymous kiosks cannot insert through RLS. It validates branch, caller/source, quantities, products, customization ownership and selection counts, then calculates prices, branch-configured tax, snapshots, order, and lines in one transaction. Direct cashier inserts are removed. Payment status starts as `unpaid`.
