import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const view = fs.readFileSync(new URL('../src/control-tower-v2.tsx', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../src/v2-command-center.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('V2 Home exposes the operating center and required sections', () => {
  for (const label of ['COMMAND CENTER V2', "NEEDS YOUR DECISION", "TODAY'S PRIORITIES", 'MARKETING PLAN', 'AI ACTIVITY', 'BUSINESS PULSE', 'UPCOMING', 'DECISION RADAR', 'OPERATING SYSTEM']) assert.match(view, new RegExp(label));
  for (const target of ['crm', 'planner', 'content', 'automations']) assert.match(view, new RegExp(`onNavigate\\("${target}"\\)`));
  assert.match(view, /Ask Coach Brain/);
  assert.match(view, /onNavigate\("brain"\)/);
});

test('Home plan is data-derived, conservative, and does not poll', () => {
  assert.match(view, /DEFAULT_BATCH_MIX/);
  assert.match(view, /Not enough data yet/);
  assert.doesNotMatch(shell, /setInterval/);
});

test('V2 Home uses localized Marketing labels and content-aware attention tracks', () => {
  assert.match(view, /mixLabels\[slot\.labelKey as keyof typeof mixLabels\]/);
  assert.match(style, /v2-action-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,260px\),1fr\)\)/);
});

test('V2 Home keeps external execution read-only and explicit', () => {
  assert.match(view, /never executes actions automatically/);
  assert.match(view, /Unified operational signals/);
  assert.match(view, /onClick/);
});

test('V2 Home operating strip is responsive', () => {
  assert.match(style, /\.v2-operating-strip/);
  assert.match(style, /@media\(max-width:760px\)/);
});

test('V2 Home exposes quick operating navigation and filters decision signals', () => {
  for (const target of ['crm', 'planner', 'content', 'automations']) assert.match(view, new RegExp(`onNavigate\\("${target}"\\)`));
  assert.match(view, /v2-search-inline/);
  assert.match(view, /filteredAlerts/);
  assert.match(view, /Search signals/);
  assert.match(view, /Review All/);
});

test('Command Center guidance is derived from current summary data and cannot execute external actions', () => {
  assert.match(view, /AI ACTIVITY/);
  assert.match(view, /conversations for human review/);
  assert.match(view, /content needs review or recovery/);
  assert.match(view, /booking requests need confirmation/);
  assert.match(view, /never executes actions automatically/);
  assert.match(view, /Review All/);
});
