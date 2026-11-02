import type { DocumentView } from '../app/document-view'

/** What a tool may use. Tools reach the document and the platform only through this. */
export interface ToolContext {
  readonly view: DocumentView
  pickFile(): void
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
  isActive?(view: DocumentView): boolean
  run(context: ToolContext): void
}
