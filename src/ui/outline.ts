import type { DocumentView, OutlineItem } from '../app/document-view'

/**
 * The document's table of contents, as a tab of the side panel next to the page thumbnails. A
 * document without one has no tabs at all. Long lists stay folded, as the PDF itself asks.
 */
export class OutlineList {
  private pdf: DocumentView['pdf'] = null
  private readonly tabs = document.querySelector<HTMLElement>('#sidePanelTabs')!
  private readonly pagesTab = document.querySelector<HTMLElement>('#sidePanelPagesTab')!
  private readonly outlineTab = document.querySelector<HTMLElement>('#sidePanelOutlineTab')!
  private readonly thumbnails = document.querySelector<HTMLElement>('#thumbnailList')!

  constructor(private readonly root: HTMLElement, private readonly view: DocumentView, private readonly onPick: (item: OutlineItem) => void) {
    view.onChange(() => this.refresh())
    this.pagesTab.addEventListener('click', () => this.showOutline(false))
    this.outlineTab.addEventListener('click', () => this.showOutline(true))
  }

  private refresh(): void {
    const { pdf } = this.view
    if (pdf === this.pdf) return
    this.pdf = pdf
    this.fill([])
    void pdf?.getOutline().then(items => {
      if (pdf === this.pdf) this.fill(items ?? [])
    }).catch(console.error)
  }

  private fill(items: readonly OutlineItem[]): void {
    this.root.replaceChildren(...items.length > 0 ? [this.branch(items)] : [])
    this.tabs.hidden = items.length === 0
    if (items.length === 0) this.showOutline(false)
  }

  private showOutline(show: boolean): void {
    this.root.hidden = !show
    this.thumbnails.hidden = show
    this.pagesTab.setAttribute('aria-selected', String(!show))
    this.outlineTab.setAttribute('aria-selected', String(show))
  }

  private branch(items: readonly OutlineItem[]): HTMLUListElement {
    const list = document.createElement('ul')
    list.append(...items.map(item => this.row(item)))
    return list
  }

  private row(item: OutlineItem): HTMLLIElement {
    const row = document.createElement('li')
    const line = document.createElement('div')
    line.className = 'outline__line'
    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'outline__title'
    title.textContent = item.title
    title.style.fontWeight = item.bold ? '600' : ''
    title.style.fontStyle = item.italic ? 'italic' : ''
    title.addEventListener('click', () => this.onPick(item))
    row.append(line)
    if (item.items.length === 0) {
      line.append(title)
      return row
    }
    const children = this.branch(item.items)
    const fold = document.createElement('button')
    fold.type = 'button'
    fold.className = 'outline__fold'
    fold.setAttribute('aria-label', `${item.title} alt başlıkları`)
    const setOpen = (open: boolean) => {
      children.hidden = !open
      fold.setAttribute('aria-expanded', String(open))
    }
    setOpen((item.count ?? 0) > 0)
    fold.addEventListener('click', () => setOpen(children.hidden === true))
    line.append(fold, title)
    row.append(children)
    return row
  }
}
