import React from 'react'
import ReactDOM from 'react-dom'
import { logDebug } from '../utils'
import { copyToClipboard } from './clipboard'
import { ContextMenu, MenuActions, MenuModel } from './ContextMenu'
import {
  formatPath,
  parseRowPath,
  PATH_FORMATS,
  PathFormat,
  PathStep,
} from './path'
import { resolve } from './resolve'
import { copyText } from './serialize'
import { DEFAULT_PATH_FORMAT, watchPathFormat } from './settings'
import './features.css'

interface Target {
  row: HTMLElement
  value: unknown
  steps: PathStep[]
  level: number | null
}

const guard = (fn: () => void) => {
  try {
    fn()
  } catch (err) {
    logDebug('json-viewer features:', err)
  }
}

export function installFeatures(content: HTMLElement): void {
  const overlay = document.createElement('div')
  overlay.id = 'jv-overlay'
  document.body.appendChild(overlay)

  let pathFormat: PathFormat = DEFAULT_PATH_FORMAT
  let menu: { model: MenuModel; target: Target } | null = null

  const mainData = (): unknown =>
    (window as unknown as { $json?: { data: unknown } }).$json?.data

  const dataFor = (
    row: HTMLElement,
  ): { data: unknown; level: number | null } | null => {
    if (content.contains(row) && row.closest('.jsonPanelBox')) {
      return { data: mainData(), level: null }
    }
    return null
  }

  const targetOf = (el: EventTarget | null): Target | null => {
    if (!(el instanceof Element)) return null
    const row = el.closest<HTMLElement>('tr.treeRow')
    if (!row) return null
    const ctx = dataFor(row)
    if (!ctx || ctx.data === undefined) return null
    const r = resolve(ctx.data, parseRowPath(row.id))
    return r.found
      ? { row, value: r.value, steps: r.steps, level: ctx.level }
      : null
  }

  const closeMenu = () => {
    if (menu) {
      menu = null
      render()
    }
  }

  const actions: MenuActions = {
    copyPath: (f) =>
      guard(() => {
        if (menu) copyToClipboard(menu.model.paths[f])
        closeMenu()
      }),
    copyValue: () =>
      guard(() => {
        if (menu) copyToClipboard(copyText(menu.target.value))
        closeMenu()
      }),
    viewJson: closeMenu,
    close: closeMenu,
  }

  function render() {
    ReactDOM.render(
      <>
        {menu && (
          <ContextMenu
            key={`${menu.model.x},${menu.model.y}`}
            model={menu.model}
            actions={actions}
          />
        )}
      </>,
      overlay,
    )
  }

  document.addEventListener('contextmenu', (e) =>
    guard(() => {
      const target = targetOf(e.target)
      if (!target) return
      e.preventDefault()
      const paths = {} as Record<PathFormat, string>
      for (const f of PATH_FORMATS) paths[f] = formatPath(target.steps, f)
      menu = {
        model: {
          x: e.clientX,
          y: e.clientY,
          defaultFormat: pathFormat,
          paths,
          canViewJson: false,
        },
        target,
      }
      render()
    }),
  )
  document.addEventListener(
    'mousedown',
    (e) => {
      const inMenu =
        e.target instanceof Node &&
        overlay.querySelector('.jv-menu')?.contains(e.target)
      if (menu && !inMenu) closeMenu()
    },
    true,
  )
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('blur', closeMenu)

  watchPathFormat((f) => {
    pathFormat = f
    if (menu) {
      menu = { ...menu, model: { ...menu.model, defaultFormat: f } }
      render()
    }
  })
}
