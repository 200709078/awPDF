import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { isOpenableLink } from '../core/links'
import { needsLargeFileWarning } from '../core/open-policy'
import { imagesToPdf } from '../core/images-to-pdf'
import { blankPdf, isEncrypted, nameWithSuffix } from '../core/pdf-build'
import { loadPdf, OpenCancelled } from '../core/pdf-document'
import { pdfFileFromBlob, type PdfFile } from '../core/pdf-file'
import { deviceStore, RecentFiles, type RecentFile } from '../core/recent-files'
import { SignatureStore } from '../core/signatures'
import { currentPlatform, SameFileError } from '../platform/platform'
import { TOOLS } from '../tools'
import type { ToolContext } from '../tools/tool'
import { askCompressLevel, askProtection, askImagePageSize, askPassword, askPrintPages, askUnsavedChanges, confirmCompressed, confirmExternalLink, confirmLargeFile, showToast, startWork } from '../ui/messages'
import { OutlineList } from '../ui/outline'
import { PageEditor } from '../ui/page-editor'
import { RegionCapture } from '../ui/region-capture'
import { RecentList } from '../ui/recent-list'
import { connectScreenKeyboard } from '../ui/screen-keyboard'
import { AnnotateBar } from '../ui/annotate-bar'
import { SearchBar } from '../ui/search-bar'
import { SidePanel } from '../ui/side-panel'
import { mountTabBar } from '../ui/tab-bar'
import { Theme } from '../ui/theme'
import { ThumbnailList } from '../ui/thumbnails'
import { mountToolbar } from '../ui/toolbar'
import { closeTopmost } from './back'
import { DocumentTabs, type DocumentTab } from './document-tabs'
import { DocumentView } from './document-view'
import { bindGestures } from './gestures'
import { IMAGE_ACCEPT, isImageFile, jpegFromFile } from './images'
import { savePagesAsImages } from './page-images'
import { OLD_WORD_ACCEPT, OldWordError, WORD_ACCEPT, isOldWordFile, isWordFile, wordToPdf } from './word-to-pdf'
import { Presentation } from './presentation'
import { printDocument } from './print'
import { COMPRESS_LEVELS, CompressCancelled, compressPdf, type CompressResult } from './pdf-compress'
import { protectPdf } from '../core/pdf-encrypt'

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
  const annotateBar = new AnnotateBar(document.querySelector('#annotateBar')!, view, new SignatureStore(deviceStore()))
  const recent = new RecentFiles(deviceStore())
  const recentList = new RecentList(recent, file => void openRecent(file))
  const tabs = new DocumentTabs(view, !platform.singleDocument)
  const presentation = new Presentation(container, view, sidePanel, [searchBar, annotateBar], platform)
  const pageEditor = new PageEditor(document.querySelector('#pageEditor')!, {
    platform,
    openSaved: file => void open(file, { replacing: true }),
  })
  const imageInput = document.querySelector<HTMLInputElement>('#imageInput')!
  imageInput.accept = IMAGE_ACCEPT
  imageInput.addEventListener('change', () => {
    const files = [...imageInput.files ?? []]
    imageInput.value = ''
    if (files.length > 0) void pdfFromImages(files)
  })
  const wordInput = document.querySelector<HTMLInputElement>('#wordInput')!
  wordInput.accept = WORD_ACCEPT
  // With an office program the old .doc can be chosen too.
  void platform.hasOffice?.().then(has => { if (has) wordInput.accept = `${WORD_ACCEPT},${OLD_WORD_ACCEPT}` })
  wordInput.addEventListener('change', () => {
    const file = wordInput.files?.[0]
    wordInput.value = ''
    if (file) void pdfFromWord(file)
  })
  const context: ToolContext = {
    view,
    regionCapture: new RegionCapture(document.querySelector('.document-area')!, view, platform),
    tabs,
    presentation,
    sidePanel,
    searchBar,
    annotateBar,
    theme: new Theme(),
    platform,
    pickFile: () => platform.pickFile(),
    showRecentFiles: () => recentList.show(),
    print: () => void print(),
    saveAs: () => {
      if (tabs.active) void saveTab(tabs.active)
    },
    editPages: () => {
      view.finishEditing()
      if (tabs.active) void pageEditor.open(tabs.active.document, tabs.active.file)
    },
    pdfFromImages: () => imageInput.click(),
    pdfFromWord: () => wordInput.click(),
    compress: () => void compress(),
    protect: () => void protect(),
    saveImages: () => {
      view.finishEditing()
      if (view.pdf && view.file) void savePagesAsImages(view.pdf, view.file, view.page, platform)
    },
  }
  /** One at a time: a drop of several files must not stack up their dialogs. */
  let opening = Promise.resolve()

  /**
   * A smaller copy of the active document, marks and filled fields included, saved as a new file.
   * A file with a password is copied without it first (pdf-lib cannot write one).
   */
  async function compress(): Promise<void> {
    const tab = tabs.active
    if (!tab) return
    view.finishEditing()
    const level = await askCompressLevel()
    if (!level || tab !== tabs.active) return
    const wasModified = Boolean(tab.modified)
    const work = startWork('PDF küçültülüyor')
    let result: CompressResult | null = null
    try {
      const encrypted = await isEncrypted(tab.document).catch(() => false)
      const source = encrypted
        ? await tab.document.extractPages([{ document: null }, { document: blankPdf() }])
        // With nothing filled in or marked the file's own bytes; pdf.js warns otherwise.
        : tab.document.annotationStorage.size > 0 ? await tab.document.saveDocument() : await tab.document.getData()
      result = await compressPdf(source, COMPRESS_LEVELS[level], (done, total) => {
        work.progress(total > 0 ? `Görsel ${done} / ${total}` : '')
      }, () => work.cancelled, { dropLastPage: encrypted })
    } catch (error) {
      if (!(error instanceof CompressCancelled)) {
        console.error(error)
        showToast('Bu PDF küçültülemedi.')
      }
    } finally {
      work.done()
      // pdf.js forgets its changes once it has written them; the open document still has them.
      if (wasModified) tabs.markUnsaved(tab)
    }
    if (!result) return
    const before = tab.file.size
    // Written tighter, a file can shrink with no picture changed too.
    if (result.data.length >= before * 0.97) {
      showToast(result.images === 0
        ? 'Bu belgede küçültülecek görsel yok; dosya daha küçük olmuyor.'
        : 'Bu belge daha fazla küçülmüyor: görselleri zaten küçük.')
      return
    }
    if (await confirmCompressed(before, result.data.length)) await saveCopy(tab, 'küçültülmüş', result.data)
  }

  /**
   * A copy with a password (AES-256), or of a document that has one, with another one or none.
   * Marks and filled fields go in. The open document stays as it is.
   */
  async function protect(): Promise<void> {
    const tab = tabs.active
    if (!tab) return
    view.finishEditing()
    const encrypted = await isEncrypted(tab.document).catch(() => false)
    const answer = await askProtection(encrypted)
    if (!answer || tab !== tabs.active) return
    const wasModified = Boolean(tab.modified)
    const work = startWork('password' in answer ? 'Parola konuyor' : 'Parola kaldırılıyor')
    let data: Uint8Array | null = null
    try {
      // A document with a password is copied without it first (see `blankPdf`).
      const source = encrypted
        ? await tab.document.extractPages([{ document: null }, { document: blankPdf() }])
        : tab.document.annotationStorage.size > 0 ? await tab.document.saveDocument() : await tab.document.getData()
      data = await protectPdf(source, 'password' in answer ? answer.password : null, { dropLastPage: encrypted })
    } catch (error) {
      console.error(error)
      showToast('Parola konamadı.')
    } finally {
      work.done()
      if (wasModified) tabs.markUnsaved(tab)
    }
    if (data) await saveCopy(tab, 'password' in answer ? 'parolalı' : 'parolasız', data)
  }

  /** A new file made from the tab's document, named after it; the open one stays as it is. */
  async function saveCopy(tab: DocumentTab, suffix: string, data: Uint8Array): Promise<void> {
    try {
      const saved = await platform.saveFile(nameWithSuffix(tab.file.name, suffix), data, tab.file)
      if (saved !== null) showToast(`Kaydedildi: ${saved}`)
    } catch (error) {
      if (error instanceof SameFileError) showToast('Açık bir belgenin üzerine kaydedilemez; başka bir ad seçin.')
      else {
        console.error(error)
        showToast('Kaydedilemedi.')
      }
    }
  }

  async function print(): Promise<void> {
    const { pdf } = view
    if (!pdf) return
    view.finishEditing()
    const pages = await askPrintPages(view.page, view.pageCount)
    if (pages && pdf === view.pdf) await printDocument(pdf, platform, pages).catch((error: unknown) => {
      console.error(error)
      showToast('Yazdırılamadı.')
    })
  }

  /**
   * A copy with the filled-in fields, under a new name; the open file is left as it was. Resolves
   * whether it was saved.
   */
  async function saveTab(tab: DocumentTab): Promise<boolean> {
    // pdf.js clears its own "modified" when it writes the data, before the user has chosen a place.
    if (tab === tabs.active) view.finishEditing()
    const wasModified = Boolean(tab.modified)
    const suffix = hasMarks(tab.document) ? 'işaretli' : wasModified ? 'doldurulmuş' : 'kopya'
    let saved: string | null = null
    try {
      const data = await tab.document.saveDocument()
      saved = await platform.saveFile(nameWithSuffix(tab.file.name, suffix), data, tab.file)
      if (saved !== null) showToast(`Kaydedildi: ${saved}`)
    } catch (error) {
      if (error instanceof SameFileError) showToast('Açık bir belgenin üzerine kaydedilemez; başka bir ad seçin.')
      else {
        console.error(error)
        showToast('Kaydedilemedi.')
      }
    }
    if (saved === null && wasModified) tabs.markUnsaved(tab)
    return saved !== null
  }

  /**
   * Pictures, each made a page, open in the page editor as a new document: there they are put in
   * order, turned and saved. Pictures the browser cannot read are named and left out.
   */
  async function pdfFromImages(files: readonly File[]): Promise<void> {
    const size = await askImagePageSize()
    if (!size) return
    const work = startWork('Görseller hazırlanıyor')
    const pictures = []
    const unreadable: string[] = []
    for (const [done, file] of files.entries()) {
      if (work.cancelled) return
      work.progress(`${done + 1} / ${files.length}`)
      try {
        pictures.push(await jpegFromFile(file))
      } catch {
        unreadable.push(file.name)
      }
    }
    work.done()
    if (unreadable.length > 0) showToast(`Açılamayan görsel: ${unreadable.join(', ')}`)
    if (pictures.length === 0) return
    // Android's photo picker names pictures by number; such a name says nothing.
    const base = files[0].name.replace(/\.[^.]+$/, '')
    const name = /^\d*$/.test(base) ? `Görseller ${new Date().toLocaleDateString('sv-SE')}.pdf` : `${base}.pdf`
    const file = pdfFileFromBlob(new File([imagesToPdf(pictures, size) as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' }))
    try {
      const pdf = await loadPdf(file, () => Promise.resolve(null))
      await pageEditor.open(pdf, file, { isNew: true, saveName: name, imageSize: size })
    } catch (error) {
      console.error(error)
      showToast('Görsellerden PDF oluşturulamadı.')
    }
  }

  /**
   * A Word document, each page drawn as a picture, opens in the page editor as a new document, as
   * pictures do. No word processor is needed; the fonts are the device's, so lines may break a
   * little differently than in Word.
   */
  async function pdfFromWord(file: File): Promise<void> {
    if (!isWordFile(file.name) && !isOldWordFile(file.name)) {
      showToast('Yalnız Word belgeleri (.docx) dönüştürülebilir.')
      return
    }
    const work = startWork('Word belgesi hazırlanıyor')
    let bytes: Uint8Array | null
    try {
      bytes = await wordToPdf(file, platform, work)
    } catch (error) {
      if (!(error instanceof OldWordError)) console.error(error)
      work.done()
      showToast(error instanceof OldWordError
        ? 'Eski Word biçimi (.doc) açılamıyor; belgeyi Word\'de .docx olarak kaydedip yeniden deneyin.'
        : `Word belgesi okunamadı: ${file.name}`)
      return
    }
    work.done()
    if (!bytes) return
    const name = `${file.name.replace(/\.docx?$/i, '')}.pdf`
    const pdfFile = pdfFileFromBlob(new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' }))
    try {
      const pdf = await loadPdf(pdfFile, () => Promise.resolve(null))
      await pageEditor.open(pdf, pdfFile, { isNew: true, saveName: name, title: "Word'den PDF" })
    } catch (error) {
      console.error(error)
      showToast('Word belgesinden PDF oluşturulamadı.')
    }
  }

  async function openLink(url: string): Promise<void> {
    if (!isOpenableLink(url)) showToast('Bu bağlantı açılamıyor.')
    else if (await confirmExternalLink(url)) platform.openExternal(url)
  }

  /** `replacing`: a file the app has just made from the open one, which may take its place. */
  function open(file: PdfFile, { replacing = false } = {}): Promise<void> {
    opening = opening.then(() => openNow(file, replacing))
    return opening
  }

  async function openNow(file: PdfFile, replacing: boolean): Promise<void> {
    // A picture dropped on the window becomes a PDF.
    if (isImageFile(new File([], file.name))) {
      const picture = new File([await file.read(0, file.size) as Uint8Array<ArrayBuffer>], file.name)
      file.close?.()
      await pdfFromImages([picture])
      return
    }
    // So does a Word document.
    if (isWordFile(file.name) || isOldWordFile(file.name)) {
      const document_ = new File([await file.read(0, file.size) as Uint8Array<ArrayBuffer>], file.name)
      file.close?.()
      await pdfFromWord(document_)
      return
    }
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
      if (!replacing && !await tabs.mayReplace()) {
        void document_.loadingTask.destroy()
        file.close?.()
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
    annotateBar.close()
    if (!name && sidePanel.isOpen) sidePanel.toggle()
  })
  tabs.setCloseGuard(async tab => {
    const answer = await askUnsavedChanges(tab.file.name)
    return answer === 'discard' || (answer === 'save' && await saveTab(tab))
  })
  // The browser asks, and Electron's shell shows its own question (electron/main.ts).
  window.addEventListener('beforeunload', event => {
    if (tabs.hasUnsaved) event.preventDefault()
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
  // On a phone the status bar sits on top of the toolbar, so it takes the toolbar's colour.
  const colourSystemBars = () => platform.setSystemBars?.({
    color: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    dark: context.theme.isDark,
  })
  context.theme.onChange(colourSystemBars)
  colourSystemBars()
  document.querySelector('#emptyOpen')!.addEventListener('click', context.pickFile)
  document.querySelector('#emptyImages')!.addEventListener('click', context.pdfFromImages)
  document.querySelector('#emptyWord')!.addEventListener('click', context.pdfFromWord)
}

/** Whether the document has marks of the marking bar (pdf.js keeps them under this prefix). */
function hasMarks(document: PDFDocumentProxy): boolean {
  for (const [key] of document.annotationStorage as unknown as Iterable<[string, unknown]>) {
    if (key.startsWith('pdfjs_internal_editor_')) return true
  }
  return false
}
