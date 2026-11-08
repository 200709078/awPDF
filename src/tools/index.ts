import { annotateTool, compressTool, protectTool, pdfToWordTool, ocrTool, captureRegionTool, closeTabTool, editPagesTool, imagesToPdfTool, saveImagesTool, wordToPdfTool, goToPageTool, nextTabTool, printTool, recentTool, saveAsTool, searchTool, shareTool } from './document'
import { openTool } from './open'
import { nextPageTool, previousPageTool, twoPagesTool } from './pages'
import { sidePanelTool } from './side-panel'
import type { Tool } from './tool'
import { fullscreenTool, presentationTool, rotateTool, singlePageTool, themeTool } from './view'
import { fitHeightTool, fitPageTool, fitWidthTool, zoomInTool, zoomOutTool } from './zoom'

/**
 * Every tool, in toolbar order. The page buttons come early: a narrow screen keeps them as a pair.
 * The row's last buttons move into the menu when it is full, so the rarer tools come last.
 */
export const TOOLS: readonly Tool[] = [
  openTool,
  sidePanelTool,
  previousPageTool,
  nextPageTool,
  searchTool,
  annotateTool,
  recentTool,
  zoomOutTool,
  zoomInTool,
  fitWidthTool,
  fitHeightTool,
  fitPageTool,
  singlePageTool,
  twoPagesTool,
  rotateTool,
  presentationTool,
  fullscreenTool,
  themeTool,
  printTool,
  saveAsTool,
  editPagesTool,
  captureRegionTool,
  saveImagesTool,
  imagesToPdfTool,
  wordToPdfTool,
  shareTool,
  closeTabTool,
  // Past the close button: on a laptop's screen these are the first to go into the menu (☰).
  compressTool,
  protectTool,
  pdfToWordTool,
  ocrTool,
  goToPageTool,
  nextTabTool,
]
