import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { IMAGE_ACCEPT, isImageFile, jpegFromFile } from '../app/images'
import { OLD_WORD_ACCEPT, WORD_ACCEPT, isOldWordFile, isWordFile, wordToPdf } from '../app/word-to-pdf'
import { imagesToPdf, type ImagePageSize } from '../core/images-to-pdf'
import { PagePlan, type PlannedPage } from '../core/page-plan'
import { blankPdf, buildPdf, isEncrypted, nameWithSuffix } from '../core/pdf-build'
import { loadPdf, OpenCancelled } from '../core/pdf-document'
import { pdfFileFromBlob, type PdfFile } from '../core/pdf-file'
import { SameFileError, type Platform } from '../platform/platform'
import { askPassword, confirmLeaveEditor, showToast } from './messages'

/** Pages are drawn about this wide; the grid stretches its columns a little. */
const CARD_WIDTH = 132
/** Cards this far outside the grid's view are drawn in advance. */
const VIEW_MARGIN = '400px'
/** A finger held this long on a page picks it up; a quicker move scrolls. */
const LONG_PRESS_MS = 400
const DRAG_THRESHOLD_PX = 8
/** Near the grid's top or bottom edge a dragged page scrolls it, this much per move. */
const EDGE_PX = 48
const EDGE_SCROLL_PX = 16

interface Source {
  readonly name: string
  readonly pdf: PDFDocumentProxy
  /** An added file's bytes, without a password; absent for the open document. */
  readonly bytes?: Uint8Array
}

/** How the editor was opened. */
export interface PageEditorOptions {
  /** A document made just now, from pictures: it may be saved unchanged, and leaving loses it. */
  readonly isNew?: boolean
  /** The name offered when saving; by default the open file's with "(düzenlendi)". */
  readonly saveName?: string
  /** The editor's heading for a new document: what it was made from. */
  readonly title?: string
  /** How added pictures sit on their pages. */
  readonly imageSize?: ImagePageSize
}

export interface PageEditorHost {
  readonly platform: Platform
  /** Shows the newly saved file in the app. */
  openSaved(file: PdfFile): void
}

interface Action {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly needsSelection?: boolean
  readonly primary?: boolean
  run(): void
}

interface Drag {
  readonly pointerId: number
  readonly key: number
  readonly startX: number
  readonly startY: number
  keys?: ReadonlySet<number>
  position?: number
  timer?: ReturnType<typeof setTimeout>
}

/**
 * A full screen of page cards: a tap selects, the buttons turn, move and remove the selected
 * pages, other PDFs join at the end and the result is saved as a new file. A mouse drags pages
 * at once; a finger holds a page a moment first, so that a quick move still scrolls. Cards are
 * drawn only near the view, one at a time, as the side panel's thumbnails are.
 */
export class PageEditor {
  private sources: Source[] = []
  private plan = new PagePlan(0)
  private readonly selected = new Set<number>()
  private original: PdfFile | null = null
  private options: PageEditorOptions = {}
  private readonly cards = new Map<number, HTMLButtonElement>()
  private readonly visible = new Set<number>()
  /** The rotation each drawn card was drawn with. */
  private readonly drawn = new Map<number, number>()
  private drawing = false
  private busy = false
  private drag: Drag | null = null
  /** A drag ends with a click on the card it started from, which must not select it. */
  private justDragged = false
  private readonly observer: IntersectionObserver
  private readonly grid: HTMLElement
  private readonly status: HTMLElement
  private readonly note: HTMLElement
  private readonly input: HTMLInputElement
  private readonly title: HTMLElement
  private readonly buttons: { action: Action; button: HTMLButtonElement }[]

