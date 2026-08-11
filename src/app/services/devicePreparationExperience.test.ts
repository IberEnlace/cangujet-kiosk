import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ROUTES } from "../auth/roleConfig";
import { workspaceRouteForDevice } from "../auth/workspaceNavigation";

const app = readFileSync("src/app/App.tsx", "utf8");
const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");
const setupCss = readFileSync("src/app/pages/device/DeviceSetup.css", "utf8");
const loading = readFileSync("src/app/components/configuration/ConfigurationLoadingScreen.tsx", "utf8");
const preparing = readFileSync("src/app/components/configuration/PreparingDeviceScreen.tsx", "utf8");
const context = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
const info = readFileSync("src/app/pages/device/DeviceInfo.tsx", "utf8");

test("normal post-activation progress is minimal and contains no implementation steps", () => {
  for (const implementationCopy of [
    "Configuring this device",
    "Verifying device",
    "Loading branch settings",
    "Loading menu",
    "Preparing workspace",
    "Applying the authenticated kiosk configuration",
  ]) {
    assert.equal(setup.includes(implementationCopy), false);
    assert.equal(loading.includes(implementationCopy), false);
    assert.equal(preparing.includes(implementationCopy), false);
  }
  assert.match(preparing, /CangujetLogo variant="full"/);
  assert.match(preparing, /animate-spin/);
});

test("fast completion navigates without the former fixed delay", () => {
  assert.match(setup, /PREPARING_VISUAL_THRESHOLD_MS = 150/);
  assert.match(setup, /setTimeout\(\(\) => setShowPreparing\(true\), PREPARING_VISUAL_THRESHOLD_MS\)/);
  assert.doesNotMatch(setup, /2600|setTimeout\(onConfigured/);
  assert.match(setup, /!config \|\| !configurationReady/);
  assert.match(setup, /onConfigured\(\)/);
});

test("bootstrap readiness and errors remain authoritative", () => {
  assert.match(setup, /bootstrap\.state === "ready" \|\| bootstrap\.state === "offline"/);
  assert.match(setup, /bootstrap\.state === "error"/);
  assert.match(setup, /return <ConfigurationLoadingScreen \/>/);
  assert.match(loading, /bootstrap\.refresh\(\)/);
  assert.match(context, /setInitializationStatus\("error"\)/);
  assert.match(context, /code === "session_expired" \? "setup_required" : "error"/);
});

test("every selected workspace keeps its existing automatic destination", () => {
  assert.equal(workspaceRouteForDevice("kiosk"), ROUTES.idle);
  assert.equal(workspaceRouteForDevice("cashier_terminal"), ROUTES.cashier);
  assert.equal(workspaceRouteForDevice("kitchen_display"), ROUTES.kitchen);
  assert.equal(workspaceRouteForDevice("order_display"), ROUTES.display);
  assert.match(app, /onConfigured=\{\(\) => navigateTo\(workspaceRouteForDevice/);
});

test("loading-surface actions are removed while recovery capabilities remain", () => {
  assert.doesNotMatch(setup, /Show device information|Clear setup|onDeviceInfo|clearDeviceConfiguration/);
  assert.doesNotMatch(setupCss, /device-steps|device-success|device-info-card|device-setup-footer/);
  assert.match(info, /clearDeviceConfiguration/);
  assert.match(context, /const clearDeviceConfiguration = useCallback/);
  assert.match(app, /route === ROUTES\.deviceInfo/);
  assert.equal(existsSync("src/app/pages/WorkspaceSelection.tsx"), false);
});
