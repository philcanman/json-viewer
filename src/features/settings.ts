import { PATH_FORMATS, PathFormat } from './path'

export const DEFAULT_PATH_FORMAT: PathFormat = 'js'

export const normalizePathFormat = (v: unknown): PathFormat =>
  (PATH_FORMATS as readonly unknown[]).includes(v)
    ? (v as PathFormat)
    : DEFAULT_PATH_FORMAT

export function watchPathFormat(cb: (f: PathFormat) => void): void {
  chrome.storage.sync.get('pathFormat', ({ pathFormat }) =>
    cb(normalizePathFormat(pathFormat)),
  )
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'pathFormat' in changes) {
      cb(normalizePathFormat(changes.pathFormat.newValue))
    }
  })
}

export const savePathFormat = (f: PathFormat): void => {
  chrome.storage.sync.set({ pathFormat: f })
}
