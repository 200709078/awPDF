import '../core/pdfjs-global'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'

const FIT_WIDTH = 'page-width'
const FIT_HEIGHT = 'page-height'
const ZOOM_STEP = 1.25
const MIN_SCALE = 0.25
const MAX_SCALE = 8

/**
 * The on-screen document. pdf.js draws only the pages in view and keeps its own per-page pixel
 * limit (lower on phones), so very long or very heavy files do not exhaust memory.
 */
export class DocumentView {
  private readonly viewer: PDFViewer
  private readonly links: PDFLinkService
  private document: PDFDocumentProxy | null = null
  private readonly listeners = new Set<() => void>()

  constructor(container: HTMLDivElement, viewerElement: HTMLDivElement) {
    const eventBus = new EventBus()
    this.links = new PDFLinkService({ eventBus })
    // Links to the outside stay off until they ask for confirmation first (roadmap).
    this.links.externalLinkEnabled = false
    this.viewer = new PDFViewer({ container, viewer: viewerElement, eventBus, linkService: this.links })
    this.links.setViewer(this.viewer)
    eventBus.on('pagesinit', () => this.fitWidth())
    for (const event of ['pagesinit', 'pagechanging', 'scalechanging']) {
      eventBus.on(event, () => this.notify())
    }
    // A turned phone or a resized window keeps the page fitted; a chosen zoom stays as it is.
    new ResizeObserver(() => {
      const scale = this.viewer.currentScaleValue
      if (this.isOpen && (scale === FIT_WIDTH || scale === FIT_HEIGHT)) this.viewer.currentScaleValue = scale
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

  /** Runs whenever the page, the zoom or the open document changes. */
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
    if (page >= 1 && page <= this.pageCount) this.viewer.currentPageNumber = page
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

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
