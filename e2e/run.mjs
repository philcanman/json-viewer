// Build first; set CHROME_PATH when Playwright's own Chromium isn't installed
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const EXT = path.resolve('chrome')
const EXE = process.env.CHROME_PATH || chromium.executablePath()

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString(
    'base64url',
  )
export const JWT = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: '123', name: 'Zoë', iat: 1700000000, exp: 4102444799 })}.c2ln`

const fixture = `{
  "name": "json-viewer",
  "nested": { "list": [1, 2, 3], "flag": true, "nothing": null },
  "xss": "<img src=x onerror=\\"window.__pwned=1\\">",
  "url": "https://example.com/a",
  "big": 12345678901234567890,
  "items": [{ "name": "a" }, { "name": "b" }, { "name": "c" }, { "name": "d", "first-name": "Dee" }],
  "a/b": "slash",
  "createdAt": 1700000000,
  "color": "#ff8800",
  "token": "${JWT}",
  "payload": ${JSON.stringify(JSON.stringify({ id: 7, inner: JSON.stringify({ deep: true }) }))},
  "many": [${Array.from({ length: 150 }, (_, i) => i).join(',')}]
}`

const large = JSON.stringify(
  Array.from({ length: 3000 }, (_, i) => ({
    id: i,
    blob: JSON.stringify({ k: i, s: 'x'.repeat(500) }),
  })),
)
const hugeNested = JSON.stringify({
  big: JSON.stringify({ s: 'x'.repeat(1_100_000) }),
})

const routes = {
  '/data.json': ['application/json', fixture],
  '/primitive.json': ['application/json', '123'],
  '/large.json': ['application/json', large],
  '/huge-nested.json': ['application/json', hugeNested],
  '/page.html': [
    'text/html',
    '<!doctype html><body><h1 id="keep">Hello</h1><pre>{"a":1}</pre></body>',
  ],
}
const server = http.createServer((req, res) => {
  const route = routes[req.url]
  if (route) {
    res.setHeader('Content-Type', route[0])
    res.end(route[1])
  } else {
    res.statusCode = req.url === '/favicon.ico' ? 204 : 404
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
export const base = `http://127.0.0.1:${server.address().port}`

let failures = 0
let passes = 0
export const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
  if (ok) passes++
  else failures++
}
// Row ids contain literal backslashes (escaped / and \), which CSS strings treat as escapes
export const row = (page, p) =>
  page.locator(`tr.treeRow[id="${p.replace(/[\\"]/g, '\\$&')}"]`)
export const copied = (page) => page.evaluate(() => window.__copied.at(-1))

export async function withBrowser(locale, fn, { colorScheme = 'light' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'))
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: EXE,
    headless: true,
    locale,
    colorScheme,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  })
  await ctx.addInitScript(() => {
    window.__copied = []
    window.addEventListener('copy', (e) =>
      window.__copied.push(e.clipboardData.getData('text/plain')),
    )
  })
  const errors = []
  try {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on(
      'console',
      (m) =>
        m.type() === 'error' &&
        errors.push(`console: ${m.text()} @ ${m.location().url || ''}`),
    )
    await fn(page, errors)
  } finally {
    await ctx.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/data.json')
  const rendered = await page
    .waitForSelector('.treeTable', { timeout: 10000 })
    .then(
      () => true,
      () => false,
    )
  check('JSON response renders tree view', rendered)
  const tabs = await page.$$eval('.tabs-menu-item', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'tabs are JSON / Raw Data / Headers',
    tabs.join('|') === 'JSON|Raw Data|Headers',
    tabs.join('|'),
  )
  const bodyText = await page.textContent('#content')
  check('xss string shown as text', bodyText.includes('<img src=x onerror='))
  check(
    'xss string not executed',
    (await page.evaluate(() => window.__pwned)) === undefined,
  )
  check(
    'no injected <img> in viewer',
    (await page.$$('#content img')).length === 0,
  )
  check(
    'profiler button absent',
    (await page.$$('.profiler-icon-button')).length === 0,
  )
  check('big number kept losslessly', bodyText.includes('12345678901234567890'))
  check('theme picker rendered', (await page.$$('#jv-theme')).length === 1)
  const buttons = await page.$$eval('button', (b) =>
    b.map((x) => x.textContent.trim()).filter(Boolean),
  )
  check('toolbar buttons have labels', buttons.length >= 3, buttons.join('|'))
  await page.click('.tabs-menu-item:nth-child(2) a')
  check(
    'Raw Data tab opens',
    await page
      .waitForSelector('.textPanelBox, .rawdata', { timeout: 5000 })
      .then(
        () => true,
        () => false,
      ),
  )
  check('no page/console errors', errors.length === 0, errors.join(' ; '))
})

await withBrowser('de', async (page) => {
  await page.goto(base + '/data.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 }).catch(() => {})
  const tabs = await page.$$eval('.tabs-menu-item', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check('German labels used for de', tabs.includes('Rohdaten'), tabs.join('|'))
})

await withBrowser('bs', async (page) => {
  await page.goto(base + '/data.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 }).catch(() => {})
  const btns = await page.$$eval('button', (b) =>
    b.map((x) => x.textContent.trim()).filter(Boolean),
  )
  check(
    'bs: translated strings used, missing ones fall back to English',
    btns.includes('Proširi sve') && btns.includes('Collapse All'),
    btns.join('|'),
  )
})

await withBrowser('en-US', async (page, errors) => {
  const cls = () => page.evaluate(() => document.documentElement.className)
  const waitCls = (c) =>
    page
      .waitForFunction((c) => document.documentElement.className === c, c, {
        timeout: 3000,
      })
      .catch(() => {})
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(base + '/data.json')
  await page.waitForSelector('#jv-theme', { timeout: 10000 })
  check('system theme follows light OS', (await cls()) === 'theme-light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await waitCls('theme-dark')
  check('system theme follows dark OS', (await cls()) === 'theme-dark')
  await page.selectOption('#jv-theme', 'light')
  await waitCls('theme-light')
  check('picking light overrides dark OS', (await cls()) === 'theme-light')
  await page.reload()
  await page.waitForSelector('#jv-theme', { timeout: 10000 })
  await waitCls('theme-light')
  check(
    'picked theme persists across reload',
    (await cls()) === 'theme-light' &&
      (await page.inputValue('#jv-theme')) === 'light',
  )
  await page.selectOption('#jv-theme', 'system')
  await waitCls('theme-dark')
  check('back to system follows dark OS', (await cls()) === 'theme-dark')
  check(
    'no errors during theme checks',
    errors.length === 0,
    errors.join(' ; '),
  )
})

// --- feature suites ---

server.close()
console.log(`${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
