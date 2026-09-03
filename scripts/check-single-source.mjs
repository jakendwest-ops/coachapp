#!/usr/bin/env node
/**
 * A registered fact must have exactly ONE definition, in the file that owns it.
 *
 * WHY THIS IS NOT THE COUNT RATCHET. A ratchet says "do not add a 37th". This says "there is exactly
 * one, and it lives HERE" -- so it also catches a definition that MOVED, and its refusal names the
 * surviving home, which is the thing a person needs in order to fix it. checks.sh rule 9c already
 * refuses two FUNCTIONS with the same name; these are values and call shapes, which rule 9c cannot see.
 *
 * WHY IT MATTERS HERE SPECIFICALLY. 76 of 457 functions in this app sit in verified duplicate
 * clusters, and those clusters have already drifted into user-visible bugs: two of three `daysUntil`
 * copies parse a date without 'T00:00:00' while the third is correct; one weight-save path writes
 * resting_hr and its twin does not, while the chart reads it. Every one of those started as a second
 * copy that was correct on the day it was written. The registry is how a consolidation stays
 * consolidated after the commit that did it.
 *
 * Phases 3 and 4 add a line per consolidation. It is deliberately NOT empty today -- a checker with an
 * empty registry reports success while checking nothing, which is this project's most-shipped class of
 * OS bug. Three real facts were verified single-sourced by hand and seeded.
 *
 * Usage:  node scripts/check-single-source.mjs
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = process.env.SINGLE_REPO || join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = join(REPO, 'scripts', 'single-source.json')

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
const facts = Object.entries(registry.facts || {})

/** The nine modules in index.html order -- read, never hardcoded. */
function jsFiles () {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/^﻿/, '')
  const files = [...html.matchAll(/<script\s+src="(js\/[a-zA-Z0-9._-]+\.js)\?v=\d+"/g)].map(m => m[1])
  if (!files.length) throw new Error('check-single-source: no <script src="js/..."> tags in index.html')
  return files
}

const scopes = { js: jsFiles() }

// An empty registry is not a pass -- it is a checker with nothing to check, which is exactly the shape
// that reads as protection while providing none.
if (!facts.length) {
  console.log('  the single-source registry is EMPTY -- this check is asserting nothing. Add a fact or delete the rule.')
  process.exit(1)
}

const findings = []

for (const [name, spec] of facts) {
  const files = scopes[spec.scope]
  if (!files) {
    console.log(`  '${name}' names scope '${spec.scope}', which does not exist. Valid scopes: ${Object.keys(scopes).join(', ')}.`)
    process.exit(1)
  }
  if (!files.includes(spec.file)) {
    console.log(`  '${name}' claims to live in ${spec.file}, which is not in scope '${spec.scope}'. Fix the registry.`)
    process.exit(1)
  }
  const sites = []
  for (const f of files) {
    const src = readFileSync(join(REPO, f), 'utf8').replace(/^﻿/, '')
    // Rebuilt per file: one shared `g` regex carries lastIndex across files and undercounts, which
    // would make a duplicate look like a single source -- a false PASS on the only thing this checks.
    const re = new RegExp(spec.pattern, 'g')
    src.split(/\r?\n/).forEach((line, i) => {
      re.lastIndex = 0
      if (re.test(line)) sites.push(`${f}:${i + 1}`)
    })
  }
  if (sites.length === 1 && sites[0].startsWith(spec.file + ':')) continue
  findings.push({ name, spec, sites })
}

console.log(`  ${facts.length} single-source facts checked across ${scopes.js.length} modules.`)

for (const f of findings) {
  if (!f.sites.length) {
    console.log(`    '${f.name}': NOT FOUND anywhere. It was expected in ${f.spec.file} -- either it moved, or the registry entry is stale.`)
  } else if (f.sites.length > 1) {
    console.log(`    '${f.name}': ${f.sites.length} definitions -- ${f.sites.join(', ')}`)
    console.log(`      It must exist once, in ${f.spec.file}.`)
  } else {
    console.log(`    '${f.name}': moved to ${f.sites[0]} -- the registry says it lives in ${f.spec.file}.`)
  }
  console.log(`      ${f.spec.why}`)
}

if (findings.length) {
  console.log('')
  console.log('  Every duplicate cluster in this codebase began as a second copy that was correct on the day')
  console.log('  it was written. If the move is deliberate, update scripts/single-source.json in the same')
  console.log('  commit so the registry keeps naming the real home.')
  process.exit(1)
}
console.log('  Every registered fact has exactly one definition, in the file that owns it.')
process.exit(0)
