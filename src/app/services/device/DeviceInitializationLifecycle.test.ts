import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const context = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

test("Strict Mode initialization is restartable after effect cleanup", () => {
  assert.match(main, /<StrictMode>/);
  assert.doesNotMatch(context, /initializationStartedRef/);
  assert.match(context, /const sequence = \+\+initializationSequenceRef\.current/);
  assert.match(context, /return \(\) => controller\.abort\(\)/);
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

test("configuration polling starts only when authenticated and cleans up", () => {
  assert.match(context, /initializationStatus !== "authenticated" \|\| !config/);
  assert.match(context, /window\.clearInterval\(interval\)/);
  assert.match(context, /document\.removeEventListener\("visibilitychange", visibility\)/);
  assert.match(context, /controller\.abort\(\)/);
  assert.match(context, /configuration_poll_failed/);
});
