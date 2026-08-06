import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDeviceActivationKey, normalizeDeviceActivationKey } from "../../shared/deviceKey";
import { createDeviceActivationKey, hashDeviceActivationKey } from "./deviceActivationKeyService";

const pepperA = "a-production-pepper-that-is-at-least-32-bytes-long";
const pepperB = "a-different-pepper-that-is-at-least-32-bytes-long";
const migration = readFileSync("supabase/migrations/202608040001_device_activation_management.sql", "utf8");
const workspaceMigration = readFileSync("supabase/migrations/202608060001_device_workspace_selection.sql", "utf8");

test("activation keys use server randomness, a paste-friendly grammar, and keyed one-way hashes", () => {
  const first = createDeviceActivationKey();
  const second = createDeviceActivationKey();
  assert.match(first.secretKey, /^MORROW(?:-[A-Z0-9]{4}){6}$/);
  assert.equal(isDeviceActivationKey(first.secretKey), true);
  assert.notEqual(first.secretKey, second.secretKey);
  const hash = hashDeviceActivationKey(first.secretKey, pepperA);
  assert.equal(hash?.length, 43);
  assert.equal(hashDeviceActivationKey(first.secretKey.toLowerCase(), pepperA), hash);
  assert.notEqual(hashDeviceActivationKey(first.secretKey, pepperB), hash);
  assert.equal(hash?.includes(first.secretKey), false);
});

test("activation key formatting normalizes pasted separators without accepting partial keys", () => {
  assert.equal(
    normalizeDeviceActivationKey("morrow abcd efgh jklm npqr stuv wxyz"),
    "MORROW-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ",
  );
  assert.equal(isDeviceActivationKey("MORROW-ABCD"), false);
});

test("migration atomically enforces key lifecycle, installation idempotency, tenant scope, and server-only hashes", () => {
  assert.match(migration, /create table if not exists public\.device_activation_keys/);
  assert.match(migration, /key_hash text not null unique/);
  assert.doesNotMatch(migration, /secret_key\s+text|raw_key\s+text/);
  assert.match(migration, /for update/);
  assert.match(migration, /device_key_expired/);
  assert.match(migration, /device_key_revoked/);
  assert.match(migration, /device_key_used/);
  assert.match(migration, /activation_count >= v_key\.max_activations/);
  assert.match(migration, /unique \(activation_key_id, installation_id\)/);
  assert.match(migration, /foreign key \(branch_id, restaurant_id\)/);
  assert.match(migration, /num_nonnulls\(credential_id, activation_key_id\) = 1/);
  assert.match(migration, /revoke all on public\.device_activation_keys, public\.device_activations from anon, authenticated/);
});

test("workspace selection keeps old fixed keys compatible and assigns new generic keys atomically", () => {
  assert.match(workspaceMigration, /alter column device_type drop not null/);
  assert.match(workspaceMigration, /p_device_type public\.device_type/);
  assert.match(workspaceMigration, /v_key\.device_type is not null and v_key\.device_type <> p_device_type/);
  assert.match(workspaceMigration, /v_device_type := coalesce\(v_key\.device_type, p_device_type\)/);
  assert.match(workspaceMigration, /for update/);
  assert.match(workspaceMigration, /grant execute on function public\.activate_device_key[\s\S]*to service_role/);
});

test("browser provisioning uses one stable installation UUID and contains no invasive fingerprinting", () => {
  const source = readFileSync("src/app/services/device/deviceInstallation.ts", "utf8");
  assert.match(source, /morrow:device-installation-id:v1/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /canvas|userAgent|fingerprintjs|audioContext/i);
});

test("device state machine, heartbeat refresh, setup messages, and provider singleton are wired", () => {
  const context = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
  const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");
  const app = readFileSync("src/app/App.tsx", "utf8");
  for (const state of ["initializing", "unconfigured", "activating", "active", "revoked", "offline", "failed"]) {
    assert.match(context, new RegExp(`\\"${state}\\"`));
  }
  assert.match(context, /service\.heartbeat\(currentConfig\.configVersion/);
  assert.match(setup, /This device key is invalid\./);
  assert.match(setup, /This device key has expired\./);
  assert.match(setup, /This device key has already been used\./);
  assert.match(setup, /This device key has been revoked\./);
  assert.equal((app.match(/<DeviceProvider enabled=/g) ?? []).length, 1);
});
