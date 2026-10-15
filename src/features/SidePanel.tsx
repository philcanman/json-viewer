import React, { useMemo } from 'react'
import TreeView from 'devtools/client/shared/components/tree/TreeView.mjs'
import { Rep } from 'devtools/client/shared/components/reps/reps/rep.mjs'
import { MODE } from 'devtools/client/shared/components/reps/reps/constants.mjs'

export interface PanelLevel {
  id: number
  title: string
  value: object | null
  sourceLength: number
}

// Same thresholds as devtools/client/jsonview/json-viewer.mjs:24-25 and JsonPanel.mjs
const AUTO_EXPAND_MAX_LENGTH = 100 * 1024
const AUTO_EXPAND_MAX_LEVEL = 7
const MAX_STRING_LENGTH = 250
const MIN_WIDTH = 280

function renderValue(props: any) {
  const { member } = props
  if (member.type === 'bucket') return null
  if (
    typeof member.value === 'object' &&
    member.value !== null &&
    member.hasChildren &&
    member.open
  ) {
    return null
  }
  return React.createElement(Rep, {
    ...props,
    cropLimit: MAX_STRING_LENGTH,
    noGrip: true,
    isInContentPage: true,
  })
}

function LevelTree({ level, index }: { level: PanelLevel; index: number }) {
  const expandedNodes = useMemo(
    () =>
      level.value && level.sourceLength <= AUTO_EXPAND_MAX_LENGTH
        ? TreeView.getExpandedNodes(level.value, {
            maxLevel: AUTO_EXPAND_MAX_LEVEL,
          })
        : new Set(),
    [level],
  )
  if (!level.value) return <div className="jv-panel-error">Not valid JSON</div>
  return (
    <div className="jv-panel-tree" data-jv-level={index}>
      <TreeView
        object={level.value}
        mode={MODE.LONG}
        bucketLargeArrays
        columns={[{ id: 'value', width: '100%' }]}
        renderValue={renderValue}
        expandedNodes={expandedNodes}
        maxStringLength={MAX_STRING_LENGTH}
        defaultSelectFirstNode={false}
      />
    </div>
  )
}

export function SidePanel({
  levels,
  width,
  top,
  onPop,
  onClose,
  onResize,
}: {
  levels: PanelLevel[]
  width: number
  top: number
  onPop(index: number): void
  onClose(): void
  onResize(width: number): void
}) {
  const current = levels.length - 1
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) =>
      onResize(
        Math.min(
          Math.max(innerWidth - ev.clientX, MIN_WIDTH),
          innerWidth - 100,
        ),
      )
    const up = () => {
      removeEventListener('mousemove', move)
      removeEventListener('mouseup', up)
    }
    addEventListener('mousemove', move)
    addEventListener('mouseup', up)
  }
  return (
    <aside
      id="jv-panel"
      className="jv-panel"
      style={{ width, top }}
      aria-label="Nested JSON"
    >
      <div className="jv-panel-resize" onMouseDown={startDrag} />
      <header className="jv-panel-header">
        <nav className="jv-crumbs">
          {levels.map((l, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="jv-crumb-sep">›</span>}
              <button
                className="jv-crumb"
                disabled={i === current}
                onClick={() => onPop(i)}
              >
                {l.title}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <button className="jv-panel-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="jv-panel-body">
        <LevelTree
          key={levels[current].id}
          level={levels[current]}
          index={current}
        />
      </div>
    </aside>
  )
}
