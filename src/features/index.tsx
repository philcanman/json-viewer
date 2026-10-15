import React from 'react'
import ReactDOM from 'react-dom'
import { logDebug } from '../utils'
import { copyToClipboard } from './clipboard'
import { classify } from './classify'
import { looksLikeJson, parseNested } from './nestedJson'
import { PanelLevel, SidePanel } from './SidePanel'
import { Tooltip, TooltipModel } from './Tooltip'
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

const HOVER_DELAY_MS = 300
const BADGE_MAX_LENGTH = 1_000_000

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
  // Separate roots so menu/tooltip renders never re-render the panel's TreeView
  const panelRoot = document.createElement('div')
  const layerRoot = document.createElement('div')
  overlay.append(panelRoot, layerRoot)
  document.body.appendChild(overlay)

  let pathFormat: PathFormat = DEFAULT_PATH_FORMAT
  let menu: { model: MenuModel; target: Target } | null = null

  let tooltip: TooltipModel | null = null
  let hoverTimer: number | undefined
  let hoverCell: Element | null = null

  const hideTooltip = () => {
    window.clearTimeout(hoverTimer)
    hoverCell = null
    if (tooltip) {
      tooltip = null
      render()
    }
  }

  let levels: PanelLevel[] = []
  let nextLevelId = 0
  let jsonTabActive = true
  let panelWidth = Math.round(window.innerWidth * 0.4)
  const nestedCache = new Map<string, boolean>()

  const setLevels = (next: PanelLevel[]) => {
    levels = next
    for (const key of Array.from(nestedCache.keys())) {
      if (!key.startsWith('main:')) nestedCache.delete(key)
    }
    hideTooltip()
    renderPanel()
  }

  const openNested = (target: Target) => {
    if (typeof target.value !== 'string') return
    const level: PanelLevel = {
      id: nextLevelId++,
      title: formatPath(target.steps, pathFormat) || '(root)',
      value: parseNested(target.value),
      sourceLength: target.value.length,
    }
    setLevels(
      target.level === null
        ? [level]
        : [...levels.slice(0, target.level + 1), level],
    )
  }

  const panelTop = () =>
    document.querySelector('.tabs-navigation')?.getBoundingClientRect()
      .bottom ?? 0

  const mainData = (): unknown =>
    (window as unknown as { $json?: { data: unknown } }).$json?.data

  const dataFor = (
    row: HTMLElement,
  ): { data: unknown; level: number | null } | null => {
    const panelTree = row.closest<HTMLElement>('[data-jv-level]')
    if (panelTree && overlay.contains(panelTree)) {
      const level = Number(panelTree.dataset.jvLevel)
      return levels[level] ? { data: levels[level].value, level } : null
    }
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
    viewJson: () =>
      guard(() => {
        const target = menu?.target
        closeMenu()
        if (target) openNested(target)
      }),
    close: closeMenu,
  }

  function renderPanel() {
    ReactDOM.render(
      <>
        {levels.length > 0 && jsonTabActive && (
          <SidePanel
            levels={levels}
            width={panelWidth}
            top={panelTop()}
            onPop={(i) => setLevels(levels.slice(0, i + 1))}
            onClose={() => setLevels([])}
            onResize={(w) => {
              panelWidth = w
              renderPanel()
            }}
          />
        )}
      </>,
      panelRoot,
    )
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
        {tooltip && <Tooltip model={tooltip} />}
      </>,
      layerRoot,
    )
  }

  document.addEventListener('contextmenu', (e) =>
    guard(() => {
      const target = targetOf(e.target)
      if (!target) return
      const selection = getSelection()
      if (
        selection &&
        !selection.isCollapsed &&
        selection.containsNode(target.row, true)
      ) {
        return
      }
      e.preventDefault()
      hideTooltip()
      const paths = {} as Record<PathFormat, string>
      for (const f of PATH_FORMATS) paths[f] = formatPath(target.steps, f)
      menu = {
        model: {
          x: e.clientX,
          y: e.clientY,
          defaultFormat: pathFormat,
          paths,
          canViewJson:
            typeof target.value === 'string' && looksLikeJson(target.value),
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
  window.addEventListener(
    'scroll',
    (e) => {
      const tip = layerRoot.querySelector('.jv-tooltip')
      if (e.target instanceof Node && tip?.contains(e.target)) return
      hideTooltip()
    },
    true,
  )
  window.addEventListener('TabChanged', (e) =>
    guard(() => {
      jsonTabActive = (e as CustomEvent).detail?.index === 0
      closeMenu()
      hideTooltip()
      renderPanel()
    }),
  )
  document.documentElement.addEventListener('mouseleave', hideTooltip)
  document.addEventListener('mouseover', (e) =>
    guard(() => {
      if (!(e.target instanceof Element)) return
      if (e.target.closest('.jv-tooltip')) {
        window.clearTimeout(hoverTimer)
        return
      }
      const cell = e.target.closest('td.treeValueCell')
      if (cell === hoverCell) return
      hideTooltip()
      if (!cell) return
      hoverCell = cell
      hoverTimer = window.setTimeout(
        () =>
          guard(() => {
            if (menu || hoverCell !== cell) return
            const target = targetOf(cell)
            const hint = target && classify(target.value, Date.now())
            if (!hint) return
            const r = cell.getBoundingClientRect()
            tooltip = {
              hint,
              anchor: { left: r.left, top: r.top, bottom: r.bottom },
              now: Date.now(),
            }
            render()
          }),
        HOVER_DELAY_MS,
      )
    }),
  )

  watchPathFormat((f) => {
    pathFormat = f
    if (menu) {
      menu = { ...menu, model: { ...menu.model, defaultFormat: f } }
      render()
    }
  })

  const addBadge = (row: HTMLElement) => {
    const cell = row.querySelector<HTMLElement>('td.treeValueCell')
    if (!cell) return
    const existing = cell.querySelector('.jv-nested-badge')
    if (existing) {
      if (existing !== cell.lastElementChild) cell.appendChild(existing)
      return
    }
    const target = targetOf(row)
    if (
      !target ||
      typeof target.value !== 'string' ||
      target.value.length > BADGE_MAX_LENGTH
    ) {
      return
    }
    const key = `${target.level ?? 'main'}:${row.id}`
    let nested = nestedCache.get(key)
    if (nested === undefined) {
      nested = parseNested(target.value) !== null
      nestedCache.set(key, nested)
    }
    if (!nested) return
    const badge = document.createElement('span')
    badge.className = 'jv-nested-badge'
    badge.setAttribute('role', 'button')
    badge.tabIndex = 0
    badge.title = 'View as JSON'
    badge.setAttribute('aria-label', 'View as JSON')
    // Stops the click before React's document listener toggles the row
    const open = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      guard(() => {
        const t = targetOf(row)
        if (t) openNested(t)
      })
    }
    badge.addEventListener('click', open)
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e)
    })
    cell.appendChild(badge)
  }

  const scan = (node: HTMLElement) => {
    if (node.matches('tr.stringRow')) addBadge(node)
    node.querySelectorAll<HTMLElement>('tr.stringRow').forEach(addBadge)
  }

  const observer = new MutationObserver((records) =>
    guard(() => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) scan(n)
        })
        if (
          r.target instanceof HTMLElement &&
          r.target.matches('td.treeValueCell')
        ) {
          const row = r.target.closest<HTMLElement>('tr.stringRow')
          if (row) addBadge(row)
        }
      }
    }),
  )
  observer.observe(content, { childList: true, subtree: true })
  observer.observe(overlay, { childList: true, subtree: true })
  scan(content)
}
