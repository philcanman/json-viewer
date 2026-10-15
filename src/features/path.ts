export type PathFormat = 'js' | 'jsonpath' | 'jq'

export const PATH_FORMATS: readonly PathFormat[] = ['js', 'jsonpath', 'jq']

export interface PathStep {
  key: string
  isIndex: boolean
}

const JS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Inverse of Mozilla's TreeView.subPath: "/" separates, "\" escapes "/" and "\". */
export function parseRowPath(id: string): string[] {
  const segments: string[] = []
  let current = ''
  let started = false
  for (let i = 0; i < id.length; i++) {
    const ch = id[i]
    if (ch === '\\' && i + 1 < id.length) {
      current += id[++i]
    } else if (ch === '/') {
      if (started) segments.push(current)
      current = ''
      started = true
    } else {
      current += ch
    }
  }
  if (started) segments.push(current)
  return segments
}

export function formatPath(steps: PathStep[], format: PathFormat): string {
  switch (format) {
    case 'js':
      return steps
        .map((s, i) =>
          s.isIndex
            ? `[${s.key}]`
            : JS_IDENT.test(s.key)
              ? (i === 0 ? '' : '.') + s.key
              : `[${JSON.stringify(s.key)}]`,
        )
        .join('')
    case 'jsonpath':
      return (
        '$' +
        steps
          .map((s) =>
            s.isIndex
              ? `[${s.key}]`
              : PLAIN_IDENT.test(s.key)
                ? `.${s.key}`
                : `['${s.key.replace(/[\\']/g, '\\$&')}']`,
          )
          .join('')
      )
    case 'jq': {
      const body = steps
        .map((s) =>
          s.isIndex
            ? `[${s.key}]`
            : PLAIN_IDENT.test(s.key)
              ? `.${s.key}`
              : `[${JSON.stringify(s.key)}]`,
        )
        .join('')
      return body.startsWith('.') ? body : '.' + body
    }
  }
}
