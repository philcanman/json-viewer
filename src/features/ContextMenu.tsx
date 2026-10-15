import React, { useLayoutEffect, useRef, useState } from 'react'
import { PATH_FORMATS, PathFormat } from './path'

export interface MenuModel {
  x: number
  y: number
  defaultFormat: PathFormat
  paths: Record<PathFormat, string>
  canViewJson: boolean
}

export interface MenuActions {
  copyPath(format: PathFormat): void
  copyValue(): void
  viewJson(): void
  close(): void
}

const LABELS: Record<PathFormat, string> = {
  js: 'JS',
  jsonpath: 'JSONPath',
  jq: 'jq',
}
const PREVIEW_MAX = 60

const preview = (p: string) => {
  const s = p || '(root)'
  return s.length > PREVIEW_MAX ? s.slice(0, PREVIEW_MAX - 1) + '…' : s
}

export function ContextMenu({
  model,
  actions,
}: {
  model: MenuModel
  actions: MenuActions
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [subOpen, setSubOpen] = useState(false)
  const [pos, setPos] = useState({ left: model.x, top: model.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(0, Math.min(model.x, innerWidth - r.width)),
      top: Math.max(0, Math.min(model.y, innerHeight - r.height)),
    })
    el.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [],
    )
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      actions.close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (
      e.key === 'ArrowRight' &&
      (document.activeElement as HTMLElement | null)?.dataset.action ===
        'copy-path-as'
    ) {
      e.preventDefault()
      setSubOpen(true)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSubOpen(false)
    }
  }

  return (
    <div
      ref={ref}
      className="jv-menu"
      role="menu"
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        role="menuitem"
        className="jv-menu-item"
        data-action="copy-path"
        onClick={() => actions.copyPath(model.defaultFormat)}
      >
        <span>Copy path</span>
        <span className="jv-menu-preview">
          {preview(model.paths[model.defaultFormat])}
        </span>
      </button>
      <div
        className="jv-menu-sub"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={subOpen}
          className="jv-menu-item"
          data-action="copy-path-as"
          onClick={() => setSubOpen(!subOpen)}
        >
          <span>Copy path as</span>
          <span className="jv-menu-preview">▸</span>
        </button>
        {subOpen && (
          <div className="jv-menu jv-submenu" role="menu">
            {PATH_FORMATS.map((f) => (
              <button
                key={f}
                role="menuitem"
                className="jv-menu-item"
                data-format={f}
                onClick={() => actions.copyPath(f)}
              >
                <span>
                  {f === model.defaultFormat ? '✓ ' : ''}
                  {LABELS[f]}
                </span>
                <span className="jv-menu-preview">
                  {preview(model.paths[f])}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        role="menuitem"
        className="jv-menu-item"
        data-action="copy-value"
        onClick={actions.copyValue}
      >
        <span>Copy value</span>
      </button>
      {model.canViewJson && (
        <button
          role="menuitem"
          className="jv-menu-item"
          data-action="view-json"
          onClick={actions.viewJson}
        >
          <span>View as JSON</span>
        </button>
      )}
    </div>
  )
}
