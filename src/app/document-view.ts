import '../core/pdfjs-global'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EventBus, FindState, PDFFindController, PDFLinkService, PDFViewer, ScrollMode, SpreadMode } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'
import type { PdfFile } from '../core/pdf-file'
import { foldTurkish } from '../core/turkish-search'

const FIT_WIDTH = 'page-width'
const FIT_HEIGHT = 'page-height'
const FIT_PAGE = 'page-fit'
const FIT_MODES: ReadonlySet<unknown> = new Set([FIT_WIDTH, FIT_HEIGHT, FIT_PAGE])
const ZOOM_STEP = 1.25
const MIN_SCALE = 0.25
const MAX_SCALE = 8
const REFIT_DELAY_MS = 100
/** While a pinch goes on the page is only stretched; it is drawn sharp this long after it stops. */
const GESTURE_REDRAW_DELAY_MS = 300

/** What is kept of the view while another document is on screen. A new document gives only `page`. */
export interface ViewState {
  page: number
  scale?: number | string
  rotation?: number
}

export type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

export type SearchProgress =
  | { state: 'searching' }
  | { state: 'notFound' }
  | { state: 'found'; current: number; total: number }

/** Links to the outside go to the app, which asks the user first; they never open on their own. */
class ConfirmingLinkService extends PDFLinkService {
  constructor(options: ConstructorParameters<typeof PDFLinkService>[0], private readonly onExternal: (url: string) => void) {
    super(options)
  }

  override addLinkAttributes(link: HTMLAnchorElement, url: string): void {
    link.href = url
    link.title = url
    link.rel = 'noopener noreferrer nofollow'
    link.onclick = () => {
      this.onExternal(url)
      return false
    }
  }
}

/** Case-insensitive search does not know Turkish I/ı and İ/i; this makes them the same letter. */
class TurkishFindController extends PDFFindController {
  override match(query: string | string[], pageContent: string, pageIndex: number): ReturnType<PDFFindController['match']> {
    const folded = Array.isArray(query) ? query.map(foldTurkish) : foldTurkish(query)
    return super.match(folded, foldTurkish(pageContent), pageIndex)
  }
}

/**
 * The on-screen document. pdf.js draws only the pages in view and keeps its own per-page pixel
 * limit (lower on phones), so very long or very heavy files do not exhaust memory.
 */
export class DocumentView {
  private readonly viewer: PDFViewer
  private readonly links: PDFLinkService
  private readonly eventBus = new EventBus()
  private readonly finder: TurkishFindController
  private document: PDFDocumentProxy | null = null
  private openFile: PdfFile | null = null
  private wantsTwoPages = false
  private wantsSinglePage = false
  /** Detaching the finder stops its page-by-page reading of a long book. */
  private finderDetached = false
  /** What to restore once pdf.js has laid the document out. */
  private startState: ViewState = { page: 1 }
  private isSettled = false
  private readonly listeners = new Set<() => void>()
  private readonly pageListeners = new Set<(page: number) => void>()
  private readonly searchListeners = new Set<(progress: SearchProgress) => void>()

