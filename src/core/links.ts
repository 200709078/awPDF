const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** PDFs may carry links to anything; only these ever leave the app. */
export function isOpenableLink(url: string): boolean {
  try {
    return OPENABLE_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
