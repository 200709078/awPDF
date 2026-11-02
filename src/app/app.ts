import { isOpenableLink } from '../core/links'
import { needsLargeFileWarning } from '../core/open-policy'
import { loadPdf, OpenCancelled } from '../core/pdf-document'
import type { PdfFile } from '../core/pdf-file'
import { deviceStore, RecentFiles, type RecentFile } from '../core/recent-files'
import { currentPlatform } from '../platform/platform'
import { TOOLS } from '../tools'
import type { ToolContext } from '../tools/tool'
import { askPassword, confirmExternalLink, confirmLargeFile, showToast } from '../ui/messages'
import { OutlineList } from '../ui/outline'
import { RecentList } from '../ui/recent-list'
import { connectScreenKeyboard } from '../ui/screen-keyboard'
import { SearchBar } from '../ui/search-bar'
import { SidePanel } from '../ui/side-panel'
import { mountTabBar } from '../ui/tab-bar'
import { Theme } from '../ui/theme'
import { ThumbnailList } from '../ui/thumbnails'
import { mountToolbar } from '../ui/toolbar'
import { closeTopmost } from './back'
import { DocumentTabs } from './document-tabs'
import { DocumentView } from './document-view'
import { bindGestures } from './gestures'
import { Presentation } from './presentation'
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
  const tabs = new DocumentTabs(view, !platform.singleDocument)
  const presentation = new Presentation(container, view, sidePanel, searchBar, platform)
  const context: ToolContext = {
    view,
    tabs,
    presentation,
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
  /** One at a time: a drop of several files must not stack up their dialogs. */
  let opening = Promise.resolve()

  async function openLink(url: string): Promise<void> {
    if (!isOpenableLink(url)) showToast('Bu bağlantı açılamıyor.')
    else if (await confirmExternalLink(url)) platform.openExternal(url)
  }

  function open(file: PdfFile): Promise<void> {
    opening = opening.then(() => openNow(file))
    return opening
  }

  async function openNow(file: PdfFile): Promise<void> {
    if (needsLargeFileWarning(file.size) && !await confirmLargeFile(file.name, file.size)) {
      file.close?.()
      return
    }
    try {
      const document_ = await loadPdf(file, wasWrong => askPassword(file.name, wasWrong))
      // pdf.js gives a file without an ID a hash of its contents, so this is never empty in practice.
      const fingerprint = document_.fingerprints[0] ?? file.name
      const alreadyOpen = tabs.find(fingerprint)
      if (alreadyOpen) {
        void document_.loadingTask.destroy()
        file.close?.()
        tabs.show(alreadyOpen)
        return
      }
      const page = recent.pageOf(fingerprint)
      tabs.add({ document: document_, file, fingerprint, state: { page } })
      recent.remember(fingerprint, file.name, file.source)
      if (page > 1) showToast(`Kaldığınız yer: sayfa ${page}`)
    } catch (error) {
      file.close?.()
      if (error instanceof OpenCancelled) return
      console.error(error)
      showToast('Bu PDF açılamadı.')
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

  tabs.onChange(() => {
    const name = tabs.active?.file.name
    document.title = name ? `${name} | ${APP_TITLE}` : APP_TITLE
    container.hidden = !name
    emptyState.hidden = Boolean(name)
    searchBar.close()
    if (!name && sidePanel.isOpen) sidePanel.toggle()
  })
  if (!platform.singleDocument) mountTabBar(document.querySelector('#tabBar')!, tabs)
  if (platform.screenKeyboard) connectScreenKeyboard(platform.screenKeyboard)
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
    if (tabs.active) recent.setPage(tabs.active.fingerprint, page)
  })
  platform.onFile(file => void open(file))
  platform.onBack?.(() => closeTopmost(context, toolbarMenu))
  document.querySelector('#emptyOpen')!.addEventListener('click', context.pickFile)
}
