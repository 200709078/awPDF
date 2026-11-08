import '../core/pdfjs-global'
import { AnnotationEditorParamsType, AnnotationEditorType, SignatureExtractor, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EventBus, FindState, GenericL10n, PDFFindController, PDFLinkService, PDFViewer, ScrollMode, SpreadMode } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'
import type { PdfFile } from '../core/pdf-file'
import type { SavedSignature, SignatureShape } from '../core/signatures'
import { foldTurkish } from '../core/turkish-search'

const FIT_WIDTH = 'page-width'
const FIT_HEIGHT = 'page-height'
const FIT_PAGE = 'page-fit'
const FIT_MODES: ReadonlySet<unknown> = new Set([FIT_WIDTH, FIT_HEIGHT, FIT_PAGE])
const ZOOM_STEP = 1.25
const MIN_SCALE = 0.25
const MAX_SCALE = 8
const REFIT_DELAY_MS = 100
/** The highlighter's colours, as pdf.js names them (its colour menu and saved marks use these). */
export const HIGHLIGHT_COLORS = 'yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F'
/** While a pinch goes on the page is only stretched; it is drawn sharp this long after it stops. */
const GESTURE_REDRAW_DELAY_MS = 300

/** What is kept of the view while another document is on screen. A new document gives only `page`. */
export interface ViewState {
  page: number
  scale?: number | string
  rotation?: number
}

/** What the pen of the marking bar does: nothing, draw, highlight, or write text. */
export type EditorMode = 'none' | 'ink' | 'highlight' | 'text' | 'signature'

/** What the marking bar shows as possible. */
export interface EditingState {
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  /** Whether the document has any marks of this session. */
  hasMarks: boolean
}

const EDITOR_TYPES: Readonly<Record<EditorMode, number>> = {
  none: AnnotationEditorType.NONE,
  ink: AnnotationEditorType.INK,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  signature: AnnotationEditorType.SIGNATURE,
}

/** A signature's height on the page when it is placed, in points (as pdf.js's viewer). */
const SIGNATURE_HEIGHT = 40
/** pdf.js's `SignatureEditor._INNER_MARGIN`. */
const SIGNATURE_MARGIN = 3

/** pdf.js's signature editor takes its lines in this form (`signatureData.lines`). */
function signatureLines(shape: SignatureShape) {
  return { curves: shape.curves.map(points => ({ points })), thickness: shape.thickness, width: shape.width, height: shape.height }
}

/** What pdf.js's signature editor is made with; it draws the signature on its own page. */
function signatureData(signature: SavedSignature) {
  return {
    lines: signatureLines(signature.shape),
    mustSmooth: false,
    areContours: signature.shape.areContours,
    description: signature.description,
    uuid: signature.id,
    heightInPage: SIGNATURE_HEIGHT,
  }
}

/** A setting of the marks drawn from now on, and of the selected ones. */
export type EditorSetting =
  | { kind: 'inkColor' | 'textColor' | 'highlightColor'; value: string }
  | { kind: 'inkThickness' | 'textSize'; value: number }

