import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");

test("Strict Mode initialization is restartable after effect cleanup", () => {
  assert.match(main, /<StrictMode>/);
  assert.doesNotMatch(context, /initializationStartedRef/);
  assert.match(context, /const sequence = \+\+initializationSequenceRef\.current/);
  assert.match(context, /controller\.abort\(\)/);
  assert.match(context, /sequence !== initializationSequenceRef\.current/);
});

test("every active initialization path reaches an explicit terminal state", () => {
  assert.match(context, /setInitializationStatus\(saved \? "authenticated" : "setup_required"\)/);
  assert.match(context, /setInitializationStatus\("error"\)/);
  assert.match(app, /device\.initializationStatus === "initializing"/);
  assert.match(app, /device\.initializationStatus === "error"/);
  assert.match(app, /device\.initializationStatus === "setup_required"/);
});

test("startup errors expose retry and device-setup recovery actions", () => {
  assert.match(app, /onRetry=\{device\.retryInitialization\}/);
  assert.match(app, /onSetup=\{\(\) =>/);
  assert.match(app, /navigateTo\(ROUTES\.deviceSetup\)/);
});

test("device setup submission is explicit, validates the shared key grammar, and cannot double-submit", () => {
  assert.match(setup, /<form onSubmit=\{submit\}/);
  assert.match(setup, /type="submit"/);
  assert.match(setup, /event\.preventDefault\(\)/);
  assert.match(setup, /secretKey\.trim\(\)/);
  assert.match(setup, /isDeviceSecretKey\(trimmed\)/);
  assert.match(setup, /initializationStatus === "registering"/);
  assert.match(setup, /await configureDevice\(trimmed\)/);
  assert.match(setup, /const displayedError = validationError \?/);
});

test("registration owns its state transition and invalidates any startup result", () => {
  assert.match(context, /initializationAbortRef\.current\?\.abort\(\)/);
  assert.match(context, /initializationSequenceRef\.current \+= 1/);
  assert.match(context, /setInitializationStatus\("registering"\)/);
  assert.match(context, /setInitializationStatus\("authenticated"\)/);
  assert.match(context, /setInitializationStatus\("error"\)/);
});

test("clearing setup returns the context to setup-required state", () => {
  assert.match(context, /const clearDeviceConfiguration = useCallback/);
  assert.match(context, /setStatus\("unconfigured"\)/);
  assert.match(context, /setInitializationError\(null\)/);
  assert.match(context, /setInitializationStatus\("setup_required"\)/);
});

test("configuration polling starts only when authenticated and cleans up", () => {
  assert.match(context, /initializationStatus !== "authenticated" \|\| !config/);
  assert.match(context, /window\.clearInterval\(interval\)/);
  assert.match(context, /document\.removeEventListener\("visibilitychange", visibility\)/);
  assert.match(context, /controller\.abort\(\)/);
  assert.match(context, /configuration_poll_failed/);
});
