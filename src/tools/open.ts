import type { Tool } from './tool'

export const openTool: Tool = {
  id: 'open',
  label: 'PDF Aç',
  icon: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shortcuts: ['ctrl+o'],
  run: context => context.pickFile(),
}
