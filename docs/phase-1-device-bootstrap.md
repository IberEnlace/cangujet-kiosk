# Phase 1 device bootstrap operations

## Required server environment

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (server process and provisioning only)
- `MORROW_DEVICE_TOKEN_SECRET` (at least 32 random bytes)
- `MORROW_DEVICE_ACCESS_TOKEN_TTL_SECONDS` (defaults to `900`)

None of these values belong in a `VITE_` variable or a browser bundle.

`npm run dev` loads the server values from `.env`, starts the API on port `8787`, and proxies the Vite `/api` path to that server. Production must route the same-origin `/api` path to the Express server; the device client intentionally uses relative API URLs so its HttpOnly refresh cookie remains same-origin.

## Provisioning

Apply `supabase/migrations/202607300001_production_device_identity_bootstrap.sql`, then create a device credential from a trusted operator machine:

```sh
npm run devices:provision -- --restaurant-slug morrow --branch-code MAIN --name "Main Kiosk 01" --type kiosk
```

The command stores only a scrypt hash and prints the raw `mdk_...` secret once. Put that value into the existing kiosk setup screen and store any operator copy in an approved secret manager.

Optional arguments:

- `--device-id <uuid>` updates an existing device before issuing an additional credential.
- `--expires-days <1-3650>` sets a credential expiry.
- `--type` accepts `kiosk`, `cashier_terminal`, `kitchen_display`, `order_display`, or `admin_terminal`.

Disable a device by setting `devices.status` to `disabled`. Revoke one credential by setting `device_credentials.revoked_at`; revoke an individual session through the device session endpoint.

## HTTP contract

- `POST /api/v1/devices/register`
- `POST /api/v1/devices/session/refresh`
- `DELETE /api/v1/devices/session`
- `GET /api/v1/device/bootstrap`

Registration returns a short-lived access token and sets the refresh token as an HttpOnly, SameSite Strict cookie. The browser keeps the access token in session storage and caches only the public bootstrap in local storage.

The kiosk reloads bootstrap on startup and polls it every 60 seconds. Each device request times out after 12 seconds. Startup failures display retry and device-setup actions instead of leaving the loading screen active. Configuration triggers increment the device `config_version`; a changed version replaces the active public configuration without changing the kiosk UI.
