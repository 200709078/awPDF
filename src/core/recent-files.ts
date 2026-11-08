const STORAGE_KEY = 'awPDF.recent'
const MAX_RECENT_FILES = 20

export interface RecentFile {
  /** pdf.js's fingerprint: the same document under another name or in another folder still matches. */
  fingerprint: string
  name: string
  page: number
  openedAt: number
  /** The platform's way back to the file, when it has one. */
  source?: string
}

export type Store = Pick<Storage, 'getItem' | 'setItem'>

/**
 * The documents read lately and the page each was left on. Kept on this device only, and losing
 * it costs nothing, so a browser without storage just starts with an empty list.
 */
export class RecentFiles {
  private files: RecentFile[]
  private readonly listeners = new Set<() => void>()

  constructor(private readonly store: Store) {
    this.files = this.load()
  }

  get list(): readonly RecentFile[] {
    return this.files
  }

  /** Runs when the list changes; a new page number alone does not count. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  /** The page this document was left on, 1 if it is new. */
  pageOf(fingerprint: string): number {
    return this.files.find(file => file.fingerprint === fingerprint)?.page ?? 1
  }

  remember(fingerprint: string, name: string, source: string | undefined, now = Date.now()): void {
    const known = this.files.find(file => file.fingerprint === fingerprint)
    const file = { fingerprint, name, page: known?.page ?? 1, openedAt: now, source: source ?? known?.source }
    this.files = [file, ...this.files.filter(other => other !== known)].slice(0, MAX_RECENT_FILES)
    this.changed()
  }

  setPage(fingerprint: string, page: number): void {
    const file = this.files.find(item => item.fingerprint === fingerprint)
    if (!file || file.page === page) return
    file.page = page
    this.save()
  }

  remove(fingerprint: string): void {
    this.files = this.files.filter(file => file.fingerprint !== fingerprint)
    this.changed()
  }

  clear(): void {
    this.files = []
    this.changed()
  }

  private changed(): void {
    this.save()
    for (const listener of this.listeners) listener()
  }

  private load(): RecentFile[] {
    try {
      const files: unknown = JSON.parse(this.store.getItem(STORAGE_KEY) ?? '[]')
      return Array.isArray(files) ? files as RecentFile[] : []
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.files))
    } catch {
      // Private windows and full disks refuse; the list then lasts as long as the page.
    }
  }
}

/** localStorage itself can throw on access, in a private window for one. */
export function deviceStore(): Store {
  try {
    return localStorage
  } catch {
    return { getItem: () => null, setItem: () => undefined }
  }
}
