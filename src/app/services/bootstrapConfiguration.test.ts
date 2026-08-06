import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedMenu } from "./supabase/menuModels";
import { DEVICE_ACCESS_TOKEN_STORAGE_KEY } from "./device/DeviceConfigurationService";
import { MenuConfigurationService } from "./configuration/MenuConfigurationService";
import {
  readMenuConfigurationCache,
  writeMenuConfigurationCache,
} from "./configuration/configurationCache";
import { invalidateMenuCache } from "./supabase/menuService";
import type { KioskDeviceConfig } from "../types/device";
import { createBootstrapSnapshot } from "../context/BootstrapContext";
import { RestaurantConfigurationService } from "./configuration/RestaurantConfigurationService";
import { BranchConfigurationService } from "./configuration/BranchConfigurationService";
import { SettingsService } from "./configuration/SettingsService";
import type { DeviceBootstrap } from "../../shared/deviceBootstrap";

const MENU: NormalizedMenu = {
  currency: "TRY",
  categories: [{
    id: "category-1",
    slug: "burgers",
    name: "Burgers",
    description: "",
    image: "",
    displayOrder: 0,
    active: true,
  }],
  products: [{
    id: "product-1",
    name: "Classic",
    slug: "classic",
    description: "",
    category: "burgers",
    price: 250,
    currency: "TRY",
    image: "",
    calories: 500,
    protein: 25,
    carbohydrates: 40,
    fat: 20,
    fiber: 2,
    sugars: 4,
    sodium: 500,
    ingredients: [],
    allergens: [],
    mayContain: [],
    crossContaminationPossible: [],
    dietaryTags: [],
    recommendationScore: 1,
    available: true,
    inStock: true,
    spiceLevel: 0,
    keywords: [],
    vectorTags: [],
    recommendedWith: [],
    customizations: [],
    removableIngredients: [],
    allergenSafetyMessage: "",
    customizationGroups: [],
  }],
};

test("menu cache is isolated by device and assigned menu", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage() });
  try {
    writeMenuConfigurationCache({
      deviceId: "device-a",
      menuId: "menu-a",
      menuVersion: 3,
      configVersion: 8,
      cachedAt: new Date().toISOString(),
      menu: MENU,
    });
    assert.equal(readMenuConfigurationCache("device-a", "menu-a")?.menuVersion, 3);
    assert.equal(readMenuConfigurationCache("device-b", "menu-a"), null);
    assert.equal(readMenuConfigurationCache("device-a", "menu-b"), null);
  } finally {
    restoreGlobal("localStorage", originalStorage);
  }
});

test("bootstrap context snapshot exposes restaurant, branch, kiosk, language, payment, and feature configuration", () => {
  const config = deviceConfiguration();
  const snapshot = createBootstrapSnapshot(config);
  assert.equal(snapshot.restaurant.name, "Tenant Restaurant");
  assert.equal(snapshot.restaurant.timezone, "Europe/Istanbul");
  assert.deepEqual(snapshot.restaurant.languages.map(language => language.code), ["tr", "en"]);
  assert.equal(snapshot.branch.phone, "+90 212 000 00 00");
  assert.equal(snapshot.branch.taxRate, 0.2);
  assert.deepEqual(snapshot.kiosk.payments.enabledMethods, ["card", "qr"]);
  assert.equal(snapshot.kiosk.defaultLanguage, "tr");
  assert.equal(snapshot.featureFlags.loyalty, true);
  assert.equal(snapshot.configuration.configVersion, 12);
  assert.equal(snapshot.configuration.menuVersion, 6);
});

test("configuration services detect configVersion and checksum refreshes", () => {
  const current = deviceConfiguration();
  const next = structuredClone(current);
  next.configVersion = 13;
  next.bootstrap.configVersion = 13;
  next.bootstrap.configuration.configVersion = 13;
  next.bootstrap.configuration.checksum = "checksum-13";
  const restaurant = new RestaurantConfigurationService();
  const branch = new BranchConfigurationService();
  const settings = new SettingsService();
  const menu = new MenuConfigurationService();
  assert.equal(restaurant.hasChanged(current, next), true);
  assert.equal(branch.hasChanged(current, next), true);
  assert.equal(settings.hasChanged(current, next), true);
  assert.equal(restaurant.refresh(next).name, "Tenant Restaurant");
  assert.equal(branch.refresh(next).code, "KAD");
  assert.equal(settings.refresh(next).configuration.configVersion, 13);
  assert.equal(menu.isCurrent({
    deviceId: current.deviceId,
    menuId: current.publishedMenuId,
    menuVersion: 6,
    configVersion: 12,
    cachedAt: new Date().toISOString(),
    menu: MENU,
  }, { menuVersion: 6, configVersion: 13 }), false);
});

