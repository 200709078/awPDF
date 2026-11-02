const STORAGE_KEY = 'awPDF.theme'
type ThemeName = 'light' | 'dark'

function storedTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/**
 * The interface's colours; PDF pages keep their own. It follows the system until the user
 * chooses, and the choice is a convenience of this device, so losing it costs nothing.
 */
export class Theme {
  private readonly system = window.matchMedia('(prefers-color-scheme: dark)')
  private readonly root = document.documentElement
  private readonly listeners = new Set<() => void>()

  constructor() {
    const theme = storedTheme()
    if (theme) this.root.dataset.theme = theme
    this.system.addEventListener('change', () => this.notify())
  }

  get isDark(): boolean {
    return (this.root.dataset.theme ?? (this.system.matches ? 'dark' : 'light')) === 'dark'
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  toggle(): void {
    const theme: ThemeName = this.isDark ? 'light' : 'dark'
    this.root.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private windows may refuse; the theme still holds for this session.
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
