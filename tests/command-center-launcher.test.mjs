import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const launcher = fs.readFileSync(new URL("../src/command-center-launcher.ts", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../src/command-center-bootstrap.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("application entry has one React bootstrap and no overlay launcher", () => {
  assert.match(index, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
  assert.doesNotMatch(index, /command-center-bootstrap/);
  assert.doesNotMatch(index, /command-center-launcher/);
});

test("historical launcher modules cannot create a duplicate workspace or Coach Brain control", () => {
  assert.doesNotMatch(launcher, /openCommandCenterWorkspace|cc-cb-launch|MutationObserver/);
  assert.doesNotMatch(bootstrap, /import\(/);
});

test("authenticated V2 navigation exposes existing Today, Command, and Coach Brain modules", () => {
  assert.match(app, /\["today", CalendarDays, "x"\]/);
  assert.match(app, /\["command", Bot, "x"\]/);
  assert.match(app, /\["brain", Bot, "x"\]/);
  assert.match(app, /<TodayView session=\{session\} onNavigate=\{go\} onSessionExpired=\{onLogout\} \/>/);
  assert.match(app, /function normalizeOwnerSection\(section: SectionId\)/);
  assert.match(app, /return section === "command" \? "dashboard" : section;/);
  assert.match(app, /active === "dashboard" \? .*ControlTowerV2/s);
  assert.doesNotMatch(app, /active === "command" \? .*ControlTowerV2/s);
});

test("Coach Brain remains an authenticated direct route with evidence links rendered by its component", () => {
  assert.match(app, /const CoachBrain = lazy\(\(\) => import\("\.\/coach-brain"\)\)/);
  assert.match(app, /<CoachBrain language=\{language\}/);
  assert.match(app, /onNavigate=\{\(section\) =>/);
  assert.match(app, /go\(section as SectionId\)/);
  assert.doesNotMatch(launcher, /renderCoachBrainSource|safeExternalUrl/);
});
