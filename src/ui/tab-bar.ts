import type { DocumentTab, DocumentTabs } from '../app/document-tabs'

function tabElement(tab: DocumentTab, tabs: DocumentTabs): HTMLElement {
  const element = document.createElement('div')
  element.className = 'tab'
  const isActive = tab === tabs.active
  element.classList.toggle('is-active', isActive)
  element.classList.toggle('is-modified', Boolean(tab.modified))
  const title = document.createElement('button')
  title.type = 'button'
  title.className = 'tab__title'
  title.setAttribute('role', 'tab')
  title.setAttribute('aria-selected', String(isActive))
  title.textContent = tab.file.name
  title.title = tab.modified ? `${tab.file.name} (kaydedilmemiş değişiklikler var)` : tab.file.name
  title.addEventListener('click', () => tabs.show(tab))
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'tab__close'
  close.setAttribute('aria-label', `${tab.file.name} kapat`)
  close.title = 'Kapat'
  close.textContent = '✕'
  close.addEventListener('click', () => void tabs.requestClose(tab))
  element.append(title, close)
  return element
}

/** One tab per open document. Hidden where only one can be open and while none is. */
export function mountTabBar(root: HTMLElement, tabs: DocumentTabs): void {
  const render = () => {
    root.replaceChildren(...tabs.list.map(tab => tabElement(tab, tabs)))
    root.hidden = tabs.list.length === 0
  }
  tabs.onChange(() => {
    render()
    root.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  tabs.onModifiedChange(render)
}
