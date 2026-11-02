import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfFile } from '../core/pdf-file'
import type { DocumentView, ViewState } from './document-view'

export interface DocumentTab {
  readonly document: PDFDocumentProxy
  readonly file: PdfFile
  readonly fingerprint: string
  /** Where the reader was; the view is one and passes from tab to tab. */
  state: ViewState
}

/** The open documents. Each stays loaded while another is on screen. */
export class DocumentTabs {
  private items: DocumentTab[] = []
  private current: DocumentTab | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly view: DocumentView, private readonly allowsSeveral: boolean) {}

  get list(): readonly DocumentTab[] {
    return this.items
  }

  get active(): DocumentTab | null {
    return this.current
  }

  /** Runs when a tab opens or closes, or another one comes to the front. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  find(fingerprint: string): DocumentTab | undefined {
    return this.items.find(tab => tab.fingerprint === fingerprint)
  }

  add(tab: DocumentTab): void {
    const replaced = this.allowsSeveral ? [] : this.items
    this.items = [...this.allowsSeveral ? this.items : [], tab]
    this.show(tab)
    for (const old of replaced) release(old)
  }

  show(tab: DocumentTab): void {
    if (this.current && this.current !== tab) this.current.state = this.view.state
    this.current = tab
    this.view.open(tab.document, tab.file, tab.state)
    this.notify()
  }

  close(tab: DocumentTab): void {
    const index = this.items.indexOf(tab)
    if (index === -1) return
    this.items = this.items.filter(other => other !== tab)
    if (tab === this.current) {
      this.current = null
      const next = this.items[Math.min(index, this.items.length - 1)]
      if (next) this.show(next)
      else {
        this.view.clear()
        this.notify()
      }
    } else this.notify()
    release(tab)
  }

  /** The tab after the current one, back to the first at the end. */
  showNext(): void {
    if (!this.current || this.items.length < 2) return
    this.show(this.items[(this.items.indexOf(this.current) + 1) % this.items.length])
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function release({ document, file }: DocumentTab): void {
  void document.loadingTask.destroy()
  file.close?.()
}
