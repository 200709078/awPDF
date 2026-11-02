import '../core/pdfjs-global'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EventBus, PDFLinkService, PDFViewer, SpreadMode } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'

const FIT_WIDTH = 'page-width'
const FIT_HEIGHT = 'page-height'
const ZOOM_STEP = 1.25
const MIN_SCALE = 0.25
const MAX_SCALE = 8
const REFIT_DELAY_MS = 100

/**
 * The on-screen document. pdf.js draws only the pages in view and keeps its own per-page pixel
 * limit (lower on phones), so very long or very heavy files do not exhaust memory.
 */
export class DocumentView {
  private readonly viewer: PDFViewer
  private readonly links: PDFLinkService
  private document: PDFDocumentProxy | null = null
  private wantsTwoPages = false
  private readonly listeners = new Set<() => void>()

  constructor(container: HTMLDivElement, viewerElement: HTMLDivElement) {
    const eventBus = new EventBus()
    this.links = new PDFLinkService({ eventBus })
    // Links to the outside stay off until they ask for confirmation first (roadmap).
    this.links.externalLinkEnabled = false
    this.viewer = new PDFViewer({ container, viewer: viewerElement, eventBus, linkService: this.links })
    this.links.setViewer(this.viewer)
    eventBus.on('pagesinit', () => {
      // pdf.js forgets the layout with each document; the choice carries over to the next one.
      this.applyLayout()
      this.fitWidth()
    })
    for (const event of ['pagesinit', 'pagechanging', 'scalechanging']) {
      eventBus.on(event, () => this.notify())
    }
    // A turned phone or a resized window keeps the page fitted; a chosen zoom stays as it is.
    // Waiting for the size to settle spares a page redraw on every frame of a resize or of the
    // side panel's slide.
    let refit: ReturnType<typeof setTimeout> | undefined
    new ResizeObserver(() => {
      clearTimeout(refit)
      refit = setTimeout(() => {
        const scale = this.viewer.currentScaleValue
        if (this.isOpen && (scale === FIT_WIDTH || scale === FIT_HEIGHT)) this.viewer.currentScaleValue = scale
      }, REFIT_DELAY_MS)
    }).observe(container)
  }

  get isOpen(): boolean {
    return this.document !== null
  }

  get page(): number {
    return this.viewer.currentPageNumber
  }

  get pageCount(): number {
    return this.document?.numPages ?? 0
  }

  get pdf(): PDFDocumentProxy | null {
    return this.document
  }

  get twoPages(): boolean {
    return this.wantsTwoPages
  }

  /** The first and last pages on the current row: pairs are 1-2, 3-4, … */
  get row(): { first: number; last: number } {
    const { page } = this
    if (!this.twoPages) return { first: page, last: page }
    const first = page % 2 === 1 ? page : page - 1
    return { first, last: Math.min(first + 1, this.pageCount) }
  }

  get pageLabel(): string {
    const { first, last } = this.row
    return first === last ? `${first}` : `${first}-${last}`
  }

  get hasPreviousPage(): boolean {
    return this.row.first > 1
  }

  get hasNextPage(): boolean {
    return this.row.last < this.pageCount
  }

  /** Runs whenever the page, the zoom, the layout or the open document changes. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  open(document: PDFDocumentProxy): void {
    void this.document?.loadingTask.destroy()
    this.document = document
    this.links.setDocument(document)
    this.viewer.setDocument(document)
    this.notify()
  }

  goTo(page: number): void {
    this.viewer.currentPageNumber = page
  }

  /** pdf.js steps a whole row when both of its pages are in view. */
  previousPage(): void {
    this.viewer.previousPage()
  }

  nextPage(): void {
    this.viewer.nextPage()
  }

  toggleTwoPages(): void {
    this.wantsTwoPages = !this.wantsTwoPages
    this.applyLayout()
    this.notify()
  }

  zoomBy(factor: number): void {
    const scale = this.viewer.currentScale * factor
    this.viewer.currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP)
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP)
  }

  fitWidth(): void {
    this.viewer.currentScaleValue = FIT_WIDTH
  }

  fitHeight(): void {
    this.viewer.currentScaleValue = FIT_HEIGHT
  }

  private applyLayout(): void {
    this.viewer.spreadMode = this.wantsTwoPages ? SpreadMode.ODD : SpreadMode.NONE
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
