import type { Tool } from './tool'

export const singlePageTool: Tool = {
  id: 'singlePage',
  label: 'Tek Sayfa Görünümü',
  icon: '<rect x="6" y="4" width="12" height="16" rx="1"/><path d="M9 8h6M9 12h6"/>',
  needsDocument: true,
  isActive: ({ view }) => view.singlePage,
  run: ({ view }) => view.toggleSinglePage(),
}

export const rotateTool: Tool = {
  id: 'rotate',
  label: 'Görünümü Döndür',
  icon: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  shortcuts: ['r'],
  needsDocument: true,
  run: ({ view }) => view.rotate(),
}

export const presentationTool: Tool = {
  id: 'presentation',
  label: 'Sunum Modu',
  icon: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8"/>',
  shortcuts: ['f5'],
  needsDocument: true,
  run: ({ presentation }) => presentation.enter(),
}

export const fullscreenTool: Tool = {
  id: 'fullscreen',
  label: 'Tam Ekran',
  icon: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  isActive: ({ platform }) => platform.isFullscreen,
  run: ({ platform }) => platform.toggleFullscreen(),
}

export const themeTool: Tool = {
  id: 'theme',
  label: 'Koyu Tema',
  icon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/>',
  isActive: ({ theme }) => theme.isDark,
  run: ({ theme }) => theme.toggle(),
}
