import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { DocumentView } from '../app/document-view'
import type { SidePanel } from './side-panel'

const THUMBNAIL_WIDTH = 140
/** Thumbnails this far outside the panel are drawn in advance and kept. */
const VIEW_MARGIN = '300px'

/**
 * The page thumbnails. Only those near the visible part of the list are drawn, one at a time,
 * and each is released again on leaving it, so a thousand-page book costs what a few pages cost.
 * While the panel is closed nothing is in view, so nothing is drawn.
 */
export class ThumbnailList {
  private pdf: PDFDocumentProxy | null = null
  private items: HTMLButtonElement[] = []
  private readonly visible = new Set<number>()
  private readonly drawn = new Set<number>()
  private drawing = false
  private rotation = 0
  private current = { first: 0, last: 0 }
  private readonly observer: IntersectionObserver

  constructor(
    private readonly root: HTMLElement,
    private readonly view: DocumentView,
    panel: SidePanel,
    onPick: (page: number) => void,
  ) {
    this.observer = new IntersectionObserver(entries => this.onVisibility(entries), { root, rootMargin: VIEW_MARGIN })
    root.addEventListener('click', event => {
      const item = (event.target as Element).closest<HTMLElement>('.thumbnail')
      if (item) onPick(Number(item.dataset.page))
    })
    view.onChange(() => this.refresh())
    panel.onChange(() => this.scrollToCurrent())
  }

  private refresh(): void {
    const { pdf } = this.view
    if (pdf !== this.pdf || this.view.rotation !== this.rotation) this.rebuild(pdf)
    const { first, last } = this.view.row
    if (first === this.current.first && last === this.current.last) return
    this.mark(this.current, false)
    this.current = { first, last }
    this.mark(this.current, true)
    this.scrollToCurrent()
  }

  private rebuild(pdf: PDFDocumentProxy | null): void {
    this.observer.disconnect()
    this.visible.clear()
    this.drawn.clear()
    this.pdf = pdf
    this.rotation = this.view.rotation
    this.current = { first: 0, last: 0 }
    this.items = Array.from({ length: pdf?.numPages ?? 0 }, (_, index) => thumbnail(index + 1))
    this.root.replaceChildren(...this.items)
    for (const item of this.items) this.observer.observe(item)
    // Placeholders take the first page's shape, so the list keeps its length while it is drawn.
    void pdf?.getPage(1).then(page => {
      const { width, height } = this.viewport(page, 1)
      this.root.style.setProperty('--thumbnail-ratio', `${width} / ${height}`)
    }).catch(() => undefined)
  }

  private mark({ first, last }: { first: number; last: number }, isCurrent: boolean): void {
    for (const item of this.items.slice(Math.max(first - 1, 0), last)) {
      item.classList.toggle('is-current', isCurrent)
      if (isCurrent) item.setAttribute('aria-current', 'page')
      else item.removeAttribute('aria-current')
    }
  }

  private scrollToCurrent(): void {
    this.items[this.current.first - 1]?.scrollIntoView({ block: 'nearest' })
  }

  private onVisibility(entries: IntersectionObserverEntry[]): void {
    for (const { target, isIntersecting } of entries) {
      const page = Number((target as HTMLElement).dataset.page)
      if (isIntersecting) this.visible.add(page)
      else {
        this.visible.delete(page)
        this.release(page)
      }
    }
    void this.drawVisible()
  }

  private release(page: number): void {
    if (!this.drawn.delete(page)) return
    const canvas = this.items[page - 1]?.querySelector('canvas')
    // A zero-sized canvas gives its memory back.
    if (canvas) canvas.width = 0
  }

  private async drawVisible(): Promise<void> {
    if (this.drawing) return
    this.drawing = true
    for (;;) {
      const page = [...this.visible].find(candidate => !this.drawn.has(candidate))
      if (page === undefined || !this.pdf) break
      this.drawn.add(page)
      await this.draw(this.pdf, page).catch((error: unknown) => {
        // Replacing the document cancels its work; anything else is a real failure of that page.
        if (this.pdf) console.error(error)
      })
      if (!this.visible.has(page)) this.release(page)
    }
    this.drawing = false
  }

  private viewport(page: PDFPageProxy, scale: number): PageViewport {
    return page.getViewport({ scale, rotation: page.rotate + this.rotation })
  }

  private async draw(pdf: PDFDocumentProxy, pageNumber: number): Promise<void> {
    const page = await pdf.getPage(pageNumber)
    const canvas = this.items[pageNumber - 1]?.querySelector('canvas')
    if (pdf !== this.pdf || !canvas) return
    const viewport = this.viewport(page, THUMBNAIL_WIDTH * window.devicePixelRatio / this.viewport(page, 1).width)
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`
    await page.render({ canvas, viewport }).promise
    page.cleanup()
  }
}

function thumbnail(page: number): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'thumbnail'
  item.dataset.page = String(page)
  item.setAttribute('aria-label', `Sayfa ${page}`)
  const canvas = document.createElement('canvas')
  canvas.width = 0
  const label = document.createElement('span')
  label.textContent = String(page)
  item.append(canvas, label)
  return item
}
