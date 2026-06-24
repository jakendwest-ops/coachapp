const { test: base, expect } = require('@playwright/test')

/**
 * Extended test fixture that automatically captures browser console errors
 * and uncaught page exceptions on every test.
 *
 * Errors are surfaced as annotations in the HTML report — tests don't fail
 * automatically, but errors are always visible alongside the result.
 */
exports.test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleErrors = []
    const pageErrors = []

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    page.on('pageerror', err => {
      pageErrors.push(err.message)
    })

    await use(page)

    if (consoleErrors.length > 0) {
      testInfo.annotations.push({
        type: 'console errors',
        description: consoleErrors.join('\n'),
      })
    }

    if (pageErrors.length > 0) {
      testInfo.annotations.push({
        type: 'page crash / uncaught error',
        description: pageErrors.join('\n'),
      })
    }
  },
})

exports.expect = expect
