#!/usr/bin/env node
// Draws the home-screen icons from the app's "C" mark (the same mark as index.html's inline favicon and .auth-logo:
// a white bold C on the #6366f1 indigo) and writes them to icons/. Run when the mark changes; the PNGs are committed.
// The icons carry no ?v= cache-bust: a phone that installed the app may keep the old icon until it is re-added to the
// home screen. That is normal for installed web apps; rename the files if a change must show at once.
//
//   node scripts/make-icons.mjs
//
// Four files (2026-10-30, docs/bugs/2026-10-30-app-cannot-be-installed-to-the-home-screen.md):
//   icon-192.png, icon-512.png   the manifest's ordinary icons: the rounded square, as the favicon draws it
//   icon-maskable-512.png        Android cuts its own shape out of this one, so the colour runs to every edge and the C
//                                sits inside the middle 80% (the "safe zone" every mask keeps)
//   apple-touch-icon.png         iPhone, 180 px: square and full-bleed, because iOS rounds the corners itself
//
// Drawn with the test browser (Playwright's Chromium, already a dev dependency) so the C is real text in Inter, the app's
// typeface, rather than hand-traced paths. Inter is loaded from Google Fonts; if that fails the script stops rather than
// writing icons in a fallback font.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'icons')
const INDIGO = '#6366f1'

// size: pixels; rounded: corner radius as a share of the size (0 = square); glyph: the C's font size as a share of the size
const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: 0.25, glyph: 0.6 },
  { file: 'icon-512.png', size: 512, rounded: 0.25, glyph: 0.6 },
  { file: 'icon-maskable-512.png', size: 512, rounded: 0, glyph: 0.46 },
  { file: 'apple-touch-icon.png', size: 180, rounded: 0, glyph: 0.6 }
]

const page = (i) => `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=block">
<style>html,body{margin:0;background:transparent}
#i{width:${i.size}px;height:${i.size}px;border-radius:${i.size * i.rounded}px;background:${INDIGO};display:flex;align-items:center;justify-content:center;
font-family:'Inter';font-weight:700;font-size:${Math.round(i.size * i.glyph)}px;line-height:1;color:#fff}</style></head>
<body><div id="i">C</div></body></html>`

const browser = await chromium.launch()
try {
  mkdirSync(OUT, { recursive: true })
  for (const i of ICONS) {
    const p = await browser.newPage({ viewport: { width: i.size, height: i.size }, deviceScaleFactor: 1 })
    await p.setContent(page(i), { waitUntil: 'networkidle' })
    const hasInter = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check("700 20px 'Inter'") })
    if (!hasInter) throw new Error('Inter did not load from Google Fonts - refusing to draw the icons in a fallback font')
    await p.locator('#i').screenshot({ path: join(OUT, i.file), omitBackground: i.rounded > 0 })
    await p.close()
    console.log(`  wrote icons/${i.file} (${i.size}x${i.size})`)
  }
} finally {
  await browser.close()
}
