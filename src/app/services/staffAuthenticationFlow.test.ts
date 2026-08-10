import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROUTES } from "../auth/roleConfig";
import { guardRoute } from "../auth/routeGuards";
import { routeRequiresDeviceSession, shouldInitializeDeviceSession } from "../auth/workspaceRequirements";

const app = readFileSync("src/app/App.tsx", "utf8");
const stage = readFileSync("src/app/pages/device/DeviceWorkspaceStage.tsx", "utf8");
const client = readFileSync("src/app/services/staffApiClient.ts", "utf8");
const devices = readFileSync("src/app/pages/AdminDevices.tsx", "utf8");
const banner = readFileSync("src/app/components/configuration/OfflineConfigurationBanner.tsx", "utf8");
const managementRoutes = readFileSync("src/server/routes/deviceManagementRoutes.ts", "utf8");
const managementService = readFileSync("src/server/services/deviceManagementService.ts", "utf8");
const workspaceNavigation = readFileSync("src/app/auth/workspaceNavigation.ts", "utf8");

test("Admin workspace activation and protected routes always lead through staff authentication", () => {
  assert.equal(guardRoute(ROUTES.adminDevices, null, false), ROUTES.adminLogin);
  assert.match(workspaceNavigation, /type === "admin_terminal"\) return ROUTES\.adminLogin/);
  assert.match(app, /protectedAdminRoute/);
  assert.match(app, /auth\.verifySession\("admin"\)/);
  assert.match(app, /result === "unauthenticated"[\s\S]*navigateTo\(ROUTES\.adminLogin\)/);
  assert.match(stage, /onActivate\(activeWorkspace\.type\)/);
  assert.doesNotMatch(stage, /adminDashboard|\/admin\/dashboard/);
  assert.equal(routeRequiresDeviceSession(ROUTES.adminDevices, "admin", true), false);
  assert.equal(shouldInitializeDeviceSession(ROUTES.adminDevices, "admin", true), false);
  assert.equal(routeRequiresDeviceSession(ROUTES.idle, null, false), true);
  assert.equal(routeRequiresDeviceSession(ROUTES.cashier, "cashier", true), false);
  assert.match(app, /<AuthProvider><RouteAwareDeviceProvider>/);
});

test("one staff API client attaches both supported credential mechanisms without logging tokens", () => {
  assert.match(client, /authorization: `Bearer \$\{token\}`/);
  assert.match(client, /credentials: "include"/);
  assert.match(client, /cache: requestOptions\.cache \?\? "no-store"/);
  assert.match(client, /console\.debug\("\[cangujet staff API\]", \{ url, status, authorizationAttached, credentialsIncluded \}\)/);
  assert.doesNotMatch(client, /console\.(?:debug|log)\([^\n]*token/);
});

test("staff API failures keep authentication, permission, network, and server states distinct", () => {
  assert.match(client, /response\.status === 401[\s\S]*refreshCredential/);
  assert.match(client, /response\.status === 401[\s\S]*dependencies\.invalidateSession/);
  assert.match(client, /response\.status === 403[\s\S]*"forbidden"/);
  assert.match(client, /response\.status >= 500[\s\S]*"server"/);
  assert.match(client, /"network"[\s\S]*Admin API is unreachable/);
  assert.match(devices, /failure\.kind === "unauthenticated" \|\| failure\.kind === "forbidden"\) setData\(null\)/);
  assert.match(devices, /errorKind === "forbidden"/);
  assert.match(devices, /errorKind === "network"/);
  assert.match(banner, /routeRequiresDeviceSession/);
  assert.match(banner, /!deviceRequired/);
});

test("device management authenticates every request against Supabase rather than process memory", () => {
  assert.match(managementRoutes, /staffToken\(request\)/);
  assert.match(managementService, /this\.client\.auth\.getUser\(staffToken\)/);
  assert.match(managementService, /\.eq\("role", "admin"\)\.eq\("is_active", true\)/);
  assert.doesNotMatch(managementService, /new Map.*session|sessions\s*=\s*\[/s);
});
