import { openTool } from './open'
import { nextPageTool, previousPageTool } from './pages'
import type { Tool } from './tool'
import { fitWidthTool, zoomInTool, zoomOutTool } from './zoom'

/** Every tool, in toolbar order. */
export const TOOLS: readonly Tool[] = [
  openTool,
  previousPageTool,
  nextPageTool,
  zoomOutTool,
  zoomInTool,
  fitWidthTool,
]
