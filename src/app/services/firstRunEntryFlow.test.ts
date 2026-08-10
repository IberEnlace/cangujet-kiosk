import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ROUTES } from "../auth/roleConfig";
import { guardRoute } from "../auth/routeGuards";
import { routeRequiresDeviceSession, shouldInitializeDeviceSession } from "../auth/workspaceRequirements";
import { initialWorkspaceResumeDecision } from "../auth/workspaceNavigation";

const app = readFileSync("src/app/App.tsx", "utf8");
const setup = readFileSync("src/app/pages/device/DeviceSetup.tsx", "utf8");
const login = readFileSync("src/app/components/auth/StaffLogin.tsx", "utf8");
const auth = readFileSync("src/app/auth/AuthContext.tsx", "utf8");
const device = readFileSync("src/app/context/DeviceContext.tsx", "utf8");
const devices = readFileSync("src/app/pages/AdminDevices.tsx", "utf8");
const firstRunComponent = setup.slice(setup.indexOf("function FirstRunEntry"), setup.indexOf("function DeviceStateUnavailable"));

test("fresh installation starts at a two-path first-run entry", () => {
  assert.match(app, /\|\| ROUTES\.deviceSetup/);
  assert.match(setup, /useState<"entry" \| "activation">\("entry"\)/);
  assert.match(setup, /"Set up this device again" : "Set up this device"/);
  assert.match(setup, />Admin \/ Staff sign in</);
  assert.match(setup, /onSetUp=\{\(\) => setSetupView\("activation"\)\}/);
});

test("activation is an explicit reversible view and retains the existing provisioning stages", () => {
  assert.match(setup, /setupView === "entry"/);
  assert.match(setup, /onClick=\{returnToEntry\}/);
  assert.match(setup, /await verifyActivationKey\(trimmed\)/);
  assert.match(setup, /<DeviceWorkspaceStage/);
  assert.match(setup, /await configureDevice\(secretKey\.trim\(\), deviceType\)/);
});

test("staff entry targets canonical Admin login without writing device state", () => {
  assert.match(app, /onStaffSignIn=\{\(\) => navigateTo\(ROUTES\.adminLogin\)\}/);
  assert.doesNotMatch(firstRunComponent, /configureDevice|clearDeviceConfiguration|selectDeviceMode/);
  assert.match(login, /onClick=\{onBack\}[\s\S]*> Back</);
  assert.match(app, /onBack=\{\(\) => enterWorkspaceSelection\(`/);
});

test("Admin login and protected Admin pages are staff-only, device-independent routes", () => {
  for (const route of [ROUTES.adminLogin, ROUTES.adminDashboard, ROUTES.adminDevices, ROUTES.adminSettings]) {
    assert.equal(routeRequiresDeviceSession(route, "admin", true), false);
    assert.equal(shouldInitializeDeviceSession(route, "admin", true), false);
  }
  assert.equal(guardRoute(ROUTES.adminDashboard, null, false), ROUTES.adminLogin);
  assert.equal(guardRoute(ROUTES.adminDevices, null, false), ROUTES.adminLogin);
  assert.equal(guardRoute(ROUTES.adminDashboard, "admin", true), ROUTES.adminDashboard);
  assert.equal(guardRoute(ROUTES.adminDevices, "admin", true), ROUTES.adminDevices);
  assert.match(app, /auth\.verifySession\("admin"\)/);
  assert.match(auth, /signInStaff\(role, email, password\)/);
  assert.match(devices, /adminDeviceManagementService\.createKey/);
});

test("provisioned restore and intentional Change Mode remain distinct", () => {
  assert.deepEqual(initialWorkspaceResumeDecision({
    route: ROUTES.deviceSetup,
    initializationStatus: "authenticated",
    assignedDeviceType: "cashier_terminal",
    selectionOverrideActive: false,
  }), { resolved: true, target: ROUTES.cashier, reason: "initial_device_resume" });
  assert.deepEqual(initialWorkspaceResumeDecision({
    route: ROUTES.deviceSetup,
    initializationStatus: "authenticated",
    assignedDeviceType: "cashier_terminal",
    selectionOverrideActive: true,
  }), { resolved: true, target: null, reason: "selection_override" });
  assert.match(app, /workspaceSelection=\{workspaceSelectionOverrideActive && Boolean\(device\.config\)\}/);
  assert.match(setup, /workspaceSelection && config[\s\S]*onWorkspaceSelected\?\.\(deviceType\)/);
});

test("ambiguous backend failure never masquerades as a fresh installation", () => {
  assert.match(setup, /deviceStateUnavailable/);
  assert.match(setup, /initializationStatus === "error"/);
  assert.match(setup, /Existing device state has not been cleared or changed\./);
  assert.match(setup, /onRetry=\{retryInitialization\}/);
  assert.match(device, /code === "session_expired" \? "setup_required" : "error"/);
  assert.match(device, /if \(code === "session_expired"\) setConfig\(null\)/);
});

test("expired or revoked lifecycle states are presented as reactivation, not a fresh install", () => {
  assert.match(setup, /const reactivationRequired = \["session_expired", "revoked", "expired"\]\.includes\(status\)/);
  assert.match(setup, /Device setup required/);
  assert.match(setup, /Set up this device again/);
});

test("device workspace behavior and deleted legacy UI remain intact", () => {
  assert.equal(routeRequiresDeviceSession(ROUTES.idle, null, false), true);
  assert.equal(routeRequiresDeviceSession(ROUTES.cashier, "cashier", true), false);
  assert.equal(routeRequiresDeviceSession(ROUTES.kitchen, "kitchen", true), false);
  assert.equal(routeRequiresDeviceSession(ROUTES.display, null, false), true);
  assert.equal(existsSync("src/app/pages/WorkspaceSelection.tsx"), false);
  assert.doesNotMatch(app, /import WorkspaceSelection/);
});
