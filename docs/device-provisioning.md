# Production device provisioning

## Architecture

Device activation is a server-mediated flow. An authenticated administrator creates an activation key through `POST /api/v1/admin/device-activation-keys`. The API generates 120 random bits, encodes them as `MORROW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, returns the raw key once, and stores only an HMAC-SHA256 digest made with `MORROW_DEVICE_KEY_PEPPER`.

The browser creates one non-invasive installation ID with `crypto.randomUUID()` and stores it under `morrow:device-installation-id:v1`. `POST /api/v1/device/activate` hashes the submitted key and calls the atomic `activate_device_key` database function. That function locks the key row, validates its tenant, branch, device type, expiration, revocation state, activation policy, and activation count, then creates the device or returns the existing device for an idempotent repeat from the same installation.

Activation issues the existing signed, short-lived device JWT and a 30-day opaque refresh token. The access token is held in `sessionStorage`; the refresh token is an HttpOnly, SameSite Strict cookie scoped to `/api/v1`. Only public bootstrap configuration is cached in `localStorage`. Raw activation keys, access tokens, refresh tokens, authorization headers, and key hashes are never logged or returned by bootstrap.

## Required server environment

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `MORROW_DEVICE_TOKEN_SECRET` (at least 32 bytes)
- `MORROW_DEVICE_KEY_PEPPER` (at least 32 bytes and independent of the token secret)
- `MORROW_DEVICE_ACCESS_TOKEN_TTL_SECONDS` (defaults to 900)

These values must not use a `VITE_` prefix. Production must route same-origin `/api` requests to the Express service over HTTPS.

## Endpoints

Device endpoints:

- `POST /api/v1/device/activate`
- `GET /api/v1/device/bootstrap`
- `GET /api/v1/device/menu`
- `POST /api/v1/device/heartbeat`
- `POST /api/v1/device/logout`
- `POST /api/v1/devices/session/refresh`
- `POST /api/v1/devices/register` (legacy pre-provisioned `mdk_` credentials)

Administrator endpoints require a valid Supabase staff JWT and an active restaurant-admin membership:

- `GET /api/v1/admin/devices`
- `POST /api/v1/admin/device-activation-keys`
- `POST /api/v1/admin/device-activation-keys/:keyId/revoke`
- `PATCH /api/v1/admin/devices/:deviceId`
- `POST /api/v1/admin/devices/:deviceId/revoke-session`
- `POST /api/v1/admin/devices/:deviceId/refresh-configuration`

## Database rollout

Apply, in timestamp order:

1. `202608040000_device_revoked_status.sql`
2. `202608040001_device_activation_management.sql`

The first migration is separate because PostgreSQL requires a newly added enum value to commit before later schema objects use it. The second migration adds activation keys, installation bindings, device lifecycle fields, session/key linkage, audit linkage, RLS/revokes, indexes, configuration-version behavior, and the atomic activation function.

Before deploying:

```sh
npx supabase migration list
npx supabase db push --dry-run
```

Never run a remote database reset. After migration deployment, deploy the Express API with the new pepper, then deploy the web bundle. Existing `mdk_` credentials and active device sessions remain supported.

## Runtime sequence

1. `POST /api/v1/device/activate` → `201`, access token + public bootstrap, refresh cookie set.
2. The setup component clears the key state and shows the configuration steps.
3. The assigned workspace opens from the server-authoritative device type.
4. `POST /api/v1/device/heartbeat` reports the current configuration version.
5. When the version changes, `GET /api/v1/device/bootstrap` refreshes safe public configuration.
6. On page reload, `POST /api/v1/devices/session/refresh` restores an access token, then bootstrap validates the device.

Revoked or disabled devices cannot refresh, heartbeat, bootstrap, load menus, or call role-restricted order endpoints. A network outage preserves the activation and cached public configuration, but mutation APIs still reject offline operations.