const SETTING_TYPES: Readonly<Record<EditorSetting['kind'], number>> = {
  inkColor: AnnotationEditorParamsType.INK_COLOR,
  inkThickness: AnnotationEditorParamsType.INK_THICKNESS,
  textColor: AnnotationEditorParamsType.FREETEXT_COLOR,
  textSize: AnnotationEditorParamsType.FREETEXT_SIZE,
  highlightColor: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
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
  private readonly editingListeners = new Set<(state: EditingState) => void>()
  private mode: EditorMode = 'none'
  /** Resolves `setEditorMode`'s promise once pdf.js has finished switching. */
  private modeSwitched: (() => void) | null = null
  /** pdf.js's editing manager of the document on screen; a new one comes with each document. */
  private editorManager: EditorManager | null = null
  /** The marks as they were on the page when their document left the screen (see `redrawMarks`). */
  private readonly markCopies = new WeakMap<object, object | null>()
  /** The signature a tap on the page puts there, in signature mode. */
  private tapSignature: SavedSignature | null = null
  /** A tap that only unselects a mark puts nothing on the page. */
  private tapUnselects = false
  /** Whether the document on screen has unsaved changes; given by whoever opens it. */
  private isModified: () => boolean = () => false
  private editing: EditingState = { canUndo: false, canRedo: false, hasSelection: false, hasMarks: false }

  constructor(container: HTMLDivElement, viewerElement: HTMLDivElement, onExternalLink: (url: string) => void) {
    const { eventBus } = this
    this.links = new ConfirmingLinkService({ eventBus }, onExternalLink)
    this.finder = new TurkishFindController({ linkService: this.links, eventBus })
    // The editing layer's own words (its buttons, the text box's hint) in Turkish, from
    // public/pdfjs-l10n; pdf.js translates only what is under the container it is given.
    const l10n = new GenericL10n('tr')
    this.viewer = new PDFViewer({
      container, viewer: viewerElement, eventBus, linkService: this.links, findController: this.finder, l10n,
      annotationEditorHighlightColors: HIGHLIGHT_COLORS,
      // pdf.js's own signature dialog is part of its full viewer, not of these components; the
      // marking bar has ours. pdf.js asks this when a tap on the page makes an empty signature.
      signatureManager: {
        getSignature: ({ editor }: { editor: TappedSignature }) => this.signAt(editor),
        loadSignatures: async () => undefined,
        renderEditButton: async () => null,
        destroy: () => undefined,
      },
    } as ConstructorParameters<typeof PDFViewer>[0])
    void l10n.translate(container)
    this.links.setViewer(this.viewer)
    eventBus.on('annotationeditoruimanager', ({ uiManager }: { uiManager: EditorManager }) => {
      this.editorManager = uiManager
    })
    container.addEventListener('pointerdown', () => { this.tapUnselects = this.editing.hasSelection }, true)
    container.addEventListener('click', event => this.signAtTap(event))
    eventBus.on('annotationeditorlayerrendered', ({ source }: { source: PageViewWithEditor }) => {
      void this.redrawMarks(source)
    })
    // pdf.js switches the mode itself, to the kind of a mark that is selected or tapped twice. Only
    // while the marking bar is open: reading stays reading (a text box that closes as the bar does
    // asks for its own mode back).
    eventBus.on('switchannotationeditormode', ({ source: _, ...change }: ModeChange) => {
      if (this.mode === 'none' || !this.document) return
      this.viewer.annotationEditorMode = change
    })
    eventBus.on('annotationeditormodechanged', ({ mode }: { mode: number }) => {
      const name = (Object.keys(EDITOR_TYPES) as EditorMode[]).find(key => EDITOR_TYPES[key] === mode)
      if (name === this.mode) this.settleModeSwitch()
      if (name && name !== this.mode) {
        this.mode = name
        this.reportEditing()
      }
    })
    eventBus.on('editingstateschanged', ({ details }: { details: EditingDetails }) => {
      this.editing = {
        canUndo: details.hasSomethingToUndo ?? false,
        canRedo: details.hasSomethingToRedo ?? false,
        hasSelection: details.hasSelectedEditor ?? false,
        hasMarks: !(details.isEmpty ?? true),
      }
      this.reportEditing()
    })
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

  get editorMode(): EditorMode {
    return this.mode
  }

  get editingState(): EditingState {
    return this.editing
  }

  /** Runs when the editing mode or what can be undone, redone or deleted changes. */
  onEditingChange(listener: (state: EditingState) => void): void {
    this.editingListeners.add(listener)
  }

  /**
   * Draws, highlights or writes on the pages from now on; `none` goes back to reading. Resolves
   * when pdf.js has switched, which also unselects the marks: settings sent before that would
   * change the selected mark instead of the new ones.
   */
  setEditorMode(mode: EditorMode): Promise<void> {
    if (mode === this.mode || !this.document) {
      this.mode = mode
      return Promise.resolve()
    }
    this.settleModeSwitch()
    const switched = new Promise<void>(resolve => { this.modeSwitched = resolve })
    this.mode = mode
    this.applyEditorMode(EDITOR_TYPES[mode])
    this.reportEditing()
    return switched
  }

  private settleModeSwitch(): void {
    this.modeSwitched?.()
    this.modeSwitched = null
  }

  /**
   * Puts the pen's strokes on the page. pdf.js gathers them into one drawing until the pen stops
   * (another mode, or reading again); until then they are not in the document, so saving, printing
   * or closing would miss them and the tab would not show as changed.
   */
  finishEditing(): void {
    this.editorManager?.endCurrentEditing()
  }

  /** The signature a tap on the page puts there from now on (in signature mode). */
  useSignature(signature: SavedSignature | null): void {
    this.tapSignature = signature
  }

  /** Puts a signature in the middle of the page in view, selected, to be moved and sized. */
  async addSignature(signature: SavedSignature): Promise<void> {
    await this.setEditorMode('signature')
    this.tapSignature = signature
    this.eventBus.dispatch('switchannotationeditorparams', {
      source: this,
      type: AnnotationEditorParamsType.CREATE,
      value: { signatureData: signatureData(signature) },
    })
  }

  /**
   * In signature mode a tap on a page puts the chosen signature there (pdf.js itself places one
   * only in the middle). A tap on a mark, or one that unselects a mark, does not.
   */
  private signAtTap(event: MouseEvent): void {
    const signature = this.tapSignature
    const target = event.target as HTMLElement
    if (this.mode !== 'signature' || !signature || this.tapUnselects || !target.classList.contains('annotationEditorLayer')) return
    const pageNumber = Number(target.closest<HTMLElement>('.page')?.dataset.pageNumber)
    const pageView = this.viewer.getPageView(pageNumber - 1) as PageViewWithEditor | undefined
    const layer = pageView?.annotationEditorLayer?.annotationEditorLayer
    layer?.createAndAddNewEditor({ offsetX: event.offsetX, offsetY: event.offsetY }, false, { signatureData: signatureData(signature) })
  }

  /** A tap made an empty signature: it takes the chosen one, or goes away without one. */
  private signAt(editor: TappedSignature): void {
    const signature = this.tapSignature
    if (!signature || !editor.parent) {
      queueMicrotask(() => editor.remove())
      return
    }
    const { rawDims: { pageWidth, pageHeight }, rotation } = editor.parent.viewport
    const outline = SignatureExtractor.processDrawnLines({
      lines: signatureLines(signature.shape),
      pageWidth,
      pageHeight,
      rotation,
      innerMargin: SIGNATURE_MARGIN,
      mustSmooth: false,
      areContours: signature.shape.areContours,
    })
    if (!outline) {
      queueMicrotask(() => editor.remove())
      return
    }
    editor.div.hidden = false
    editor.addSignature(outline, SIGNATURE_HEIGHT, signature.description, signature.id)
  }

  changeEditor(setting: EditorSetting): void {
    this.eventBus.dispatch('switchannotationeditorparams', { source: this, type: SETTING_TYPES[setting.kind], value: setting.value })
  }

  undo(): void {
    this.eventBus.dispatch('editingaction', { source: this, name: 'undo' })
  }

  redo(): void {
    this.eventBus.dispatch('editingaction', { source: this, name: 'redo' })
  }

  /** Removes the selected marks. */
  deleteSelected(): void {
    this.eventBus.dispatch('editingaction', { source: this, name: 'delete' })
  }

  /** Where the reader is now, to come back to with `open`. */
  get state(): ViewState {
    return { page: this.page, scale: this.viewer.currentScaleValue, rotation: this.rotation }
  }

  /** Shows a document. The caller owns it: closing the previous one is not done here. */
  open(document: PDFDocumentProxy, file: PdfFile, state: ViewState = { page: 1 }, isModified: () => boolean = () => false): void {
    this.leaveEditing()
    this.isModified = isModified
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
    this.leaveEditing()
    this.isModified = () => false
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

  /** Before another document comes: the strokes on the page, and reading again. */
  private leaveEditing(): void {
    this.finishEditing()
    this.settleModeSwitch()
    this.copyMarks()
    this.editorManager = null
    if (this.mode !== 'none') {
      this.mode = 'none'
      // Synchronous in pdf.js, so the next document starts in reading mode.
      this.applyEditorMode(AnnotationEditorType.NONE)
      this.reportEditing()
    }
  }

  /** Copies of the marks on screen, taken while they are still on their pages and measure right. */
  private copyMarks(): void {
    if (!this.document || !this.editorManager) return
    for (const [key, value] of this.document.annotationStorage as unknown as MarkStorage) {
      if (!key.startsWith(EDITOR_PREFIX) || !isEditor(value) || value._uiManager !== this.editorManager) continue
      this.markCopies.set(value, value.deleted ? null : value.serialize(value.mode !== AnnotationEditorType.HIGHLIGHT))
    }
  }

  /**
   * Marks made before the reader went to another tab. pdf.js makes a new editing manager with each
   * document, and the marks' editors of the old one stay in the document's storage (where they
   * still save and print correctly) but no longer show. When a page's editing layer is drawn, its
   * old marks are made again on it, the way pdf.js copies marks to another page, and the old
   * editors leave the storage. Unsaved stays as it was: a saved document is not marked changed.
   */
  private async redrawMarks(pageView: PageViewWithEditor): Promise<void> {
    const layer = pageView.annotationEditorLayer?.annotationEditorLayer
    const manager = this.editorManager
    const document = this.document
    if (!layer || !manager || !document) return
    const storage = document.annotationStorage as unknown as MarkStorage
    const stale = [...storage].flatMap(([key, value]) => key.startsWith(EDITOR_PREFIX) && isEditor(value)
      && value._uiManager !== manager && value.pageIndex === layer.pageIndex && !value.annotationElementId
      ? [[key, value] as const] : [])
    if (stale.length === 0) return
    const wasModified = this.isModified()
    for (const [key, editor] of stale) {
      // As pdf.js copies a page's marks (`clonePage`): a clone stays where it was instead of being
      // moved aside as a pasted copy is.
      const data = this.markCopies.has(editor) ? this.markCopies.get(editor) : editor.serialize(editor.mode !== AnnotationEditorType.HIGHLIGHT)
      const made = data && !editor.deleted ? await layer.deserialize(data) : null
      if (document !== this.document || manager !== this.editorManager) return
      storage.remove(key)
      if (made) {
        made.isClone = true
        layer.addOrRebuild(made)
        // pdf.js places a copied text box a line higher than it was; it goes back to its place.
        made.x = editor.x
        made.y = editor.y
        made.fixAndSetPosition()
      }
    }
    // The layer hid itself when it was drawn empty.
    if (layer.div) layer.div.hidden = layer.isEmpty
    if (!wasModified) storage.resetModified()
  }

  private applyEditorMode(mode: number): void {
    // The getter gives the number, though the typings say otherwise.
    if (!this.document || (this.viewer.annotationEditorMode as unknown as number) === AnnotationEditorType.DISABLE) return
    this.viewer.annotationEditorMode = { mode }
  }

  private reportEditing(): void {
    for (const listener of this.editingListeners) listener(this.editing)
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

const EDITOR_PREFIX = 'pdfjs_internal_editor_'

/** The parts of pdf.js's editing classes used here; they are not in its typings. */
interface EditorManager {
  endCurrentEditing(): void
}

/** Where a mark sits, as fractions of its page. */
interface PlacedMark {
  x: number
  y: number
  isClone?: boolean
  fixAndSetPosition(): void
}

interface TappedSignature {
  parent: { viewport: { rawDims: { pageWidth: number; pageHeight: number }; rotation: number } } | null
  div: HTMLElement
  remove(): void
  addSignature(outline: object, heightInPage: number, description: string, uuid: string): void
}

interface MarkEditor extends PlacedMark {
  _uiManager: EditorManager
  pageIndex: number
  mode: number
  deleted?: boolean
  annotationElementId?: string | null
  serialize(isForCopying: boolean): object | null
}

interface MarkLayer {
  pageIndex: number
  div: HTMLElement | null
  isEmpty: boolean
  deserialize(data: object): Promise<PlacedMark | null>
  addOrRebuild(editor: object): void
  createAndAddNewEditor(at: { offsetX: number; offsetY: number }, isCentered: boolean, data: object): unknown
}

interface PageViewWithEditor {
  annotationEditorLayer?: { annotationEditorLayer?: MarkLayer | null } | null
}

type MarkStorage = Iterable<[string, unknown]> & { remove(key: string): void; resetModified(): void }

function isEditor(value: unknown): value is MarkEditor {
  return typeof value === 'object' && value !== null && typeof (value as MarkEditor).serialize === 'function' && '_uiManager' in value
}

interface ModeChange {
  source: unknown
  mode: number
  editId?: string | null
  isFromKeyboard?: boolean
  mustEnterInEditMode?: boolean
  editComment?: boolean
}

interface EditingDetails {
  hasSomethingToUndo?: boolean
  hasSomethingToRedo?: boolean
  hasSelectedEditor?: boolean
  isEmpty?: boolean
}

interface FindUpdate {
  state: number
  matchesCount: { current: number; total: number }
}
