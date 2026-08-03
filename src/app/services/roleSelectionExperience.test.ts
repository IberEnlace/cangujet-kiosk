import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/pages/RoleSelection.tsx", "utf8");
const styles = readFileSync("src/app/pages/RoleSelection.css", "utf8");

test("workspace selection preserves the five existing roles, headline, branding, and accent palette", () => {
  assert.match(page, /How will this device be used\?/);
  assert.match(page, /MorrowLogo variant="full"/);
  for (const role of ["Customer Kiosk", "Admin", "Cashier", "Kitchen", "Order Display"]) assert.match(page, new RegExp(`title: "${role}"`));
  for (const accent of ["#d7ff7a", "#60a5fa", "#a78bfa", "#fb923c", "#34d399"]) assert.match(page, new RegExp(accent));
});

test("cinematic entrance follows logo, status, blurred headline, subtitle, and 80ms card cadence", () => {
  assert.match(page, /enter\(0\).*MorrowLogo/s);
  assert.match(page, /enter\(\.08, 5\).*Platform Ready/s);
  assert.match(page, /filter: "blur\(7px\)"/);
  assert.match(page, /filter: "blur\(0px\)"/);
  assert.match(page, /enter\(\.26, 4\).*workspace-subtitle/s);
  assert.match(page, /\.42 \+ index \* \.08/);
  assert.doesNotMatch(page, /typing|typewriter/i);
});

test("hover and keyboard focus preserve card interactions while neighboring cards recede", () => {
  assert.match(page, /onPointerEnter=\{\(\) => onActiveChange\(true\)\}/);
  assert.match(page, /onFocus=\{\(\) => onActiveChange\(true\)\}/);
  assert.match(page, /softDimmed=\{!selected && hovered !== null && hovered !== workspace\.id\}/);
  assert.match(styles, /rotate\(4deg\)/);
  assert.match(styles, /workspace-card__action svg[^}]*translateX\(4px\)/);
  assert.doesNotMatch(page, /WorkspaceNetwork|workflow-route|workspace-network/);
  assert.doesNotMatch(styles, /workspace-network|network-draw|network-flow/);
});

test("selection uses the 700ms operating-system transition before preserving the existing navigation callback", () => {
  assert.match(page, /setTimeout\(\(\) => onSelect\(workspace\.id, workspace\.defaultRemember\), reducedMotion \? 0 : 700\)/);
  assert.match(page, /Opening Workspace…/);
  assert.match(page, /workspace-page \$\{selected \? "is-opening"/);
  assert.match(styles, /workspace-page\.is-opening \.workspace-opening-shade\{opacity:1\}/);
  assert.match(styles, /opening-progress \.7s/);
  assert.match(styles, /workspace-card\.is-selected[^}]*scale\(1\.025\)/);
});

test("ambient environment remains low-cost, subtle, mouse-reactive, and reduced-motion safe", () => {
  assert.match(page, /--spotlight-x/);
  assert.match(page, /--spotlight-y/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /workspace-tech-glyphs/);
  assert.match(styles, /workspace-spotlight\{[^}]*opacity:\.038/);
  assert.match(styles, /@keyframes card-breathe/);
  assert.match(styles, /@keyframes grid-breathe/);
  assert.match(styles, /@keyframes environment-sweep/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(page, /useReducedMotion/);
  assert.doesNotMatch(page, /setHovered\([^)]*onPointerMove/);
});

test("workspace cards retain accessible names, visible focus, and semantic busy state", () => {
  assert.match(page, /aria-label=\{`Open \$\{workspace\.title\} workspace`\}/);
  assert.match(page, /aria-busy=\{selected\}/);
  assert.match(page, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /type="button"/);
  assert.match(styles, /workspace-card:focus-visible\{outline:2px solid var\(--accent\)/);
});