test("matching versions start from cache and changed config falls back as stale when offline", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const local = memoryStorage();
  const session = memoryStorage();
  session.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "device-access-token");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  writeMenuConfigurationCache({
    deviceId: "device-a",
    menuId: "menu-a",
    menuVersion: 3,
    configVersion: 8,
    cachedAt: new Date().toISOString(),
    menu: MENU,
  });
  const service = new MenuConfigurationService();
  try {
    const exact = await service.load({
      deviceId: "device-a",
      menuId: "menu-a",
      menuVersion: 3,
      configVersion: 8,
      currency: "TRY",
    });
    assert.deepEqual(exact.ok && {
      source: exact.source,
      offline: exact.offline,
      stale: exact.stale,
    }, { source: "cache", offline: false, stale: false });

    globalThis.fetch = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    invalidateMenuCache();
    const changed = await service.load({
      deviceId: "device-a",
      menuId: "menu-a",
      menuVersion: 4,
      configVersion: 9,
      currency: "TRY",
    });
    assert.deepEqual(changed.ok && {
      source: changed.source,
      offline: changed.offline,
      stale: changed.stale,
    }, { source: "cache", offline: true, stale: true });
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalLocalStorage);
    restoreGlobal("sessionStorage", originalSessionStorage);
    invalidateMenuCache();
  }
});

test("menu cache fallback is reserved for network failures, not server responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const local = memoryStorage();
  const session = memoryStorage();
  session.setItem(DEVICE_ACCESS_TOKEN_STORAGE_KEY, "device-access-token");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  writeMenuConfigurationCache({
    deviceId: "device-a",
    menuId: "menu-a",
    menuVersion: 3,
    configVersion: 8,
    cachedAt: new Date().toISOString(),
    menu: MENU,
  });
  try {
    globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ code: "device_service_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }))) as typeof fetch;
    invalidateMenuCache();
    const result = await new MenuConfigurationService().load({
      deviceId: "device-a",
      menuId: "menu-a",
      menuVersion: 4,
      configVersion: 9,
      currency: "TRY",
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "menu_failed");
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalLocalStorage);
    restoreGlobal("sessionStorage", originalSessionStorage);
    invalidateMenuCache();
  }
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function deviceConfiguration(): KioskDeviceConfig {
  const configuredAt = "2026-07-30T12:00:00.000Z";
  const bootstrap: DeviceBootstrap = {
    restaurant: {
      id: "restaurant-1",
      name: "Tenant Restaurant",
      slug: "tenant-restaurant",
      logoUrl: "https://cdn.example/logo.svg",
      brandColors: { primary: "#123456" },
    },
    branch: {
      id: "branch-1",
      name: "Kadıköy",
      code: "KAD",
      address: "Test Street 1",
      phone: "+90 212 000 00 00",
      currency: "TRY",
      taxRate: 0.2,
      timezone: "Europe/Istanbul",
      serviceModes: ["dine_in", "take_away"],
      openingHours: [],
    },
    device: {
      id: "device-1",
      type: "kiosk" as const,
      name: "Front Kiosk",
      status: "active" as const,
      configVersion: 12,
      lastSeenAt: null,
      mode: "kiosk" as const,
      defaultLanguage: "tr",
      featureFlags: { loyalty: true },
      printerConfiguration: { model: "thermal" },
    },
    configuration: { configVersion: 12, lastUpdated: configuredAt, checksum: "checksum-12" },
    configVersion: 12,
    theme: { id: "theme-1", name: "Tenant", tokens: { primary: "#123456" } },
    logoUrl: "https://cdn.example/logo.svg",
    languages: [
      { code: "tr", name: "Turkish", nativeName: "Türkçe", locale: "tr-TR", direction: "ltr" as const, default: true },
      { code: "en", name: "English", nativeName: "English", locale: "en-US", direction: "ltr" as const, default: false },
    ],
    currency: "TRY",
    taxRate: 0.2,
    serviceModes: ["dine_in", "take_away"],
    openingHours: [],
    paymentConfiguration: { enabledMethods: ["card", "qr"], receiptPrintingEnabled: true, publicOptions: {} },
    noriConfiguration: { enabled: true, voiceEnabled: false, voiceSettings: {}, publicOptions: {} },
    idleScreenConfiguration: {
      timeoutSeconds: 180,
      videoIntervalMs: 9000,
      minimumPlaybackMs: 4000,
      transitionMs: 500,
      title: "Welcome",
      slogan: "Fresh",
      description: "Start your order",
      buttonLabel: "Start",
      touchLabel: "Touch to begin",
      videos: [],
    },
    publishedMenuId: "menu-1",
    publishedMenuVersion: 6,
    realtimeConfiguration: {
      enabled: true,
      transport: "private_broadcast" as const,
      branchTopic: "branch:branch-1:configuration",
      deviceTopic: "device:device-1:configuration",
    },
  };
  return {
    bootstrap,
    deviceId: "device-1",
    kioskId: "device-1",
    kioskName: "Front Kiosk",
    branchId: "branch-1",
    branchName: "Kadıköy",
    restaurantId: "restaurant-1",
    restaurantName: "Tenant Restaurant",
    currency: "TRY",
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    publishedMenuId: "menu-1",
    configVersion: 12,
    theme: bootstrap.theme,
    logoUrl: bootstrap.logoUrl,
    taxRate: 0.2,
    openingHours: [],
    paymentConfiguration: bootstrap.paymentConfiguration,
    noriConfiguration: bootstrap.noriConfiguration,
    idleScreenConfiguration: bootstrap.idleScreenConfiguration,
    realtimeConfiguration: bootstrap.realtimeConfiguration,
    settings: {
      enabledLanguages: ["tr", "en"],
      defaultLanguage: "tr",
      allowedOrderTypes: ["dine_in", "take_away"],
      allowedPaymentMethods: ["card", "qr"],
      receiptPrintingEnabled: true,
      aiAssistantEnabled: true,
      voiceAssistantEnabled: false,
    },
    configuredAt,
    offline: false,
  };
}
