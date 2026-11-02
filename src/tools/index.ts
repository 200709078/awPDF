import { openTool } from './open'
import { nextPageTool, previousPageTool, twoPagesTool } from './pages'
import { sidePanelTool } from './side-panel'
import type { Tool } from './tool'
import { fitHeightTool, fitWidthTool, zoomInTool, zoomOutTool } from './zoom'

/** Every tool, in toolbar order. */
export const TOOLS: readonly Tool[] = [
  openTool,
  sidePanelTool,
  previousPageTool,
  nextPageTool,
  zoomOutTool,
  zoomInTool,
  fitWidthTool,
  fitHeightTool,
  twoPagesTool,
]
