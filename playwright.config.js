// @ts-check
const { defineConfig, devices } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

// The preview-server command lives in ONE place: .claude/launch.json. Copying it in here would be
// two fields carrying one fact, and they would drift the first time either is edited.
function previewServerCommand () {
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

  fullyParallel: false,      // auth state must be sequential
  workers: 1,                // one worker — prevents Supabase contention between test files
  retries: 1,
  timeout: 60000,
  use: {
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
