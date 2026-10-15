// @ts-check
import crypto from 'crypto'
import fs from 'fs-extra'
import gulp from 'gulp'
import download from 'gulp-download-stream'
import unzip from 'gulp-unzip'
import rename from 'gulp-rename'
import gulpif from 'gulp-if'
import replace from 'gulp-replace'
import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import { deleteAsync } from 'del'

const color = 'rgba(135, 135, 137, 0.9)'

// Firefox 158.0 (FIREFOX_158_0_RELEASE)
const geckoRev = 'eb9a6e3a736802c8e080a76c44dc81f409d99d54'
const geckoSha256 =
  '9c0db5752688a9416ed47ebb436650b9ad2fcbb00fcd31c6cec65b79be45763c'

// https://hg.mozilla.org/releases/mozilla-release/file/eb9a6e3a736802c8e080a76c44dc81f409d99d54/devtools/client
export const downloadGeckoZip = () => {
  return download({
    file: 'gecko.zip',
    url: `https://hg.mozilla.org/releases/mozilla-release/archive/${geckoRev}.zip/devtools/client/`,
  }).pipe(gulp.dest('.'))
}

const verifyGeckoZip = async () => {
  const hash = crypto
    .createHash('sha256')
    .update(await fs.readFile('./gecko.zip'))
    .digest('hex')
  if (hash !== geckoSha256) {
    throw new Error(
      `gecko.zip sha256 mismatch: expected ${geckoSha256}, got ${hash}`
    )
  }
}

export const downloadL10nList = async (done) => {
  const html = await fetch('https://hg.mozilla.org/l10n-central').then((res) =>
    res.text()
  )
  const $ = cheerio.load(html)
  const locales = $('table')
    .first()
    .find('td:first-child')
    .slice(1)
    .map((i, el) => $(el).text().trim())
    .toArray()
  console.log(locales)

  fs.writeJsonSync('./vendor/l10n.json', locales)
  done()
}

export const downloadL10nContent = async (done) => {
  const locales = fs.readJsonSync('./vendor/l10n.json')
  fs.ensureDirSync('./vendor/l10n')
  for (const locale of locales) {
    const res = await fetch(
      `https://hg.mozilla.org/l10n-central/${locale}/raw-file/tip/devtools/client/jsonview.properties`
    )
    if (!res.ok) {
      console.log(locale, 'not found')
      continue
    }
    const text = await res.text()
    fs.writeFileSync(`./vendor/l10n/${locale}.properties`, text)
  }
  done()
}

export const gecko = gulp.series(
  verifyGeckoZip,
  () => {
    return deleteAsync('./vendor/gecko')
  },
  () => {
    return gulp
      .src('./gecko.zip')
      .pipe(unzip())
      .pipe(
        rename((obj) => {
          obj.dirname = obj.dirname.replace(/mozilla-release-.*?\//, 'gecko/')
        })
      )
      .pipe(
        replace(
          // devtools/client/shared/components/reps/reps/custom-formatter.mjs
          `loader.require("resource://devtools/shared/flags.js")`,
          '{ testing: false }'
        )
      )
      .pipe(
        replace(
          // devtools/client/shared/components/Tree.js
          `require("resource://devtools/shared/l10n.js")`,
          '{}'
        )
      )
      .pipe(
        replace(
          new RegExp('resource://', 'g'),
          process.cwd() + '/vendor/gecko/'
        )
      )
      .pipe(
        replace(
          new RegExp('chrome://devtools/skin', 'g'),
          'devtools/client/themes'
        )
      )
      .pipe(
        replace(new RegExp('chrome://devtools/content', 'g'), 'devtools/client')
      )
      .pipe(
        gulpif(
          (file) => file.path.endsWith('arrow.svg'),
          replace(/fill="(.*?)"/, `fill="${color}"`)
        )
      )
      .pipe(
        gulpif(
          (file) => file.path.endsWith('filter-small.svg'),
          replace(/<svg/, `<svg fill="${color}"`)
        )
      )
      .pipe(gulp.dest('./vendor'))
  }
)
