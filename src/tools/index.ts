import { goToPageTool, printTool, searchTool, shareTool } from './document'
import { openTool } from './open'
import { nextPageTool, previousPageTool, twoPagesTool } from './pages'
import { sidePanelTool } from './side-panel'
import type { Tool } from './tool'
import { fullscreenTool, rotateTool, singlePageTool, themeTool } from './view'
import { fitHeightTool, fitPageTool, fitWidthTool, zoomInTool, zoomOutTool } from './zoom'

/** Every tool, in toolbar order. */
export const TOOLS: readonly Tool[] = [
  openTool,
  sidePanelTool,
  searchTool,
  previousPageTool,
  nextPageTool,
  zoomOutTool,
  zoomInTool,
  fitWidthTool,
  fitHeightTool,
  fitPageTool,
  singlePageTool,
  twoPagesTool,
  rotateTool,
  fullscreenTool,
  themeTool,
  printTool,
  shareTool,
  goToPageTool,
]
