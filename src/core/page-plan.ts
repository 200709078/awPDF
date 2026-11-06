/** One page of the document being put together: which file it comes from and how it is turned. */
export interface PlannedPage {
  /** Stays with the page wherever it moves; selections are kept by it. */
  readonly key: number
  /** 0 is the open document, the others are added files in the order they came. */
  readonly source: number
  /** 0-based within its source. */
  readonly index: number
  /** Quarter turns added to the page's own rotation, in degrees: 0, 90, 180 or 270. */
  readonly rotation: number
}

/**
 * The pages of a new document, built from the open one: removed, turned, moved and joined with
 * pages of other files. Nothing touches a file until the plan is saved.
 */
export class PagePlan {
  private items: PlannedPage[]
  private lastKey = 0
  private readonly initial: string

  constructor(pageCount: number) {
    this.items = Array.from({ length: pageCount }, (_, index) => this.page(0, index))
    this.initial = this.signature
  }

  get pages(): readonly PlannedPage[] {
    return this.items
  }

  /** Whether saving would give something other than the open document. */
  get isChanged(): boolean {
    return this.signature !== this.initial
  }

  /** Adds every page of a newly added file at the end. */
  append(source: number, pageCount: number): void {
    this.items = [...this.items, ...Array.from({ length: pageCount }, (_, index) => this.page(source, index))]
  }

  /** Turns the chosen pages by a quarter: 1 clockwise, -1 the other way. */
  rotate(keys: ReadonlySet<number>, quarterTurns: 1 | -1): void {
    this.items = this.items.map(page => (keys.has(page.key)
      ? { ...page, rotation: (page.rotation + quarterTurns * 90 + 360) % 360 }
      : page))
  }

  remove(keys: ReadonlySet<number>): void {
    this.items = this.items.filter(page => !keys.has(page.key))
  }

  /**
   * Moves the chosen pages, keeping their order, so that they stand just before the page now at
   * `position`; the length of the list puts them at the end.
   */
  moveTo(keys: ReadonlySet<number>, position: number): void {
    const moving = this.items.filter(page => keys.has(page.key))
    const before = this.items.slice(0, position).filter(page => !keys.has(page.key)).length
    const staying = this.items.filter(page => !keys.has(page.key))
    this.items = [...staying.slice(0, before), ...moving, ...staying.slice(before)]
  }

  /** Moves the chosen pages one place towards the start (-1) or the end (1), as a block. */
  step(keys: ReadonlySet<number>, direction: -1 | 1): void {
    const positions = this.items.flatMap((page, position) => (keys.has(page.key) ? [position] : []))
    if (positions.length === 0) return
    if (direction < 0) this.moveTo(keys, Math.max(positions[0] - 1, 0))
    else this.moveTo(keys, Math.min(positions.at(-1)! + 2, this.items.length))
  }

  private page(source: number, index: number): PlannedPage {
    this.lastKey += 1
    return { key: this.lastKey, source, index, rotation: 0 }
  }

  private get signature(): string {
    return this.items.map(({ source, index, rotation }) => `${source}:${index}:${rotation}`).join(' ')
  }
}
