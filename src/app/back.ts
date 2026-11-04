import type { ToolContext } from '../tools/tool'

/**
 * Closes the topmost thing on screen, as a phone's back button should; the document comes last, and
 * with it closed the first screen is back. False when nothing was open.
 */
export function closeTopmost({ presentation, searchBar, sidePanel, platform, tabs }: ToolContext, toolbarMenu: { close(): boolean }): boolean {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
  if (dialog) dialog.close()
  else if (presentation.isActive) presentation.exit()
  else if (toolbarMenu.close()) return true
  else if (searchBar.isOpen) searchBar.close()
  else if (sidePanel.isOpen) sidePanel.toggle()
  else if (platform.isFullscreen) platform.toggleFullscreen()
  else if (tabs.active) tabs.close(tabs.active)
  else return false
  return true
}
