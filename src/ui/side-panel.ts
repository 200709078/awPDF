/** Keep in step with the media query in `styles/app.css`. */
const NARROW_LAYOUT_QUERY = '(max-width: 700px)'

/**
 * The panel beside the document. On narrow screens it lies over the document as a drawer, so
 * that the page keeps its size; a choice there closes it. It starts closed.
 */
export class SidePanel {
  private readonly listeners = new Set<() => void>()

  constructor(private readonly element: HTMLElement) {}

  get isOpen(): boolean {
    return !this.element.hidden
  }

  /** Runs when the panel opens or closes. */
  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  toggle(): void {
    this.element.hidden = this.isOpen
    for (const listener of this.listeners) listener()
  }

  closeIfOverlay(): void {
    if (this.isOpen && window.matchMedia(NARROW_LAYOUT_QUERY).matches) this.toggle()
  }
}
