import React, { useLayoutEffect, useRef, useState } from 'react'
import { formatLocal, formatRelative, Hint, rgbText } from './classify'

export interface TooltipModel {
  hint: Hint
  anchor: { left: number; top: number; bottom: number }
  now: number
}

export function Tooltip({ model }: { model: TooltipModel }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({
    left: model.anchor.left,
    top: model.anchor.bottom,
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const fitsBelow = model.anchor.bottom + height <= innerHeight
    setPos({
      left: Math.max(0, Math.min(model.anchor.left, innerWidth - width)),
      top:
        fitsBelow || model.anchor.top - height < 0
          ? model.anchor.bottom
          : model.anchor.top - height,
    })
  }, [model])

  const { hint, now } = model
  return (
    <div ref={ref} className="jv-tooltip" role="tooltip" style={pos}>
      {hint.kind === 'date' && (
        <>
          <div className="jv-hint-main">
            {formatLocal(hint.date, { dateOnly: hint.dateOnly })}
          </div>
          <div className="jv-hint-sub">
            {formatRelative(hint.date, now, { dateOnly: hint.dateOnly })}
          </div>
        </>
      )}
      {hint.kind === 'color' && (
        <div className="jv-hint-color">
          <span className="jv-swatch">
            <span style={{ backgroundColor: hint.hex }} />
          </span>
          <code>{rgbText(hint)}</code>
        </div>
      )}
      {hint.kind === 'jwt' && (
        <>
          {hint.expired && <div className="jv-hint-expired">expired</div>}
          <div className="jv-hint-label">Header</div>
          <pre>{JSON.stringify(hint.header, null, 2)}</pre>
          <div className="jv-hint-label">Payload</div>
          <pre>
            {hint.payload !== null
              ? JSON.stringify(hint.payload, null, 2)
              : hint.payloadText}
          </pre>
          {hint.times.map((t) => (
            <div key={t.claim} className="jv-hint-sub">
              <b>{t.claim}</b> {formatLocal(t.date)} (
              {formatRelative(t.date, now)})
            </div>
          ))}
          <div className="jv-hint-foot">Signature not verified</div>
        </>
      )}
    </div>
  )
}
