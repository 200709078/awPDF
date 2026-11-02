import type { Tool } from './tool'

export const previousPageTool: Tool = {
  id: 'previousPage',
  label: 'Önceki Sayfa',
  icon: '<path d="M6 15l6-6 6 6"/>',
  needsDocument: true,
  isAvailable: view => view.hasPreviousPage,
  run: ({ view }) => view.previousPage(),
}

export const nextPageTool: Tool = {
  id: 'nextPage',
  label: 'Sonraki Sayfa',
  icon: '<path d="M6 9l6 6 6-6"/>',
  needsDocument: true,
  isAvailable: view => view.hasNextPage,
  run: ({ view }) => view.nextPage(),
}

export const twoPagesTool: Tool = {
  id: 'twoPages',
  label: 'İki Sayfa Görünümü',
  icon: '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>',
  needsDocument: true,
  isActive: ({ view }) => view.twoPages,
  run: ({ view }) => view.toggleTwoPages(),
}
