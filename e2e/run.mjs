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

const bigJwt = `${b64url({ alg: 'HS256' })}.${b64url(Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`claim${i}`, `value ${i}`])))}.c2ln`
const records = JSON.stringify([
  {
    payload: JSON.stringify({
      x: JSON.stringify({ a: 1 }),
      list: Array.from({ length: 60 }, (_, i) => ({ i, name: `n${i}` })),
    }),
  },
  { payload: JSON.stringify({ x: 'plain' }) },
  { token: bigJwt },
])

const routes = {
  '/records.json': ['application/json', records],
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
const nativeMenuAllowed = (page) =>
  page.evaluate(() => window.__ctx.at(-1) === false)
const themeColor = (page, cssVar) =>
  page.evaluate((v) => {
    const probe = document.createElement('div')
    probe.style.background = `var(${v})`
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, cssVar)

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
    window.__ctx = []
    window.addEventListener('contextmenu', (e) =>
      window.__ctx.push(e.defaultPrevented),
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

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/data.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  const menu = page.locator('.jv-menu').first()
  const openMenu = async (p) => {
    await page.mouse.click(1, 1)
    await row(page, p).locator('td.treeLabelCell').click({ button: 'right' })
  }

  await openMenu('/items/3/name')
  check(
    'menu opens on row right-click',
    await menu.isVisible().catch(() => false),
  )
  check(
    'menu previews default JS path',
    (
      (await page
        .locator('[data-action="copy-path"]')
        .textContent()
        .catch(() => '')) ?? ''
    ).includes('items[3].name'),
  )
  await page.locator('[data-action="copy-path"]').click()
  check(
    'Copy path copies JS path',
    (await copied(page)) === 'items[3].name',
    await copied(page),
  )
  check(
    'menu closes after copy',
    (await page.locator('.jv-menu').count()) === 0,
  )

  for (const [format, expected] of [
    ['jsonpath', '$.items[3].name'],
    ['jq', '.items[3].name'],
    ['js', 'items[3].name'],
  ]) {
    await openMenu('/items/3/name')
    await page.locator('[data-action="copy-path-as"]').hover()
    await page.locator(`.jv-submenu [data-format="${format}"]`).click()
    check(
      `Copy path as ${format}`,
      (await copied(page)) === expected,
      await copied(page),
    )
  }

  await openMenu('/items/3/first-name')
  await page.locator('[data-action="copy-path"]').click()
  check(
    'odd key copies bracket form',
    (await copied(page)) === 'items[3]["first-name"]',
    await copied(page),
  )

  await openMenu('/a\\/b')
  await page.locator('[data-action="copy-path"]').click()
  check(
    '/slash key copies as one key',
    (await copied(page)) === '["a/b"]',
    await copied(page),
  )
  await openMenu('/a\\/b')
  await page.locator('[data-action="copy-value"]').click()
  check(
    '/slash key value resolves',
    (await copied(page)) === 'slash',
    await copied(page),
  )

  await openMenu('/big')
  await page.locator('[data-action="copy-value"]').click()
  check(
    'Copy value keeps 20-digit number',
    (await copied(page)) === '12345678901234567890',
    await copied(page),
  )

  await openMenu('/nested')
  await page.locator('[data-action="copy-value"]').click()
  check(
    'Copy value pretty-prints objects',
    (await copied(page)) ===
      JSON.stringify({ list: [1, 2, 3], flag: true, nothing: null }, null, 2),
    await copied(page),
  )

  await openMenu('/name')
  await page.keyboard.press('Escape')
  check('Escape closes menu', (await page.locator('.jv-menu').count()) === 0)

  await openMenu('/name')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  check(
    'keyboard reaches Copy value',
    (await copied(page)) === 'json-viewer',
    await copied(page),
  )

  await openMenu('/many/[0…99]')
  check(
    'bucket row keeps native menu',
    (await page.locator('.jv-menu').count()) === 0 &&
      (await nativeMenuAllowed(page)),
  )

  await page.selectOption('#jv-path-format', 'jq')
  await page.waitForTimeout(300)
  await page.reload()
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  check(
    'path format persists across reload',
    (await page.inputValue('#jv-path-format')) === 'jq',
  )
  await openMenu('/items/3/name')
  check(
    'default format changes Copy path preview',
    (
      (await page.locator('[data-action="copy-path"]').textContent()) ?? ''
    ).includes('.items[3].name'),
  )
  await page.keyboard.press('Escape')
  check('no errors during menu checks', errors.length === 0, errors.join(' ; '))
})

await withBrowser(
  'en-US',
  async (page) => {
    await page.goto(base + '/data.json')
    await page.waitForSelector('.treeTable', { timeout: 10000 })
    await row(page, '/name')
      .locator('td.treeLabelCell')
      .click({ button: 'right' })
    const bg = (sel) =>
      page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor)
    const body = await themeColor(page, '--theme-body-background')
    const toolbar = await themeColor(page, '--theme-toolbar-background')
    const menuBg = await bg('.jv-menu')
    check(
      'menu follows dark theme',
      menuBg === body && body !== 'rgb(255, 255, 255)',
      `${menuBg} vs ${body}`,
    )
    await page.keyboard.press('Escape')
    await page.mouse.move(1, 1)
    await row(page, '/createdAt').locator('td.treeValueCell').hover()
    await page.waitForSelector('.jv-tooltip', { timeout: 2000 }).catch(() => {})
    const tipBg = await bg('.jv-tooltip').catch(() => '')
    check(
      'tooltip follows dark theme',
      tipBg === toolbar,
      `${tipBg} vs ${toolbar}`,
    )
    await page.mouse.move(1, 1)
    await row(page, '/payload').locator('.jv-nested-badge').click()
    const panelBg = await bg('#jv-panel').catch(() => '')
    check('panel follows dark theme', panelBg === body, `${panelBg} vs ${body}`)
  },
  { colorScheme: 'dark' },
)

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/primitive.json')
  await page.waitForTimeout(1000)
  await page.mouse.click(50, 50, { button: 'right' })
  check(
    'root primitive: no overlay menu, no errors',
    (await page.locator('.jv-menu').count()) === 0 &&
      errors.length === 0 &&
      (await nativeMenuAllowed(page)),
    errors.join(' ; '),
  )
})

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/data.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  const hoverText = async (p) => {
    await page.mouse.move(1, 1)
    await page.waitForTimeout(100)
    await row(page, p).locator('td.treeValueCell').hover()
    await page.waitForSelector('.jv-tooltip', { timeout: 2000 }).catch(() => {})
    return (
      (await page
        .locator('.jv-tooltip')
        .textContent()
        .catch(() => '')) ?? ''
    )
  }
  const ts = await hoverText('/createdAt')
  check(
    'timestamp hover shows local date and relative time',
    /2023/.test(ts) && /ago/.test(ts),
    ts,
  )
  const color = await hoverText('/color')
  check('color hover shows rgb', color.includes('rgb(255, 136, 0)'), color)
  const swatch = await page
    .locator('.jv-swatch span')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
    .catch(() => '')
  check('color hover paints swatch', swatch === 'rgb(255, 136, 0)', swatch)
  const token = await hoverText('/token')
  check(
    'JWT hover decodes claims locally',
    token.includes('"sub": "123"') &&
      token.includes('Zoë') &&
      token.includes('Signature not verified'),
    token.slice(0, 120),
  )
  await page.mouse.move(1, 1)
  await row(page, '/name').locator('td.treeValueCell').hover()
  await page.waitForTimeout(700)
  check(
    'no hover for plain strings',
    (await page.locator('.jv-tooltip').count()) === 0,
  )
  check(
    'no errors during hover checks',
    errors.length === 0,
    errors.join(' ; '),
  )
})

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/data.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  const panelRow = (p) => page.locator('#jv-panel').locator(row(page, p))
  check(
    'badge on JSON string',
    (await row(page, '/payload').locator('.jv-nested-badge').count()) === 1,
  )
  check(
    'no badge on plain string',
    (await row(page, '/name').locator('.jv-nested-badge').count()) === 0,
  )
  await row(page, '/payload').locator('.jv-nested-badge').click()
  check(
    'panel opens',
    await page
      .locator('#jv-panel')
      .isVisible()
      .catch(() => false),
  )
  check('panel shows parsed keys', (await panelRow('/id').count()) === 1)
  check(
    'first crumb is source path',
    ((await page.locator('.jv-crumb').first().textContent()) ?? '') ===
      'payload',
  )
  await panelRow('/inner').locator('.jv-nested-badge').click()
  check(
    'second level opens',
    (await page.locator('.jv-crumb').count()) === 2 &&
      (await panelRow('/deep').count()) === 1,
  )
  await panelRow('/deep').locator('td.treeLabelCell').click({ button: 'right' })
  await page.locator('[data-action="copy-path"]').click()
  check(
    'panel copy path is relative',
    (await copied(page)) === 'deep',
    await copied(page),
  )
  await page.locator('.jv-crumb').first().click()
  check(
    'breadcrumb goes back',
    (await page.locator('.jv-crumb').count()) === 1 &&
      (await panelRow('/id').count()) === 1,
  )
  await page.locator('.jv-panel-close').click()
  check('close removes panel', (await page.locator('#jv-panel').count()) === 0)
  await row(page, '/payload')
    .locator('td.treeLabelCell')
    .click({ button: 'right' })
  await page.locator('[data-action="view-json"]').click()
  check('View as JSON opens panel', (await panelRow('/id').count()) === 1)
  check(
    'no errors during panel checks',
    errors.length === 0,
    errors.join(' ; '),
  )
})

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/huge-nested.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  check(
    'no badge over 1,000,000 chars',
    (await row(page, '/big').locator('.jv-nested-badge').count()) === 0,
  )
  await row(page, '/big').locator('td.treeLabelCell').click({ button: 'right' })
  await page.locator('[data-action="view-json"]').click()
  check(
    'View as JSON still opens huge string',
    (await page.locator('#jv-panel tr.treeRow[id="/s"]').count()) === 1,
  )
  check('no errors on huge nested', errors.length === 0, errors.join(' ; '))
})

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/large.json')
  await page.waitForSelector('.treeTable', { timeout: 15000 })
  const started = Date.now()
  await page.getByRole('button', { name: 'Expand All' }).click()
  const badged = await page
    .waitForFunction(
      () => document.querySelectorAll('.jv-nested-badge').length >= 3000,
      null,
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    )
  const ms = Date.now() - started
  check(
    'large doc: Expand All badges all 3000 rows within 5 s',
    badged && ms < 5000,
    `${ms} ms`,
  )
  check('no errors on large doc', errors.length === 0, errors.join(' ; '))
})

