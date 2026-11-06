import { renderPageImage, type PageRegion } from '../app/page-images'
import type { DocumentView } from '../app/document-view'
import { PNG_TYPE, SameFileError, type Platform } from '../platform/platform'
import { pdfFileFromBlob } from '../core/pdf-file'
import { showToast } from './messages'

/** Sharp enough to print a question from a book or project it on a board. */
const REGION_DPI = 300
/** A smaller drag is taken for a slip of the finger. */
const MIN_SIDE_PX = 12

/**
 * Takes a part of a page as a picture. While it is on, a layer over the document takes the
 * pointer: a drag draws the rectangle, and the part of the page under it is drawn again at
 * 300 DPI, then saved, copied or shared. Scrolling waits until it is off.
 */
export class RegionCapture {
  private overlay: HTMLDivElement | null = null
  private readonly listeners = new Set<() => void>()
  private readonly hint: HTMLElement
  private readonly dialog: HTMLDialogElement
  private result: { data: Uint8Array; name: string; url: string } | null = null

  constructor(private readonly area: HTMLElement, private readonly view: DocumentView, private readonly platform: Platform) {
    this.hint = document.querySelector('#regionHint')!
    this.dialog = document.querySelector('#regionDialog')!
    document.querySelector('#regionCancel')!.addEventListener('click', () => this.stop())
    // The hint lies on the layer; a press on it is not the start of a rectangle.
    this.hint.addEventListener('pointerdown', event => event.stopPropagation())
    document.querySelector('#regionClose')!.addEventListener('click', () => this.dialog.close())
    document.querySelector('#regionSave')!.addEventListener('click', () => void this.save())
    document.querySelector('#regionCopy')!.addEventListener('click', () => void this.copy())
    document.querySelector('#regionShare')!.addEventListener('click', () => void this.share())
    this.dialog.addEventListener('close', () => {
      if (this.result) URL.revokeObjectURL(this.result.url)
      this.result = null
    })
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isActive && !this.dialog.open) this.stop()
    })
    // A new document, or none, ends the selection.
    view.onChange(() => {
      if (this.isActive && !view.isOpen) this.stop()
    })
  }

  get isActive(): boolean {
    return this.overlay !== null
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  toggle(): void {
    if (this.isActive) this.stop()
    else this.start()
  }

  stop(): void {
    this.overlay?.remove()
    this.overlay = null
    this.hint.hidden = true
    document.body.append(this.hint)
    this.notify()
  }

  private start(): void {
    if (!this.view.isOpen) return
    const overlay = document.createElement('div')
    overlay.className = 'region-overlay'
    const box = document.createElement('div')
    box.className = 'region-overlay__box'
    box.hidden = true
    overlay.append(box)
    let start: { x: number; y: number; id: number } | null = null
    const rectangle = (event: PointerEvent) => {
      const area = overlay.getBoundingClientRect()
      const x = Math.min(Math.max(event.clientX, area.left), area.right)
      const y = Math.min(Math.max(event.clientY, area.top), area.bottom)
      return { left: Math.min(start!.x, x), top: Math.min(start!.y, y), right: Math.max(start!.x, x), bottom: Math.max(start!.y, y) }
    }
    overlay.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
      overlay.setPointerCapture(event.pointerId)
      overlay.classList.add('is-drawing')
    })
    overlay.addEventListener('pointermove', event => {
      if (!start || event.pointerId !== start.id) return
      const area = overlay.getBoundingClientRect()
      const { left, top, right, bottom } = rectangle(event)
      Object.assign(box.style, { left: `${left - area.left}px`, top: `${top - area.top}px`, width: `${right - left}px`, height: `${bottom - top}px` })
      box.hidden = false
    })
    overlay.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.id) return
      const chosen = rectangle(event)
      start = null
      box.hidden = true
      overlay.classList.remove('is-drawing')
      if (chosen.right - chosen.left >= MIN_SIDE_PX && chosen.bottom - chosen.top >= MIN_SIDE_PX) void this.take(chosen)
    })
    overlay.addEventListener('pointercancel', () => {
      start = null
      box.hidden = true
      overlay.classList.remove('is-drawing')
    })
    overlay.append(this.hint)
    this.area.append(overlay)
    this.overlay = overlay
    this.hint.hidden = false
    this.notify()
  }

  /** The page under the rectangle's middle, and the part of it the rectangle covers. */
  private async take(chosen: { left: number; top: number; right: number; bottom: number }): Promise<void> {
    const { pdf } = this.view
    if (!pdf) return
    const middle = { x: (chosen.left + chosen.right) / 2, y: (chosen.top + chosen.bottom) / 2 }
    const found = [...this.area.querySelectorAll<HTMLElement>('.page[data-page-number]')].map(page => ({
      number: Number(page.dataset.pageNumber),
      box: (page.querySelector('.canvasWrapper') ?? page).getBoundingClientRect(),
    })).find(({ box }) => box.left <= middle.x && middle.x <= box.right && box.top <= middle.y && middle.y <= box.bottom)
    if (!found) {
      showToast('Bölgeyi bir sayfanın üstüne çizin.')
      return
    }
    const { number, box } = found
    const fraction = (value: number, from: number, size: number) => Math.min(Math.max((value - from) / size, 0), 1)
    const region: PageRegion = {
      left: fraction(chosen.left, box.left, box.width),
      top: fraction(chosen.top, box.top, box.height),
      right: fraction(chosen.right, box.left, box.width),
      bottom: fraction(chosen.bottom, box.top, box.height),
    }
    // Drawing the part again at 300 DPI takes a few seconds on a phone; the user sees it is coming.
    const hint = this.hint.querySelector('span')!
    const waiting = hint.textContent
    hint.textContent = 'Bölge hazırlanıyor…'
    this.overlay?.classList.add('is-busy')
    try {
      const image = await renderPageImage(pdf, number, { dpi: REGION_DPI, format: 'png', rotation: this.view.rotation, region })
      const base = (this.view.file?.name ?? 'belge').replace(/\.pdf$/i, '')
      this.show({ data: image.data, name: `${base} - sayfa ${number} bölge.png` }, `${image.width} × ${image.height} piksel`)
    } catch (error) {
      console.error(error)
      showToast('Bölge görsele çevrilemedi.')
    } finally {
      hint.textContent = waiting
      this.overlay?.classList.remove('is-busy')
    }
  }

  private show(result: { data: Uint8Array; name: string }, size: string): void {
    const url = URL.createObjectURL(new Blob([result.data as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    this.result = { ...result, url }
    document.querySelector<HTMLImageElement>('#regionPreview')!.src = url
    document.querySelector('#regionSize')!.textContent = size
    document.querySelector<HTMLElement>('#regionCopy')!.hidden = !canCopyImages()
    document.querySelector<HTMLElement>('#regionShare')!.hidden = !this.platform.share
    this.dialog.showModal()
  }

  private async save(): Promise<void> {
    const { result } = this
    if (!result) return
    try {
      const saved = await this.platform.saveFile(result.name, result.data, this.view.file ?? undefined, PNG_TYPE)
      if (saved === null) return
      this.dialog.close()
      showToast(`Kaydedildi: ${saved}`)
    } catch (error) {
      if (error instanceof SameFileError) showToast('Açık bir belgenin üzerine kaydedilemez; başka bir ad seçin.')
      else {
        console.error(error)
        showToast('Kaydedilemedi.')
      }
    }
  }

  private async copy(): Promise<void> {
    const { result } = this
    if (!result) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([result.data as Uint8Array<ArrayBuffer>], { type: 'image/png' }) })])
      this.dialog.close()
      showToast('Görsel kopyalandı; başka bir yere yapıştırabilirsiniz.')
    } catch (error) {
      console.error(error)
      showToast('Görsel kopyalanamadı.')
    }
  }

  private async share(): Promise<void> {
    const { result } = this
    if (!result || !this.platform.share) return
    const file = pdfFileFromBlob(new File([result.data as Uint8Array<ArrayBuffer>], result.name, { type: 'image/png' }))
    await this.platform.share(file, PNG_TYPE).catch(() => showToast('Görsel paylaşılamadı.'))
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function canCopyImages(): boolean {
  return typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function'
}
