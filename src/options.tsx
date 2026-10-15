import React, { FC, useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { logDebug } from './utils'
import { PathFormat } from './features/path'
import {
  DEFAULT_PATH_FORMAT,
  normalizePathFormat,
  savePathFormat,
  watchPathFormat,
} from './features/settings'

const availableThemes = ['light', 'dark'] as const

const useTheme = () => {
  const preferDark = useMedia('(prefers-color-scheme:dark)')
  const [userTheme, _setTheme] = useState<(typeof availableThemes)[number]>()
  const [ready, setReady] = useState(false)

  const setUserTheme = (v: any) => {
    logDebug('set theme', v)
    if (availableThemes.includes(v)) {
      _setTheme(v)
      chrome.storage.sync.set({ theme: v })
    } else {
      _setTheme(undefined)
      chrome.storage.sync.remove('theme')
    }
  }

  useEffect(() => {
    chrome.storage.sync.get('theme', ({ theme: v }) => {
      logDebug('load theme', v)
      if (availableThemes.includes(v)) {
        _setTheme(v)
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const value = userTheme ?? (preferDark ? 'dark' : 'light')
    document.documentElement.setAttribute('class', 'theme-' + value)
    document.documentElement.style.setProperty('color-scheme', value) // for scrollbar
  }, [preferDark, userTheme])

  return {
    ready,
    userTheme,
    setUserTheme,
  }
}

const usePathFormat = () => {
  const [format, setFormat] = useState<PathFormat>(DEFAULT_PATH_FORMAT)
  useEffect(() => watchPathFormat(setFormat), [])
  return {
    format,
    setFormat: (v: string) => savePathFormat(normalizePathFormat(v)),
  }
}

export const Options: FC = () => {
  const { userTheme, setUserTheme } = useTheme()
  const pathFormat = usePathFormat()

  return (
    <div
      style={{
        position: 'fixed',
        top: 5,
        right: 10,
        userSelect: 'none',
      }}
    >
      Theme:&nbsp;&nbsp;
      <select
        id="jv-theme"
        value={userTheme ?? 'system'}
        onChange={(e) => {
          setUserTheme(e.target.value)
        }}
      >
        <option key="">system</option>
        {availableThemes.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      &nbsp;&nbsp;&nbsp;&nbsp;Path:&nbsp;&nbsp;
      <select
        id="jv-path-format"
        value={pathFormat.format}
        onChange={(e) => pathFormat.setFormat(e.target.value)}
      >
        <option value="js">JS</option>
        <option value="jsonpath">JSONPath</option>
        <option value="jq">jq</option>
      </select>
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://github.com/pd4d10/json-viewer" target="_blank">
        Source Code
      </a>
    </div>
  )
}

export default Options
