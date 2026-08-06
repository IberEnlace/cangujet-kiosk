import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { getLoginRouteForRole, LEGACY_WORKSPACE_SELECTION_ROUTES, ROUTES, WORKSPACE_SELECTION_ROUTE } from "../auth/roleConfig";
import {
  beginIntentionalWorkspaceSelection,
  completeIntentionalWorkspaceSelection,
  initialWorkspaceResumeDecision,
  isLegacyWorkspaceSelectionRoute,
  isWorkspaceSelectionOverrideActive,
  WORKSPACE_SELECTION_OVERRIDE_KEY,
} from "../auth/workspaceNavigation";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: new MemoryStorage() });
});

for (const [label, deviceType] of [
  ["Kitchen back", "kitchen_display"],
  ["Cashier back", "cashier_terminal"],
  ["Admin change mode", "admin_terminal"],
] as const) {
  test(`${label} remains on intentional workspace selection`, () => {
    beginIntentionalWorkspaceSelection();
    const decision = initialWorkspaceResumeDecision({
      route: WORKSPACE_SELECTION_ROUTE,
      initializationStatus: "authenticated",
      assignedDeviceType: deviceType,
      selectionOverrideActive: isWorkspaceSelectionOverrideActive(),
    });
    assert.deepEqual(decision, { resolved: true, target: null, reason: "selection_override" });
  });
}

test("a saved Kitchen device resumes once on fresh startup", () => {
  const decision = initialWorkspaceResumeDecision({
    route: WORKSPACE_SELECTION_ROUTE,
    initializationStatus: "authenticated",
    assignedDeviceType: "kitchen_display",
    selectionOverrideActive: false,
  });
  assert.equal(decision.target, ROUTES.kitchen);
  assert.equal(decision.reason, "initial_device_resume");
});

test("intentional selection overrides saved Kitchen and selecting Cashier clears the override", () => {
  beginIntentionalWorkspaceSelection();
  assert.equal(sessionStorage.getItem(WORKSPACE_SELECTION_OVERRIDE_KEY), "true");
  completeIntentionalWorkspaceSelection();
  assert.equal(isWorkspaceSelectionOverrideActive(), false);
  assert.equal(getLoginRouteForRole("cashier"), ROUTES.cashierLogin);
});

test("initial route resolution is one-shot and cannot reintroduce a redirect loop", () => {
  const app = readFileSync("src/app/App.tsx", "utf8");
  assert.match(app, /const initialRouteResolvedRef = useRef\(false\)/);
  assert.match(app, /if \(initialRouteResolvedRef\.current\) return/);
  assert.match(app, /initialRouteResolvedRef\.current = true/);
  assert.match(app, /enterWorkspaceSelection\(`\$\{loginRole\}_login_back`\)/);
});

test("legacy selection routes canonicalize without choosing a workspace", () => {
  for (const route of LEGACY_WORKSPACE_SELECTION_ROUTES) assert.equal(isLegacyWorkspaceSelectionRoute(route), true);
  assert.equal(WORKSPACE_SELECTION_ROUTE, "/workspace-selection");
  const app = readFileSync("src/app/App.tsx", "utf8");
  assert.match(app, /isLegacyWorkspaceSelectionRoute\(initialPath\)/);
  assert.match(app, /beginIntentionalWorkspaceSelection\(\)/);
  assert.match(app, /navigateTo\(WORKSPACE_SELECTION_ROUTE, true\)/);
  assert.doesNotMatch(app, /pages\/RoleSelection/);
});
