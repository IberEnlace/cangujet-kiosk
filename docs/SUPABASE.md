# MORROW Supabase foundation

This repository implements Phases 1–7: the typed browser client, schema/RLS, staff authentication, shared menu repository and seed tooling, and secure order creation. Realtime, Nori persistence, Storage, and payment-provider integration remain deferred.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from Supabase **Project Settings → API**.
3. Never put a service-role key, database password, or AI-provider key in a `VITE_` variable.
4. Run `supabase db push`, or apply `supabase/migrations` in timestamp order.

If either browser variable is absent, the app logs a development warning and retains the existing local staff credentials. This preserves the demo; it is not a production authentication mode.

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
