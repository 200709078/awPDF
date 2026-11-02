import type { Tool } from './tool'

export const previousPageTool: Tool = {
  id: 'previousPage',
  label: 'Önceki Sayfa',
  icon: '<path d="M6 15l6-6 6 6"/>',
  needsDocument: true,
  isAvailable: view => view.page > 1,
  run: ({ view }) => view.goTo(view.page - 1),
}

export const nextPageTool: Tool = {
  id: 'nextPage',
  label: 'Sonraki Sayfa',
  icon: '<path d="M6 9l6 6 6-6"/>',
  needsDocument: true,
  isAvailable: view => view.page < view.pageCount,
  run: ({ view }) => view.goTo(view.page + 1),
}
