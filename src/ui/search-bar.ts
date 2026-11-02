import type { DocumentView, SearchProgress } from '../app/document-view'

const SEARCH_DELAY_MS = 250

/** Searching reads every page of a book, so it starts only here, and closing the bar stops it. */
export class SearchBar {
  private readonly input = document.querySelector<HTMLInputElement>('#searchInput')!
  private readonly status = document.querySelector<HTMLElement>('#searchStatus')!
  private readonly listeners = new Set<() => void>()
  private lastQuery = ''
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly root: HTMLElement, private readonly view: DocumentView) {
    view.onSearchProgress(progress => this.show(progress))
    this.input.addEventListener('input', () => {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.search(), SEARCH_DELAY_MS)
    })
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.step(event.shiftKey)
      else if (event.key === 'Escape') this.close()
    })
    document.querySelector('#searchPrevious')!.addEventListener('click', () => this.step(true))
    document.querySelector('#searchNext')!.addEventListener('click', () => this.step(false))
    document.querySelector('#searchClose')!.addEventListener('click', () => this.close())
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  /** Runs when the bar opens or closes. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  open(): void {
    this.root.hidden = false
    this.input.focus()
    this.input.select()
    this.notify()
  }

  close(): void {
    if (!this.isOpen) return
    clearTimeout(this.timer)
    this.root.hidden = true
    this.input.value = ''
    this.lastQuery = ''
    this.status.textContent = ''
    this.view.stopSearch()
    this.notify()
  }

  private search(): void {
    const query = this.input.value.trim()
    this.lastQuery = query
    this.status.textContent = ''
    if (query) this.view.search(query)
    else this.view.stopSearch()
  }

  private step(previous: boolean): void {
    clearTimeout(this.timer)
    const query = this.input.value.trim()
    if (!query) return
    if (query === this.lastQuery) this.view.search(query, { again: true, previous })
    else this.search()
  }

  private show(progress: SearchProgress): void {
    if (!this.isOpen) return
    if (progress.state === 'searching') this.status.textContent = 'Aranıyor…'
    else if (progress.state === 'notFound') this.status.textContent = 'Bulunamadı'
    else this.status.textContent = `${progress.current} / ${progress.total}`
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
