import type { RecentFile, RecentFiles } from '../core/recent-files'

const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

function recentItem(file: RecentFile, onPick: (file: RecentFile) => void): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'recent-file'
  const name = document.createElement('span')
  name.className = 'recent-file__name'
  name.textContent = file.name
  const detail = document.createElement('span')
  detail.className = 'recent-file__detail'
  detail.textContent = `Sayfa ${file.page} · ${dateFormat.format(file.openedAt)}`
  item.append(name, detail)
  item.addEventListener('click', () => onPick(file))
  return item
}

/** The same list twice: on the empty screen, and in a dialog while a document is open. */
export class RecentList {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#recentDialog')!
  private readonly dialogItems = document.querySelector<HTMLElement>('#recentDialogList')!
  private readonly screen = document.querySelector<HTMLElement>('#recentFiles')!
  private readonly screenItems = document.querySelector<HTMLElement>('#recentFilesList')!

  constructor(private readonly recent: RecentFiles, private readonly onPick: (file: RecentFile) => void) {
    recent.onChange(() => this.render())
    for (const clear of document.querySelectorAll('.recent-clear')) {
      clear.addEventListener('click', () => recent.clear())
    }
    this.render()
  }

  show(): void {
    this.render()
    this.dialog.showModal()
  }

  private render(): void {
    const items = () => this.recent.list.map(file => recentItem(file, picked => {
      this.dialog.close()
      this.onPick(picked)
    }))
    this.screenItems.replaceChildren(...items())
    this.dialogItems.replaceChildren(...items())
    this.screen.hidden = this.recent.list.length === 0
    document.querySelector<HTMLElement>('#recentDialogEmpty')!.hidden = this.recent.list.length > 0
  }
}
