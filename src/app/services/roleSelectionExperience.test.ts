import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/app/App.tsx", "utf8");
const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");
const stage = readFileSync("src/app/pages/device/DeviceWorkspaceStage.tsx", "utf8");
const styles = readFileSync("src/app/pages/device/DeviceSetup.css", "utf8");

test("DeviceWorkspaceStage is the only workspace-selection UI", () => {
  assert.equal(existsSync("src/app/pages/WorkspaceSelection.tsx"), false);
  assert.equal(existsSync("src/app/pages/RoleSelection.css"), false);
  assert.doesNotMatch(app, /import WorkspaceSelection/);
  assert.match(app, /route === ROUTES\.deviceSetup/);
  assert.match(setup, /<DeviceWorkspaceStage/);
});

test("the consolidated stage retains all five workspace choices and previews", () => {
  assert.match(stage, /Configure this device/);
  assert.match(stage, /morrow-workspace__preview-shell/);
  assert.match(stage, /morrow-workspace__navigation/);
  for (const role of ["Customer Kiosk", "Kitchen", "Cashier", "Admin", "Order Display"]) {
    assert.match(stage, new RegExp(`title: "${role}"`));
    assert.match(stage, new RegExp(`action: "Use as ${role}"`));
  }
  for (const preview of ["CustomerKioskPreview", "KitchenPreview", "CashierPreview", "AdminPreview", "OrderDisplayPreview"]) {
    assert.match(stage, new RegExp(preview));
  }
});

test("workspace selection remains keyboard accessible and reduced-motion safe", () => {
  assert.match(stage, /role="tablist"/);
  assert.match(stage, /aria-selected=\{selected\}/);
  assert.match(stage, /ArrowRight.*ArrowDown/s);
  assert.match(stage, /Home/);
  assert.match(stage, /End/);
  assert.match(stage, /useReducedMotion/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:reduce\)/);
});

test("a provisioned Change Mode flow selects a workspace without reactivation", () => {
  assert.match(app, /workspaceSelection=\{workspaceSelectionOverrideActive && Boolean\(device\.config\)\}/);
  assert.match(setup, /if \(workspaceSelection && config\) \{\s*onWorkspaceSelected\?\.\(deviceType\);\s*return;/s);
  assert.match(setup, /if \(workspaceSelection \|\| status !== "configured"/);
  assert.match(setup, /onBack=\{workspaceSelection \? undefined : resetVerification\}/);
});

test("all selection navigation canonicalizes to device setup", () => {
  assert.match(app, /enterWorkspaceSelection/);
  assert.match(app, /navigateTo\(ROUTES\.deviceSetup, true\)/);
  assert.match(app, /initialPath === WORKSPACE_SELECTION_ROUTE \|\| isLegacyWorkspaceSelectionRoute\(initialPath\)/);
  assert.doesNotMatch(app, /route === WORKSPACE_SELECTION_ROUTE\) return/);
});
