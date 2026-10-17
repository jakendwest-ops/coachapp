// Runs ONLY the git-ignored throwaway probes (tests/_debug-*.spec.js), which the normal config never collects (playwright.config.js testIgnore).
//   npx playwright test -c playwright.probe.config.js
// A probe is a scratch file: delete it when done (OneDrive can bring a deleted file back; check `ls tests | grep _debug-` before a release).
const base = require('./playwright.config')
module.exports = { ...base, testIgnore: [], testMatch: '**/_debug-*.spec.js' }
