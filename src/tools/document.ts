import { PEN_ICON } from '../ui/annotate-bar'
import { askPageNumber, showToast } from '../ui/messages'
import type { Tool } from './tool'

export const searchTool: Tool = {
  id: 'search',
  label: 'Metinde Ara',
  icon: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-5-5"/>',
  shortcuts: ['ctrl+f'],
  needsDocument: true,
  isActive: ({ searchBar }) => searchBar.isOpen,
  run: ({ searchBar }) => searchBar.toggle(),
}

export const annotateTool: Tool = {
  id: 'annotate',
  label: 'İşaretle',
  icon: PEN_ICON,
  needsDocument: true,
  isActive: ({ annotateBar }) => annotateBar.isOpen,
  run: ({ annotateBar }) => annotateBar.toggle(),
}

export const printTool: Tool = {
  id: 'print',
  label: 'Yazdır',
  icon: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/>',
  shortcuts: ['ctrl+p'],
  needsDocument: true,
  run: context => context.print(),
}

export const shareTool: Tool = {
  id: 'share',
  label: 'Paylaş',
  icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  needsDocument: true,
  isSupported: ({ platform }) => platform.share !== undefined,
  run: ({ platform, view }) => {
    if (view.file) platform.share?.(view.file).catch(() => showToast('Dosya paylaşılamadı.'))
  },
}

export const recentTool: Tool = {
  id: 'recent',
  label: 'Son Dosyalar',
  icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  run: ({ showRecentFiles }) => showRecentFiles(),
}

/** Also on Android, where there are no tabs, and on a board, where a tab's small ✕ is hard to hit. */
export const closeTabTool: Tool = {
  id: 'closeTab',
  label: 'Belgeyi Kapat',
  icon: '<path d="M12 3H5v18h6M12 3l5 5v3M12 3v5h5"/><path d="M14 14l7 7M21 14l-7 7"/>',
  shortcuts: ['ctrl+w'],
  needsDocument: true,
  run: ({ tabs }) => {
    if (tabs.active) void tabs.requestClose(tabs.active)
  },
}

/** A copy under a new name, with the filled-in form fields; the open file is never written over. */
export const saveAsTool: Tool = {
  id: 'saveAs',
  label: 'Farklı Kaydet',
  icon: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  shortcuts: ['ctrl+s'],
  needsDocument: true,
  run: ({ saveAs }) => saveAs(),
}

/** Pictures become pages of a new PDF; no document needs to be open. */
export const imagesToPdfTool: Tool = {
  id: 'imagesToPdf',
  label: 'Görsellerden PDF',
  icon: '<rect x="3" y="4" width="12" height="10" rx="1"/><path d="M3 12l3.5-3.5 3 3 2-2L15 12"/><path d="M14 20h7M18 17l3 3-3 3"/>',
  run: ({ pdfFromImages }) => pdfFromImages(),
}

/** A Word document (.docx) as a PDF, without a word processor. */
export const wordToPdfTool: Tool = {
  id: 'wordToPdf',
  label: "Word'den PDF",
  icon: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M8 12l1.5 5 1.5-4 1.5 4 1.5-5"/>',
  run: ({ pdfFromWord }) => pdfFromWord(),
}

/** Pages as PNG or JPG files; several in one ZIP. */
export const saveImagesTool: Tool = {
  id: 'saveImages',
  label: 'Görsel Olarak Kaydet',
  icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  needsDocument: true,
  run: ({ saveImages }) => saveImages(),
}

/** A rectangle drawn over a page becomes a picture, to save, copy or share. */
export const captureRegionTool: Tool = {
  id: 'captureRegion',
  label: 'Bölgeyi Görsel Al',
  icon: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  needsDocument: true,
  isActive: ({ regionCapture }) => regionCapture.isActive,
  run: ({ regionCapture }) => regionCapture.toggle(),
}

/** Removes, turns and moves pages and joins other PDFs, then saves a new file. */
export const editPagesTool: Tool = {
  id: 'editPages',
  label: 'Sayfaları Düzenle',
  icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><path d="M17.5 15v6M14.5 18h6"/>',
  needsDocument: true,
  run: ({ editPages }) => editPages(),
}

export const nextTabTool: Tool = {
  id: 'nextTab',
  label: 'Sonraki Belge',
  icon: '',
  shortcuts: ['ctrl+tab'],
  needsDocument: true,
  inToolbar: false,
  isSupported: ({ platform }) => !platform.singleDocument,
  run: ({ tabs }) => tabs.showNext(),
}

/** Has no button of its own: the page number in the toolbar opens it. */
export const goToPageTool: Tool = {
  id: 'goToPage',
  label: 'Sayfaya Git',
  icon: '',
  shortcuts: ['ctrl+g'],
  needsDocument: true,
  inToolbar: false,
  run: ({ view }) => {
    void askPageNumber(view.page, view.pageCount).then(page => {
      if (page !== null) view.goTo(page)
    })
  },
}
