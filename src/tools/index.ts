import { goToPageTool, printTool, recentTool, searchTool, shareTool } from './document'
import { openTool } from './open'
import { nextPageTool, previousPageTool, twoPagesTool } from './pages'
import { sidePanelTool } from './side-panel'
import type { Tool } from './tool'
import { fullscreenTool, rotateTool, singlePageTool, themeTool } from './view'
import { fitHeightTool, fitPageTool, fitWidthTool, zoomInTool, zoomOutTool } from './zoom'

/** Every tool, in toolbar order. The page buttons come early: a narrow screen keeps them as a pair. */
export const TOOLS: readonly Tool[] = [
  openTool,
  sidePanelTool,
  previousPageTool,
  nextPageTool,
  searchTool,
  recentTool,
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
