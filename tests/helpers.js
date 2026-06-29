require('dotenv').config()

const PT_EMAIL     = process.env.PT_EMAIL
const PT_PASSWORD  = process.env.PT_PASSWORD
const CLIENT_EMAIL = process.env.CLIENT_EMAIL
const CLIENT_PASSWORD = process.env.CLIENT_PASSWORD

async function loginAs(page, email, password) {
  await page.goto('/')
  // Wait for auth screen to appear
  await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 10000 })
  // Fill login form (it's shown by default)
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.click('#login-submit')
  // Wait for app shell to appear (auth successful)
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 15000 })
}

async function loginAsPT(page) {
  // Set _activeView before app loads so it always starts in coach mode
  // (a previous test may have left _activeView=solo in localStorage)
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('_activeView', 'coach'))
  await loginAs(page, PT_EMAIL, PT_PASSWORD)
  // #app-shell is visible before loadUserInfo finishes rendering the dashboard.
  // Wait for the PT dashboard h1 — only renders after loadUserInfo completes.
  await page.waitForSelector('h1:has-text("Welcome back")', { timeout: 15000 })
}

async function loginAsClient(page) {
  await loginAs(page, CLIENT_EMAIL, CLIENT_PASSWORD)
}

module.exports = { loginAsPT, loginAsClient }
