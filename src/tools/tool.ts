import type { DocumentTabs } from '../app/document-tabs'
import type { DocumentView } from '../app/document-view'
import type { Presentation } from '../app/presentation'
import type { RegionCapture } from '../ui/region-capture'
import type { Platform } from '../platform/platform'
import type { AnnotateBar } from '../ui/annotate-bar'
import type { SearchBar } from '../ui/search-bar'
import type { SidePanel } from '../ui/side-panel'
import type { Theme } from '../ui/theme'

/** What a tool may use. Tools reach the document and the platform only through this. */
export interface ToolContext {
  readonly view: DocumentView
  readonly tabs: DocumentTabs
  readonly presentation: Presentation
  readonly sidePanel: SidePanel
  readonly searchBar: SearchBar
  readonly annotateBar: AnnotateBar
  readonly theme: Theme
  readonly platform: Platform
  readonly regionCapture: RegionCapture
  pickFile(): void
  showRecentFiles(): void
  print(): void
  /** Saves the active document under a new name, with its filled-in form fields. */
  saveAs(): void
  editPages(): void
  /** Asks for pictures and makes a PDF of them in the page editor. */
  pdfFromImages(): void
  /** Asks for a Word document and makes a PDF of it. */
  pdfFromWord(): void
  /** Saves pages of the active document as pictures. */
  saveImages(): void
  /** Saves a smaller copy of the active document. */
  compress(): void
  /** Saves a copy with a password, another password or none. */
  protect(): void
  /** Saves the active document as a Word document. */
  pdfToWord(): void
}

/**
 * One feature of the app. A new tool lives in its own file here and is added to `tools/index.ts`;
 * the toolbar and the shortcuts are built from that list, so the core stays untouched.
 */
export interface Tool {
  /** Unique; the toolbar button's element ID is `tool-<id>`. */
  readonly id: string
  readonly label: string
  /** The inside of a 24×24 stroked SVG. */
  readonly icon: string
  /** Such as `ctrl+o`; see `ui/toolbar.ts` `shortcutOf`. */
  readonly shortcuts?: readonly string[]
  /** Disabled while no document is open. */
  readonly needsDocument?: boolean
  /** Disabled while this is false, such as on the first page; read whenever the view changes. */
  isAvailable?(view: DocumentView): boolean
  /** Makes the button an on/off switch; it shows as pressed while this is true. */
  isActive?(context: ToolContext): boolean
  /** Left out altogether where the platform cannot do it. */
  isSupported?(context: ToolContext): boolean
  /** False when something else reaches the tool; its shortcuts still work. */
  readonly inToolbar?: boolean
  run(context: ToolContext): void
}
