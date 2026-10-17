// @ts-check
const { defineConfig, devices } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

// The preview-server command lives in ONE place: .claude/launch.json. Copying it in here would be
// two fields carrying one fact, and they would drift the first time either is edited.
function previewServerCommand () {
  // CI runs on Linux, where launch.json's PowerShell HttpListener cannot start at all. The override
  // keeps .claude/launch.json as the single source of truth for the LOCAL command -- which is the
  // point of reading it rather than hardcoding one -- while letting the workflow supply a portable
  // equivalent (python3 -m http.server). Without this the e2e job cannot boot the app under test.
  if (process.env.PREVIEW_SERVER_CMD) return process.env.PREVIEW_SERVER_CMD

  const p = path.join(__dirname, '.claude', 'launch.json')
  let cfg
  try {
    // Strip a UTF-8 BOM before parsing: PowerShell and several Windows editors write one, and
    // JSON.parse rejects it outright ("Unexpected token '﻿'"). launch.json currently has one.
    cfg = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''))
  } catch (err) {
    throw new Error(`Cannot read ${p} — the preview-server command lives there. ${err.message}`)
  }
  const app = (cfg.configurations || []).find(c => c.name === 'CoachApp')
  if (!app || !app.runtimeExecutable) {
    throw new Error(`.claude/launch.json has no usable "CoachApp" configuration — cannot start the preview server.`)
  }
  const args = (app.runtimeArgs || []).map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ')
  return `${app.runtimeExecutable} ${args}`
}

module.exports = defineConfig({
  testDir: './tests',
  // Throwaway probes can NEVER be collected into a run, even if they reappear.
  //
  // zz-*.spec.js is gitignored, so git cannot restore one — but this repo lives inside OneDrive, and
  // on 2026-09-06 two probe files came back three times after being deleted and verified gone. That is
  // not a tidiness problem: `tests/zz-cleanup-e2e.spec.js` was a DESTRUCTIVE one-off that reaped every
  // [E2E] row, and it returned the same way once before. checks.sh already fails on a stray probe, but
  // that only helps if the gate runs before the suite does; this closes the window where a resurrected
  // file is simply picked up and executed.
  // `_debug-*.spec.js` is git-ignored like the others but was NOT listed, so the full suite ran two of them from one machine's folder (a release gate whose membership depends on untracked files;
  // one flaked in both v2026.10.5 gate runs). It is ignored even when named by path. To run a throwaway probe on purpose: `npx playwright test -c playwright.probe.config.js`.
  testIgnore: ['**/zz-*.spec.js', '**/_adhoc*.spec.js', '**/_debug-*.spec.js'],

  // Before 2026-08-29 there was no webServer block, so `npm test` and the pre-push gate both
  // depended on a server someone had started out of band. When it was absent the suite produced
  // 39 identical ERR_CONNECTION_REFUSED failures and the gate blamed the tests.
  // reuseExistingServer: a second listener on 3001 just errors out, so never start one over a
  // session that already booted it.
  webServer: {
    command: previewServerCommand(),
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 30000,
  },

  // Asserts the server is serving CoachApp specifically, not merely returning 200. Runs after
  // webServer, so a failure here means the server is wrong rather than slow.
  globalSetup: require.resolve('./tests/global-setup.js'),
  // Reports how many [E2E] fixture rows the run left behind. Report-only — see the file for why it
  // does not fail the run yet.
  globalTeardown: require.resolve('./tests/global-teardown.js'),

  fullyParallel: false,      // auth state must be sequential
  workers: 1,                // one worker — prevents Supabase contention between test files
  retries: 1,
  timeout: 60000,
  use: {
    // No action timeout used to mean a click on an element that never appears waited out the WHOLE 60-120 s test, with no name on the failure. 30 s fails the stuck step by name
    // (2026-10-17: a 2-minute hang in the Workouts spec; an aborted release the day before).
    actionTimeout: 30000,
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    // devices['Desktop Chrome'] carries its own viewport (1280x720), which silently overrode a
    // top-level `viewport` key here for this project's entire history — every "mobile check" this
    // suite has ever run was actually executed at desktop width. Overriding viewport again AFTER
    // the spread is what actually takes effect (mobile-first, matches the app's own breakpoint).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
})
