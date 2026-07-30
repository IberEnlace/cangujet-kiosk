import { createClient } from "@supabase/supabase-js";
import type { Database, DeviceType } from "../src/lib/supabase/database.types";
import { createDeviceSecretKey, hashDeviceSecret } from "../src/server/services/deviceCredentialService";

const args = parseArguments(process.argv.slice(2));
const restaurantSlug = required(args, "restaurant-slug").toLowerCase();
const branchCode = required(args, "branch-code").toUpperCase();
const name = required(args, "name");
const type = (args.get("type") ?? "kiosk") as DeviceType;
const validTypes: DeviceType[] = ["kiosk", "cashier_terminal", "kitchen_display", "order_display", "admin_terminal"];
if (!validTypes.includes(type)) throw new Error(`--type must be one of: ${validTypes.join(", ")}`);

const url = process.env.SUPABASE_URL?.trim();
const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const client = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const restaurantResult = await client.from("restaurants").select("id").eq("slug", restaurantSlug).maybeSingle();
if (restaurantResult.error) throw new Error(`Restaurant lookup failed: ${restaurantResult.error.message}`);
if (!restaurantResult.data) throw new Error(`Restaurant ${restaurantSlug} was not found.`);

const branchResult = await client.from("branches")
  .select("*")
  .eq("restaurant_id", restaurantResult.data.id)
  .eq("code", branchCode)
  .maybeSingle();
if (branchResult.error) throw new Error(`Branch lookup failed: ${branchResult.error.message}`);
if (!branchResult.data || !branchResult.data.is_active) {
  throw new Error(`Active branch ${branchCode} was not found for restaurant ${restaurantSlug}.`);
}

const deviceId = args.get("device-id");
const devicePayload = {
  restaurant_id: branchResult.data.restaurant_id,
  branch_id: branchResult.data.id,
  device_type: type,
  name,
  status: "active" as const,
};
const deviceResult = deviceId
  ? await client.from("devices").update(devicePayload).eq("id", deviceId).select("*").single()
  : await client.from("devices").insert(devicePayload).select("*").single();
if (deviceResult.error || !deviceResult.data) {
  throw new Error(`Device provisioning failed: ${deviceResult.error?.message ?? "unknown error"}`);
}

const generated = createDeviceSecretKey();
const credentialResult = await client.from("device_credentials").insert({
  device_id: deviceResult.data.id,
  public_key_id: generated.publicKeyId,
  secret_hash: await hashDeviceSecret(generated.secret),
  expires_at: expiration(args.get("expires-days")),
}).select("id").single();
if (credentialResult.error) throw new Error(`Credential provisioning failed: ${credentialResult.error.message}`);

console.log(JSON.stringify({
  deviceId: deviceResult.data.id,
  restaurantId: deviceResult.data.restaurant_id,
  branchId: deviceResult.data.branch_id,
  deviceType: deviceResult.data.device_type,
  deviceName: deviceResult.data.name,
  credentialId: credentialResult.data.id,
}, null, 2));
console.log("\nDevice secret key (shown once; store it securely):");
console.log(generated.secretKey);

function parseArguments(values: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, "");
    const value = values[index + 1];
    if (!key || !value || values[index][0] !== "-") throw new Error("Arguments must use --name value.");
    parsed.set(key, value);
  }
  return parsed;
}

function required(values: Map<string, string>, key: string) {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function expiration(rawDays: string | undefined) {
  if (!rawDays) return null;
  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("--expires-days must be between 1 and 3650.");
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
