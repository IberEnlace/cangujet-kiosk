import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "mdk";
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;

export type ParsedDeviceSecretKey = {
  publicKeyId: string;
  secret: string;
};

export function createDeviceSecretKey() {
  const publicKeyId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return {
    publicKeyId,
    secretKey: `${KEY_PREFIX}_${publicKeyId}_${secret}`,
    secret,
  };
}

export function parseDeviceSecretKey(value: string): ParsedDeviceSecretKey | null {
  const match = value.trim().match(/^mdk_([A-Za-z0-9_-]{12,64})_([A-Za-z0-9_-]{32,128})$/);
  return match ? { publicKeyId: match[1], secret: match[2] } : null;
}

export async function hashDeviceSecret(secret: string, salt = randomBytes(16)) {
  const derived = await derive(secret, salt);
  return [
    "scrypt",
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyDeviceSecret(secret: string, encodedHash: string) {
  const [algorithm, parameters, saltValue, expectedValue] = encodedHash.split("$");
  if (algorithm !== "scrypt" || parameters !== `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}` || !saltValue || !expectedValue) {
    return false;
  }
  try {
    const expected = Buffer.from(expectedValue, "base64url");
    const actual = await derive(secret, Buffer.from(saltValue, "base64url"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function opaqueTokenMatchesHash(value: string, expectedHash: string) {
  const actual = Buffer.from(hashOpaqueToken(value), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derive(secret: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(secret, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEMORY,
    }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}
