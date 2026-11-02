import type { Tool } from './tool'

export const zoomOutTool: Tool = {
  id: 'zoomOut',
  label: 'Uzaklaştır',
  icon: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M8 11h6"/>',
  shortcuts: ['ctrl+-'],
  needsDocument: true,
  run: ({ view }) => view.zoomOut(),
}

export const zoomInTool: Tool = {
  id: 'zoomIn',
  label: 'Yakınlaştır',
  icon: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M8 11h6M11 8v6"/>',
  shortcuts: ['ctrl++', 'ctrl+='],
  needsDocument: true,
  run: ({ view }) => view.zoomIn(),
}

export const fitWidthTool: Tool = {
  id: 'fitWidth',
  label: 'Genişliğe Sığdır',
  icon: '<path d="M3 5v14M21 5v14M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>',
  shortcuts: ['ctrl+0'],
  needsDocument: true,
  run: ({ view }) => view.fitWidth(),
}

export const fitHeightTool: Tool = {
  id: 'fitHeight',
  label: 'Yüksekliğe Sığdır',
  icon: '<path d="M5 3h14M5 21h14M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>',
  needsDocument: true,
  run: ({ view }) => view.fitHeight(),
}
