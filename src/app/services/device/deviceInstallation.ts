export const DEVICE_INSTALLATION_ID_STORAGE_KEY = "morrow:device-installation-id:v1";

export function getDeviceInstallationId() {
  const existing = localStorage.getItem(DEVICE_INSTALLATION_ID_STORAGE_KEY);
  if (existing && /^[A-Za-z0-9._:-]{8,200}$/.test(existing)) return existing;
  const installationId = crypto.randomUUID();
  localStorage.setItem(DEVICE_INSTALLATION_ID_STORAGE_KEY, installationId);
  return installationId;
}
