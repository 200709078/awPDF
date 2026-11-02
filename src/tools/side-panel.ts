import type { Tool } from './tool'

export const sidePanelTool: Tool = {
  id: 'sidePanel',
  label: 'Sayfa Paneli',
  icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  shortcuts: ['f4'],
  needsDocument: true,
  isActive: ({ sidePanel }) => sidePanel.isOpen,
  run: ({ sidePanel }) => sidePanel.toggle(),
}
