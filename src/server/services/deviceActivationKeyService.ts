import { createHmac, randomBytes } from "node:crypto";
import { isDeviceActivationKey, normalizeDeviceActivationKey } from "../../shared/deviceKey";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createDeviceActivationKey() {
  const random = randomBytes(24);
  let body = "";
  for (let index = 0; index < 24; index += 1) body += ALPHABET[random[index] & 31];
  const secretKey = `MORROW-${body.match(/.{4}/g)!.join("-")}`;
  return { secretKey, keyHint: body.slice(-4) };
}

export function hashDeviceActivationKey(secretKey: string, pepper: string) {
  const normalized = normalizeDeviceActivationKey(secretKey);
  if (!isDeviceActivationKey(normalized)) return null;
  if (Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error("MORROW_DEVICE_KEY_PEPPER must contain at least 32 bytes.");
  }
  return createHmac("sha256", pepper).update(normalized, "utf8").digest("base64url");
}
