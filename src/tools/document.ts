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