await withBrowser('en-US', async (page, errors) => {
  await page.goto(base + '/records.json')
  await page.waitForSelector('.treeTable', { timeout: 10000 })
  const panelBody = page.locator('.jv-panel-body')
  const panelRow = (p) => page.locator('#jv-panel').locator(row(page, p))

  await row(page, '/0/payload').locator('.jv-nested-badge').click()
  await panelBody.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(200)
  const before = await panelBody.evaluate((el) => el.scrollTop)
  await panelRow('/list/59/name')
    .locator('td.treeLabelCell')
    .click({ button: 'right' })
  await page.waitForTimeout(300)
  const after = await panelBody.evaluate((el) => el.scrollTop)
  check(
    'panel keeps its scroll position when the menu opens',
    before > 0 && after === before,
    `${before} -> ${after}`,
  )
  check(
    'menu stays open over a scrolled panel',
    (await page.locator('.jv-menu').count()) === 1,
  )

  await page.keyboard.press('Escape')
  const edgeCell = panelRow('/list/59/name').locator('td.treeValueCell')
  const edgeBox = await edgeCell.boundingBox()
  await edgeCell.click({
    button: 'right',
    position: { x: edgeBox.width - 5, y: edgeBox.height / 2 },
  })
  await page.locator('[data-action="copy-path-as"]').hover()
  const sub = await page.locator('.jv-submenu').boundingBox()
  const vw = await page.evaluate(() => innerWidth)
  check(
    'submenu stays inside the viewport',
    !!sub && sub.x >= 0 && sub.x + sub.width <= vw,
    JSON.stringify(sub),
  )
  await page.keyboard.press('Escape')

  check(
    'level 0 string with JSON has a badge',
    (await panelRow('/x').locator('.jv-nested-badge').count()) === 1,
  )
  await row(page, '/1/payload').locator('.jv-nested-badge').click()
  check(
    'replacing level 0 drops stale badges',
    (await panelRow('/x').locator('.jv-nested-badge').count()) === 0,
  )

  const filter = await page
    .locator('.jsonPanelBox .devtools-filterinput')
    .boundingBox()
  const topEl =
    filter &&
    (await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: filter.x + filter.width / 2, y: filter.y + filter.height / 2 },
    ))
  check('panel leaves the Filter box usable', topEl === 'INPUT', String(topEl))

  await page.click('.tabs-menu-item:nth-child(2) a')
  check(
    'panel hidden on Raw Data tab',
    (await page.locator('#jv-panel').count()) === 0,
  )
  await page.click('.tabs-menu-item:nth-child(1) a')
  check(
    'panel returns on JSON tab',
    (await page.locator('#jv-panel').count()) === 1,
  )
  await page.locator('.jv-panel-close').click()

  await page.mouse.move(1, 1)
  await row(page, '/2/token')
    .locator('td.treeValueCell')
    .hover({ position: { x: 20, y: 10 } })
  await page.waitForSelector('.jv-tooltip', { timeout: 2000 }).catch(() => {})
  const scrollable = await page
    .locator('.jv-tooltip')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
    .catch(() => false)
  await page
    .locator('.jv-tooltip')
    .evaluate((el) => {
      el.scrollTop = 100
    })
    .catch(() => {})
  await page.waitForTimeout(200)
  const tipsAfter = await page.locator('.jv-tooltip').count()
  check(
    'long tooltip can be scrolled without closing',
    scrollable && tipsAfter === 1,
    `scrollable=${scrollable} tooltips=${tipsAfter}`,
  )

  await page.mouse.move(1, 1)
  await page.evaluate(() => {
    const cell = document.querySelector(
      'tr.treeRow[id="/0/payload"] td.treeLabelCell',
    )
    const range = document.createRange()
    range.selectNodeContents(cell)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await row(page, '/0/payload')
    .locator('td.treeLabelCell')
    .click({ button: 'right' })
  check(
    'right-click on selected text keeps native menu',
    (await page.locator('.jv-menu').count()) === 0 &&
      (await nativeMenuAllowed(page)),
  )

  const selected = await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(
      document.querySelector('tr.treeRow[id="/1/payload"]'),
    )
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    return getSelection().toString()
  })
  check(
    'badge glyph not in selected text',
    selected.includes('payload') && !selected.includes('{…}'),
    JSON.stringify(selected),
  )
  check(
    'no errors during review-fix checks',
    errors.length === 0,
    errors.join(' ; '),
  )
})

server.close()
console.log(`${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
