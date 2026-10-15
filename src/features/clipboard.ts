/** Uses execCommand so copying works on plain-http pages, where navigator.clipboard is unavailable. */
export function copyToClipboard(text: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', text)
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy, { once: true })
  const ok = document.execCommand('copy')
  document.removeEventListener('copy', onCopy)
  return ok
}
