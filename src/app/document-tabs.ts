import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfFile } from '../core/pdf-file'
import type { DocumentView, ViewState } from './document-view'

export interface DocumentTab {
  readonly document: PDFDocumentProxy
  readonly file: PdfFile
  readonly fingerprint: string
  /** Where the reader was; the view is one and passes from tab to tab. */
  state: ViewState
  /** Filled-in form fields not saved yet. */
  modified?: boolean
}

/** Answers whether a tab with unsaved changes may close; it may save them first. */
export type CloseGuard = (tab: DocumentTab) => Promise<boolean>

/** The open documents. Each stays loaded while another is on screen. */
export class DocumentTabs {
  private items: DocumentTab[] = []
  private current: DocumentTab | null = null
  private readonly listeners = new Set<() => void>()
  private readonly modifiedListeners = new Set<() => void>()
  private guard: CloseGuard = async () => true

  constructor(private readonly view: DocumentView, private readonly allowsSeveral: boolean) {}

  /** Asked before a tab with unsaved changes closes. */
  setCloseGuard(guard: CloseGuard): void {
    this.guard = guard
  }

  /** Runs when a tab's unsaved changes come or go. */
  onModifiedChange(listener: () => void): void {
    this.modifiedListeners.add(listener)
  }

  get hasUnsaved(): boolean {
    this.view.finishEditing()
    return this.items.some(tab => tab.modified)
  }

  /** Closes the tab, asking first when it has unsaved changes. Resolves whether it closed. */
  async requestClose(tab: DocumentTab): Promise<boolean> {
    if (tab === this.current) this.view.finishEditing()
    if (tab.modified && !await this.guard(tab)) return false
    this.close(tab)
    return true
  }

  /** On a phone a new document takes the open one's place, which may have unsaved changes. */
  async mayReplace(): Promise<boolean> {
    this.view.finishEditing()
    return this.allowsSeveral || !this.current?.modified || this.guard(this.current)
  }

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
    // pdf.js tells of a field filled in and of saved changes through these two.
    const storage = tab.document.annotationStorage as unknown as { onSetModified: () => void; onResetModified: () => void }
    storage.onSetModified = () => this.setModified(tab, true)
    storage.onResetModified = () => this.setModified(tab, false)
    const replaced = this.allowsSeveral ? [] : this.items
    this.items = [...this.allowsSeveral ? this.items : [], tab]
    this.show(tab)
    for (const old of replaced) release(old)
  }

  show(tab: DocumentTab): void {
    if (this.current && this.current !== tab) this.current.state = this.view.state
    this.current = tab
    this.view.open(tab.document, tab.file, tab.state, () => Boolean(tab.modified))
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

  /** pdf.js forgets the changes as soon as it writes them out; a save that did not happen puts them back. */
  markUnsaved(tab: DocumentTab): void {
    this.setModified(tab, true)
  }

  private setModified(tab: DocumentTab, modified: boolean): void {
    if (Boolean(tab.modified) === modified) return
    tab.modified = modified
    for (const listener of this.modifiedListeners) listener()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function release({ document, file }: DocumentTab): void {
  void document.loadingTask.destroy()
  file.close?.()
}
