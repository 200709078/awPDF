import type { ToolContext } from '../tools/tool'

/**
 * Closes the topmost thing on screen, as a phone's back button should; the document comes last, and
 * with it closed the first screen is back. False when nothing was open.
 */
export function closeTopmost({ presentation, searchBar, annotateBar, sidePanel, platform, tabs, regionCapture }: ToolContext, toolbarMenu: { close(): boolean }): boolean {
  // The last one opened is on top. A dialog may refuse to close, as Esc lets it, to ask first.
  const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)
  if (dialog) {
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
  }
  else if (presentation.isActive) presentation.exit()
  else if (regionCapture.isActive) regionCapture.stop()
  else if (toolbarMenu.close()) return true
  else if (annotateBar.isOpen) annotateBar.close()
  else if (searchBar.isOpen) searchBar.close()
  else if (sidePanel.isOpen) sidePanel.toggle()
  else if (platform.isFullscreen) platform.toggleFullscreen()
  else if (tabs.active) void tabs.requestClose(tabs.active)
  else return false
  return true
}
