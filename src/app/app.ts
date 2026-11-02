import { isOpenableLink } from '../core/links'
import { needsLargeFileWarning } from '../core/open-policy'
import { loadPdf, PasswordException } from '../core/pdf-document'
import type { PdfFile } from '../core/pdf-file'
import { currentPlatform } from '../platform/platform'
import { TOOLS } from '../tools'
import type { ToolContext } from '../tools/tool'
import { confirmExternalLink, confirmLargeFile, showToast } from '../ui/messages'
import { SearchBar } from '../ui/search-bar'
import { SidePanel } from '../ui/side-panel'
import { Theme } from '../ui/theme'
import { ThumbnailList } from '../ui/thumbnails'
import { mountToolbar } from '../ui/toolbar'
import { DocumentView } from './document-view'
import { bindGestures } from './gestures'
import { printDocument } from './print'

const APP_TITLE = 'awPDF | mADEMatik'

/** The composition root: connects the platform, the document view and the tools. */
export function startApp(): void {
  const container = document.querySelector<HTMLDivElement>('#viewerContainer')!
  const viewer = document.querySelector<HTMLDivElement>('#viewer')!
  const emptyState = document.querySelector<HTMLElement>('#emptyState')!
  const platform = currentPlatform()
  const view = new DocumentView(container, viewer, url => void openLink(url))
  const sidePanel = new SidePanel(document.querySelector('#sidePanel')!)
  const searchBar = new SearchBar(document.querySelector('#searchBar')!, view)
  const context: ToolContext = {
    view,
    sidePanel,
    searchBar,
    theme: new Theme(),
    platform,
    pickFile: () => platform.pickFile(),
    print: () => {
      if (view.pdf) printDocument(view.pdf, platform).catch(error => {
        console.error(error)
        showToast('Yazdırılamadı.')
      })
    },
  }
  let lastOpen = 0

  async function openLink(url: string): Promise<void> {
    if (!isOpenableLink(url)) showToast('Bu bağlantı açılamıyor.')
    else if (await confirmExternalLink(url)) platform.openExternal(url)
  }

  async function open(file: PdfFile): Promise<void> {
    const attempt = ++lastOpen
    if (needsLargeFileWarning(file.size) && !await confirmLargeFile(file.name, file.size)) return
    try {
      const document_ = await loadPdf(file)
      if (attempt !== lastOpen) {
        void document_.loadingTask.destroy()
        return
      }
      container.hidden = false
      emptyState.hidden = true
      searchBar.close()
      view.open(document_, file)
      document.title = `${file.name} | ${APP_TITLE}`
    } catch (error) {
      console.error(error)
      showToast(error instanceof PasswordException ? 'Parolalı PDF\'ler henüz açılamıyor.' : 'Bu PDF açılamadı.')
    }
  }

  mountToolbar(document.querySelector('#toolbar')!, TOOLS, context)
  new ThumbnailList(sidePanel.element, view, sidePanel, page => {
    view.goTo(page)
    sidePanel.closeIfOverlay()
  })
  container.addEventListener('pointerdown', () => sidePanel.closeIfOverlay())
  bindGestures(container, view)
  platform.onFile(file => void open(file))
  document.querySelector('#emptyOpen')!.addEventListener('click', context.pickFile)
}
