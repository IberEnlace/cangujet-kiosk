export const DEVICE_KEY_PREFIX = "mdk";
export const DEVICE_PUBLIC_KEY_ID_PATTERN = /^[a-f0-9]{24}$/;
export const DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DEVICE_SECRET_KEY_PATTERN = /^mdk_([a-f0-9]{24})_([A-Za-z0-9_-]{43})$/;

export type DeviceSecretKeyParts = {
  publicKeyId: string;
  secret: string;
};

export function formatDeviceSecretKey(publicKeyId: string, secret: string) {
  if (!DEVICE_PUBLIC_KEY_ID_PATTERN.test(publicKeyId) || !DEVICE_SECRET_PATTERN.test(secret)) {
    throw new Error("Device key components are invalid.");
  }
  return `${DEVICE_KEY_PREFIX}_${publicKeyId}_${secret}`;
}

export function parseDeviceSecretKeyParts(value: string): DeviceSecretKeyParts | null {
  const match = value.trim().match(DEVICE_SECRET_KEY_PATTERN);
  return match ? { publicKeyId: match[1], secret: match[2] } : null;
}

export function isDeviceSecretKey(value: string) {
  return parseDeviceSecretKeyParts(value) !== null;
}