  constructor(container: HTMLDivElement, viewerElement: HTMLDivElement, onExternalLink: (url: string) => void) {
    const { eventBus } = this
    this.links = new ConfirmingLinkService({ eventBus }, onExternalLink)
    this.finder = new TurkishFindController({ linkService: this.links, eventBus })
    this.viewer = new PDFViewer({ container, viewer: viewerElement, eventBus, linkService: this.links, findController: this.finder })
    this.links.setViewer(this.viewer)
    eventBus.on('pagesinit', () => {
      // pdf.js forgets the layout with each document; the choice carries over to the next one.
      this.applyLayout()
      const { page, scale, rotation } = this.startState
      if (rotation) this.viewer.pagesRotation = rotation
      if (scale === undefined) this.fitWidth()
      else this.viewer.currentScaleValue = String(scale)
      this.goTo(page)
      this.isSettled = true
    })
    eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      if (!this.isSettled) return
      for (const listener of this.pageListeners) listener(pageNumber)
    })
    for (const event of ['pagesinit', 'pagechanging', 'scalechanging', 'rotationchanging']) {
      eventBus.on(event, () => this.notify())
    }
    eventBus.on('updatefindcontrolstate', ({ state, matchesCount }: FindUpdate) => {
      if (state === FindState.PENDING) this.reportSearch({ state: 'searching' })
      else if (state === FindState.NOT_FOUND) this.reportSearch({ state: 'notFound' })
      else this.reportSearch({ state: 'found', ...matchesCount })
    })
    eventBus.on('updatefindmatchescount', ({ matchesCount }: FindUpdate) => {
      if (matchesCount.total > 0) this.reportSearch({ state: 'found', ...matchesCount })
    })
    // A turned phone or a resized window keeps the page fitted; a chosen zoom stays as it is.
    // Waiting for the size to settle spares a page redraw on every frame of a resize or of the
    // side panel's slide.
    let refit: ReturnType<typeof setTimeout> | undefined
    new ResizeObserver(() => {
      clearTimeout(refit)
      refit = setTimeout(() => {
        const scale = this.viewer.currentScaleValue
        if (this.isOpen && FIT_MODES.has(scale)) this.viewer.currentScaleValue = scale
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

  get file(): PdfFile | null {
    return this.openFile
  }

  get twoPages(): boolean {
    return this.wantsTwoPages
  }

  get singlePage(): boolean {
    return this.wantsSinglePage
  }

  /** Added to each page's own rotation; it changes only the view, never the file. */
  get rotation(): number {
    return this.viewer.pagesRotation
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

  /** Runs when the reader moves to another page, not while a document is being laid out. */
  onPageChange(listener: (page: number) => void): void {
    this.pageListeners.add(listener)
  }

  onSearchProgress(listener: (progress: SearchProgress) => void): void {
    this.searchListeners.add(listener)
  }

  /** Where the reader is now, to come back to with `open`. */
  get state(): ViewState {
    return { page: this.page, scale: this.viewer.currentScaleValue, rotation: this.rotation }
  }

  /** Shows a document. The caller owns it: closing the previous one is not done here. */
  open(document: PDFDocumentProxy, file: PdfFile, state: ViewState = { page: 1 }): void {
    this.document = document
    this.openFile = file
    this.startState = { ...state, page: Math.min(state.page, document.numPages) }
    this.isSettled = false
    this.links.setDocument(document)
    this.viewer.setDocument(document)
    this.finder.setDocument(document)
    this.finderDetached = false
    this.notify()
  }

  /** Empties the view after its last document closed. */
  clear(): void {
    const none = null as unknown as PDFDocumentProxy
    this.document = null
    this.openFile = null
    this.isSettled = false
    this.finderDetached = false
    this.viewer.setDocument(none)
    this.links.setDocument(none)
    this.finder.setDocument(none)
    this.notify()
  }

  goTo(page: number): void {
    this.viewer.currentPageNumber = page
  }

  goToDestination(destination: NonNullable<OutlineItem['dest']>): void {
    void this.links.goToDestination(destination)
  }

  /** pdf.js steps a whole row when both of its pages are in view. */
  previousPage(): void {
    this.viewer.previousPage()
  }

  nextPage(): void {
    this.viewer.nextPage()
  }

  /** Both view switches at once, so that only one layout change happens. */
  setLayout(singlePage: boolean, twoPages: boolean): void {
    this.wantsSinglePage = singlePage
    this.wantsTwoPages = twoPages
    this.applyLayout()
    this.notify()
  }

  /** A `ViewState.scale`: a number, or a mode that keeps fitting. */
  setScale(scale: number | string | undefined): void {
    if (scale !== undefined) this.viewer.currentScaleValue = String(scale)
  }

  toggleTwoPages(): void {
    this.wantsTwoPages = !this.wantsTwoPages
    this.applyLayout()
    this.notify()
  }

  toggleSinglePage(): void {
    this.wantsSinglePage = !this.wantsSinglePage
    this.applyLayout()
    this.notify()
  }

  rotate(): void {
    // Pages change height, so the old scroll position would land on another page.
    const pageNumber = this.page
    this.viewer.pagesRotation = (this.rotation + 90) % 360
    this.viewer.scrollPageIntoView({ pageNumber })
  }

  zoomBy(factor: number): void {
    this.viewer.currentScale = this.clampScale(this.viewer.currentScale * factor)
  }

  /** Zooms around a screen point, for pinches and ctrl+wheel. */
  zoomAt(factor: number, x: number, y: number): void {
    const current = this.viewer.currentScale
    const target = this.clampScale(current * factor)
    if (target === current) return
    this.viewer.updateScale({ scaleFactor: target / current, origin: [x, y], drawingDelay: GESTURE_REDRAW_DELAY_MS })
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

  fitPage(): void {
    this.viewer.currentScaleValue = FIT_PAGE
  }

  /** `again` moves to the next or, with `previous`, the previous match of the same text. */
  search(query: string, { again = false, previous = false } = {}): void {
    if (this.finderDetached) {
      this.finder.setDocument(this.document!)
      this.finderDetached = false
    }
    this.eventBus.dispatch('find', {
      source: this,
      type: again ? 'again' : '',
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    })
  }

  /** Clears the highlights and stops any reading still under way. */
  stopSearch(): void {
    if (!this.document || this.finderDetached) return
    this.eventBus.dispatch('findbarclose', { source: this })
    this.finderDetached = true
    // After the finder's own promise step for that event, which clears the highlights.
    queueMicrotask(() => {
      if (this.finderDetached) this.finder.setDocument(null as unknown as PDFDocumentProxy)
    })
  }

  private clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
  }

  private applyLayout(): void {
    this.viewer.scrollMode = this.wantsSinglePage ? ScrollMode.PAGE : ScrollMode.VERTICAL
    this.viewer.spreadMode = this.wantsTwoPages ? SpreadMode.ODD : SpreadMode.NONE
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private reportSearch(progress: SearchProgress): void {
    for (const listener of this.searchListeners) listener(progress)
  }
}

interface FindUpdate {
  state: number
  matchesCount: { current: number; total: number }
}