  constructor(private readonly dialog: HTMLDialogElement, private readonly host: PageEditorHost) {
    this.grid = dialog.querySelector('#pageEditorGrid')!
    this.status = dialog.querySelector('#pageEditorStatus')!
    this.note = dialog.querySelector('#pageEditorNote')!
    this.input = dialog.querySelector('#pageEditorInput')!
    this.input.accept = `application/pdf,.pdf,${IMAGE_ACCEPT},${WORD_ACCEPT}`
    void host.platform.hasOffice?.().then(has => { if (has) this.input.accept += `,${OLD_WORD_ACCEPT}` })
    this.title = dialog.querySelector('#pageEditorTitle')!
    this.observer = new IntersectionObserver(entries => this.onVisibility(entries), { root: this.grid, rootMargin: VIEW_MARGIN })
    this.buttons = this.actions().map(action => ({ action, button: actionButton(action) }))
    // Saving stands beside "Kapat" at the top, where a finished task is closed.
    const close = dialog.querySelector('#pageEditorClose')!
    for (const { action, button } of this.buttons) {
      if (action.primary) close.before(button)
      else dialog.querySelector('#pageEditorActions')!.append(button)
    }
    close.addEventListener('click', () => void this.requestClose())
    // Esc and the phone's back button come here; leaving with changes is asked first.
    dialog.addEventListener('cancel', event => {
      event.preventDefault()
      void this.requestClose()
    })
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Delete' && this.selected.size > 0 && event.target === document.activeElement && !this.busy) this.remove()
    })
    this.input.addEventListener('change', () => {
      const files = [...this.input.files ?? []]
      this.input.value = ''
      void this.addFiles(files)
    })
    this.grid.addEventListener('click', event => {
      const card = (event.target as Element).closest<HTMLElement>('.page-card')
      if (!card || this.justDragged) return
      this.toggle(Number(card.dataset.key))
    })
    this.listenForDrags()
  }

  get isOpen(): boolean {
    return this.dialog.open
  }

  /** With `isNew` the editor owns `pdf` and lets it go on closing. */
  async open(pdf: PDFDocumentProxy, file: PdfFile, options: PageEditorOptions = {}): Promise<void> {
    this.sources = [{ name: file.name, pdf }]
    this.original = file
    this.options = options
    this.title.textContent = options.title ?? (options.isNew ? 'Görsellerden PDF' : 'Sayfaları Düzenle')
    this.plan = new PagePlan(pdf.numPages)
    this.selected.clear()
    this.render()
    this.dialog.showModal()
    this.grid.scrollTop = 0
    const encrypted = await isEncrypted(pdf).catch(() => false)
    this.note.hidden = !encrypted
    this.note.textContent = encrypted
      ? 'Bu belge parolalı. Yalnız bu belgenin sayfaları kaydedilirse parola korunur; başka PDF eklenirse yeni dosya parolasız olur.'
      : ''
  }

  private actions(): Action[] {
    return [
      {
        id: 'selectAll',
        label: 'Tümünü Seç',
        icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/>',
        run: () => this.selectAll(),
      },
      {
        id: 'rotateLeft',
        label: 'Sola Döndür',
        icon: '<path d="M3 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L3 10"/>',
        needsSelection: true,
        run: () => this.change(() => this.plan.rotate(this.selected, -1)),
      },
      {
        id: 'rotateRight',
        label: 'Sağa Döndür',
        icon: '<path d="M21 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10"/>',
        needsSelection: true,
        run: () => this.change(() => this.plan.rotate(this.selected, 1)),
      },
      {
        id: 'moveLeft',
        label: 'Sola Taşı',
        icon: '<path d="M15 6l-6 6 6 6"/>',
        needsSelection: true,
        run: () => this.change(() => this.plan.step(this.selected, -1)),
      },
      {
        id: 'moveRight',
        label: 'Sağa Taşı',
        icon: '<path d="M9 6l6 6-6 6"/>',
        needsSelection: true,
        run: () => this.change(() => this.plan.step(this.selected, 1)),
      },
      {
        id: 'delete',
        label: 'Sil',
        icon: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
        needsSelection: true,
        run: () => this.remove(),
      },
      {
        id: 'add',
        label: 'Dosya Ekle',
        icon: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
        run: () => this.input.click(),
      },
      {
        id: 'saveSelected',
        label: 'Seçilenleri Kaydet',
        icon: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
        needsSelection: true,
        run: () => void this.save(true),
      },
      {
        id: 'save',
        label: 'Kaydet',
        icon: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
        primary: true,
        run: () => void this.save(false),
      },
    ]
  }

  private change(edit: () => void): void {
    edit()
    this.render()
  }

  private remove(): void {
    this.change(() => {
      this.plan.remove(this.selected)
      this.selected.clear()
    })
  }

  private toggle(key: number): void {
    if (this.selected.has(key)) this.selected.delete(key)
    else this.selected.add(key)
    this.render()
  }

  private selectAll(): void {
    const all = this.plan.pages.length > 0 && this.selected.size === this.plan.pages.length
    this.selected.clear()
    if (!all) for (const page of this.plan.pages) this.selected.add(page.key)
    this.render()
  }

  private async addFiles(files: readonly File[]): Promise<void> {
    for (const file of files) {
      this.setBusy(true, `${file.name} ekleniyor…`)
      try {
        const made = isImageFile(file) ? imagesToPdf([await jpegFromFile(file)], this.options.imageSize ?? 'a4')
          : isWordFile(file.name) || isOldWordFile(file.name) ? await this.wordPdf(file)
          : null
        const picture = made && new File([made as Uint8Array<ArrayBuffer>], file.name, { type: 'application/pdf' })
        const pdf = await loadPdf(pdfFileFromBlob(picture ?? file), wasWrong => askPassword(file.name, wasWrong))
        // A file given whole to pdf.js cannot carry its password, so a copy without one goes in.
        const bytes = await isEncrypted(pdf)
          ? await pdf.extractPages([{ document: null }, { document: blankPdf() }])
          : new Uint8Array(await (picture ?? file).arrayBuffer())
        this.sources.push({ name: file.name, pdf, bytes })
        this.plan.append(this.sources.length - 1, pdf.numPages)
      } catch (error) {
        if (!(error instanceof OpenCancelled)) {
          console.error(error)
          showToast(`${file.name} eklenemedi.`)
        }
      } finally {
        this.setBusy(false)
      }
    }
    this.render()
    this.cards.get(this.plan.pages.at(-1)?.key ?? -1)?.scrollIntoView({ block: 'nearest' })
  }

  /** A Word document as a PDF, with the count shown while its pages are drawn. */
  private async wordPdf(file: File): Promise<Uint8Array> {
    const made = await wordToPdf(file, this.host.platform, {
      cancelled: false,
      progress: text => this.setBusy(true, `${file.name} ekleniyor… ${text}`),
    })
    if (!made) throw new Error('Word belgesi dönüştürülemedi.')
    return made
  }

  private async save(onlySelected: boolean): Promise<void> {
    const { original } = this
    const pages = onlySelected ? this.plan.pages.filter(page => this.selected.has(page.key)) : this.plan.pages
    if (!original || pages.length === 0 || this.busy) return
    this.setBusy(true, 'Kaydediliyor…')
    try {
      const others = this.sources.slice(1).map(source => source.bytes!)
      const data = await buildPdf(this.sources[0].pdf, others, pages)
      const base = this.options.saveName ?? nameWithSuffix(original.name, 'düzenlendi')
      const name = onlySelected ? nameWithSuffix(base.replace(/ \(düzenlendi\)\.pdf$/, '.pdf'), 'seçilen sayfalar') : base
      const saved = await this.host.platform.saveFile(name, data, original)
      if (saved === null) return
      if (onlySelected) {
        showToast(`Kaydedildi: ${saved}`)
        return
      }
      this.close()
      this.host.openSaved(pdfFileFromBlob(new File([data as Uint8Array<ArrayBuffer>], saved, { type: 'application/pdf' })))
      showToast(`Kaydedildi ve açıldı: ${saved}`)
    } catch (error) {
      if (error instanceof SameFileError) showToast('Açık bir belgenin üzerine kaydedilemez; başka bir ad seçin.')
      else {
        console.error(error)
        showToast('Kaydedilemedi.')
      }
    } finally {
      this.setBusy(false)
    }
  }

  private async requestClose(): Promise<void> {
    if (this.busy || !this.dialog.open) return
    if ((this.plan.isChanged || this.options.isNew) && !await confirmLeaveEditor()) return
    this.close()
  }

  private close(): void {
    this.dialog.close()
    this.observer.disconnect()
    for (const source of this.sources.slice(this.options.isNew ? 0 : 1)) void source.pdf.loadingTask.destroy()
    this.sources = []
    this.plan = new PagePlan(0)
    this.selected.clear()
    this.original = null
    this.cards.clear()
    this.visible.clear()
    this.drawn.clear()
    this.grid.replaceChildren()
  }

  private setBusy(busy: boolean, message?: string): void {
    this.busy = busy
    this.dialog.classList.toggle('is-busy', busy)
    this.render(message)
  }

  /** Puts the cards in the plan's order, reusing those already drawn. */
  private render(message?: string): void {
    const { pages } = this.plan
    const keys = new Set(pages.map(page => page.key))
    for (const [key, card] of this.cards) {
      if (keys.has(key)) continue
      this.observer.unobserve(card)
      this.cards.delete(key)
      this.visible.delete(key)
      this.drawn.delete(key)
      this.selected.delete(key)
    }
    const cards = pages.map((page, position) => this.cardFor(page, position))
    if (cards.some((card, index) => this.grid.children[index] !== card) || this.grid.children.length !== cards.length) {
      this.grid.replaceChildren(...cards)
    }
    const count = this.selected.size
    this.status.textContent = message ?? `${pages.length} sayfa${count > 0 ? ` · ${count} seçili` : ''}`
    for (const { action, button } of this.buttons) {
      button.disabled = this.busy
        || (action.needsSelection === true && count === 0)
        || (action.id === 'save' && (pages.length === 0 || !(this.plan.isChanged || this.options.isNew)))
      if (action.id === 'selectAll') {
        const label = pages.length > 0 && count === pages.length ? 'Seçimi Kaldır' : 'Tümünü Seç'
        button.querySelector('.page-editor__label')!.textContent = label
        button.title = label
      }
    }
    void this.drawVisible()
  }

  private cardFor(page: PlannedPage, position: number): HTMLButtonElement {
    let card = this.cards.get(page.key)
    if (!card) {
      card = document.createElement('button')
      card.type = 'button'
      card.className = 'page-card'
      card.dataset.key = String(page.key)
      card.setAttribute('role', 'option')
      const frame = document.createElement('span')
      frame.className = 'page-card__frame'
      const canvas = document.createElement('canvas')
      canvas.width = 0
      frame.append(canvas)
      const number = document.createElement('span')
      number.className = 'page-card__number'
      const origin = document.createElement('span')
      origin.className = 'page-card__origin'
      const source = this.sources[page.source]
      origin.textContent = page.source === 0 ? `s. ${page.index + 1}` : `${source.name} · s. ${page.index + 1}`
      origin.title = `${source.name}, sayfa ${page.index + 1}`
      card.append(frame, number, origin)
      this.cards.set(page.key, card)
      this.observer.observe(card)
    }
    const isSelected = this.selected.has(page.key)
    card.classList.toggle('is-selected', isSelected)
    card.setAttribute('aria-selected', String(isSelected))
    card.dataset.rotation = String(page.rotation)
    card.querySelector('.page-card__number')!.textContent = String(position + 1)
    card.setAttribute('aria-label', `Sayfa ${position + 1}${page.rotation ? `, ${page.rotation}° döndürülmüş` : ''}`)
    if (this.drawn.has(page.key) && this.drawn.get(page.key) !== page.rotation) this.release(page.key)
    return card
  }

  private onVisibility(entries: IntersectionObserverEntry[]): void {
    for (const { target, isIntersecting } of entries) {
      const key = Number((target as HTMLElement).dataset.key)
      if (isIntersecting) this.visible.add(key)
      else {
        this.visible.delete(key)
        this.release(key)
      }
    }
    void this.drawVisible()
  }

  private release(key: number): void {
    this.drawn.delete(key)
    const canvas = this.cards.get(key)?.querySelector('canvas')
    // A zero-sized canvas gives its memory back.
    if (canvas) canvas.width = 0
  }

  private async drawVisible(): Promise<void> {
    if (this.drawing) return
    this.drawing = true
    for (;;) {
      const page = this.plan.pages.find(candidate => this.visible.has(candidate.key) && !this.drawn.has(candidate.key))
      if (!page || !this.dialog.open) break
      this.drawn.set(page.key, page.rotation)
      await this.draw(page).catch((error: unknown) => {
        // Closing the editor cancels its work; anything else is a real failure of that page.
        if (this.dialog.open) console.error(error)
      })
    }
    this.drawing = false
  }

  private async draw({ key, source, index, rotation }: PlannedPage): Promise<void> {
    const pdf = this.sources[source]?.pdf
    const canvas = this.cards.get(key)?.querySelector('canvas')
    if (!pdf || !canvas) return
    const page = await pdf.getPage(index + 1)
    const angle = (page.rotate + rotation) % 360
    const width = page.getViewport({ scale: 1, rotation: angle }).width
    const viewport = page.getViewport({ scale: CARD_WIDTH * window.devicePixelRatio / width, rotation: angle })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport }).promise
    page.cleanup()
  }

  /**
   * Mouse and pen drag at once. A finger must rest on a page first; until then the move is the
   * grid's scroll, and once the page is picked up the scroll is held back.
   */
  private listenForDrags(): void {
    const grid = this.grid
    grid.addEventListener('contextmenu', event => event.preventDefault())
    grid.addEventListener('pointerdown', event => {
      const card = (event.target as Element).closest<HTMLElement>('.page-card')
      if (!card || event.button !== 0 || this.busy) return
      this.justDragged = false
      const drag: Drag = { pointerId: event.pointerId, key: Number(card.dataset.key), startX: event.clientX, startY: event.clientY }
      if (event.pointerType === 'touch') drag.timer = setTimeout(() => this.pickUp(drag), LONG_PRESS_MS)
      this.drag = drag
    })
    grid.addEventListener('pointermove', event => {
      const { drag } = this
      if (!drag || drag.pointerId !== event.pointerId) return
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX
      if (!drag.keys) {
        if (!moved) return
        if (event.pointerType === 'touch') {
          this.cancelDrag()
          return
        }
        this.pickUp(drag)
        grid.setPointerCapture(event.pointerId)
      }
      this.dragOver(drag, event.clientX, event.clientY)
    })
    // Once a finger has picked a page up, the grid must not scroll under it.
    grid.addEventListener('touchmove', event => {
      if (this.drag?.keys && event.cancelable) event.preventDefault()
    }, { passive: false })
    grid.addEventListener('pointerup', event => {
      const { drag } = this
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.keys && drag.position !== undefined) {
        this.plan.moveTo(drag.keys, drag.position)
        this.justDragged = true
      } else if (drag.keys) this.justDragged = true
      this.cancelDrag()
      this.render()
    })
    grid.addEventListener('pointercancel', () => this.cancelDrag())
  }

  private pickUp(drag: Drag): void {
    if (this.drag !== drag) return
    drag.keys = this.selected.has(drag.key) ? new Set(this.selected) : new Set([drag.key])
    this.grid.classList.add('is-dragging')
    for (const key of drag.keys) this.cards.get(key)?.classList.add('is-dragged')
  }

  /** Marks where the pages would land: before or after the card under the pointer. */
  private dragOver(drag: Drag, x: number, y: number): void {
    const area = this.grid.getBoundingClientRect()
    if (y < area.top + EDGE_PX) this.grid.scrollTop -= EDGE_SCROLL_PX
    else if (y > area.bottom - EDGE_PX) this.grid.scrollTop += EDGE_SCROLL_PX
    this.clearDropMark()
    const card = document.elementFromPoint(x, y)?.closest<HTMLElement>('.page-card')
    if (!card || !this.grid.contains(card)) {
      drag.position = undefined
      return
    }
    const box = card.getBoundingClientRect()
    const after = x > box.left + box.width / 2
    const index = this.plan.pages.findIndex(page => page.key === Number(card.dataset.key))
    drag.position = index + (after ? 1 : 0)
    card.classList.add(after ? 'is-drop-after' : 'is-drop-before')
  }

  private clearDropMark(): void {
    for (const card of this.grid.querySelectorAll('.is-drop-before, .is-drop-after')) {
      card.classList.remove('is-drop-before', 'is-drop-after')
    }
  }

  private cancelDrag(): void {
    clearTimeout(this.drag?.timer)
    this.drag = null
    this.clearDropMark()
    this.grid.classList.remove('is-dragging')
    for (const card of this.grid.querySelectorAll('.is-dragged')) card.classList.remove('is-dragged')
  }
}

function actionButton(action: Action): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.id = `pageEditor-${action.id}`
  button.className = `page-editor__action${action.primary ? ' is-primary' : ''}`
  button.title = action.label
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${action.icon}</svg>`
  const label = document.createElement('span')
  label.className = 'page-editor__label'
  label.textContent = action.label
  button.append(label)
  button.addEventListener('click', () => action.run())
  return button
}
