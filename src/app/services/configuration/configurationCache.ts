import type { CachedMenuConfiguration } from "../../types/bootstrap";

const CACHE_PREFIX = "morrow:runtime-menu:v1:";

export function readMenuConfigurationCache(deviceId: string, menuId: string): CachedMenuConfiguration | null {
  try {
    const raw = localStorage.getItem(cacheKey(deviceId, menuId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isCachedMenu(value) || value.deviceId !== deviceId || value.menuId !== menuId) {
      localStorage.removeItem(cacheKey(deviceId, menuId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeMenuConfigurationCache(value: CachedMenuConfiguration) {
  try {
    localStorage.setItem(cacheKey(value.deviceId, value.menuId), JSON.stringify(value));
  } catch {
    // A kiosk can continue online when persistent storage is unavailable.
  }
}

export function clearMenuConfigurationCache(deviceId: string, menuId: string) {
  try { localStorage.removeItem(cacheKey(deviceId, menuId)); } catch { /* Storage may be unavailable. */ }
}

function cacheKey(deviceId: string, menuId: string) {
  return `${CACHE_PREFIX}${deviceId}:${menuId}`;
}

function isCachedMenu(value: unknown): value is CachedMenuConfiguration {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CachedMenuConfiguration>;
  return typeof candidate.deviceId === "string"
    && typeof candidate.menuId === "string"
    && Number.isInteger(candidate.menuVersion)
    && Number.isInteger(candidate.configVersion)
    && typeof candidate.cachedAt === "string"
    && Boolean(candidate.menu)
    && Array.isArray(candidate.menu?.categories)
    && Array.isArray(candidate.menu?.products);
}
