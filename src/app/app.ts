import { isOpenableLink } from '../core/links'
import { needsLargeFileWarning } from '../core/open-policy'
import { loadPdf, PasswordException } from '../core/pdf-document'
import type { PdfFile } from '../core/pdf-file'
import { deviceStore, RecentFiles, type RecentFile } from '../core/recent-files'
import { currentPlatform } from '../platform/platform'
import { TOOLS } from '../tools'
import type { ToolContext } from '../tools/tool'
import { confirmExternalLink, confirmLargeFile, showToast } from '../ui/messages'
import { OutlineList } from '../ui/outline'
import { RecentList } from '../ui/recent-list'
import { SearchBar } from '../ui/search-bar'
import { SidePanel } from '../ui/side-panel'
import { Theme } from '../ui/theme'
import { ThumbnailList } from '../ui/thumbnails'
import { mountToolbar } from '../ui/toolbar'
import { closeTopmost } from './back'
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
  const recent = new RecentFiles(deviceStore())
  const recentList = new RecentList(recent, file => void openRecent(file))
  const context: ToolContext = {
    view,
    sidePanel,
    searchBar,
    theme: new Theme(),
    platform,
    pickFile: () => platform.pickFile(),
    showRecentFiles: () => recentList.show(),
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
      // pdf.js gives a file without an ID a hash of its contents, so this is never empty in practice.
      const fingerprint = document_.fingerprints[0] ?? file.name
      const startPage = recent.pageOf(fingerprint)
      view.open(document_, file, startPage)
      recent.remember(fingerprint, file.name, file.source)
      if (startPage > 1) showToast(`Kaldığınız yer: sayfa ${startPage}`)
      document.title = `${file.name} | ${APP_TITLE}`
    } catch (error) {
      console.error(error)
      showToast(error instanceof PasswordException ? 'Parolalı PDF\'ler henüz açılamıyor.' : 'Bu PDF açılamadı.')
    }
  }

  async function openRecent({ fingerprint, source }: RecentFile): Promise<void> {
    const file = source ? await platform.reopen?.(source).catch(() => null) : undefined
    if (file) await open(file)
    else if (file === null) {
      recent.remove(fingerprint)
      showToast('Bu dosya artık açılamıyor.')
    } else {
      // Kept the page all the same: choosing the file brings the reader back to it.
      showToast('Dosyanın yeri bilinmiyor, lütfen yeniden seçin.')
      platform.pickFile()
    }
  }

  const toolbarMenu = mountToolbar(document.querySelector('#toolbar')!, TOOLS, context)
  new ThumbnailList(document.querySelector('#thumbnailList')!, view, sidePanel, page => {
    view.goTo(page)
    sidePanel.closeIfOverlay()
  })
  new OutlineList(document.querySelector('#outlineList')!, view, ({ dest, url }) => {
    if (dest) view.goToDestination(dest)
    else if (url) void openLink(url)
    sidePanel.closeIfOverlay()
  })
  container.addEventListener('pointerdown', () => sidePanel.closeIfOverlay())
  bindGestures(container, view)
  view.onPageChange(page => {
    const fingerprint = view.pdf?.fingerprints[0]
    if (fingerprint) recent.setPage(fingerprint, page)
  })
  platform.onFile(file => void open(file))
  platform.onBack?.(() => closeTopmost(context, toolbarMenu))
  document.querySelector('#emptyOpen')!.addEventListener('click', context.pickFile)
}
