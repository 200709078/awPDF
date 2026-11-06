const RANGE = /^(\d*)\s*[-–]\s*(\d*)$/

/**
 * The pages a reader typed, such as "1-3, 5, 8-". Numbers count from 1; an open end runs to the
 * first or the last page and a range may be written backwards. The answer is in document order,
 * each page once; null when a part cannot be read or falls outside the document.
 */
export function parsePageRange(text: string, pageCount: number): number[] | null {
  const parts = text.split(/[,;]/).map(part => part.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const pages = new Set<number>()
  for (const part of parts) {
    const range = RANGE.exec(part)
    if (!range && !/^\d+$/.test(part)) return null
    const first = range ? (range[1] ? Number(range[1]) : 1) : Number(part)
    const last = range ? (range[2] ? Number(range[2]) : pageCount) : first
    const [low, high] = first <= last ? [first, last] : [last, first]
    if (low < 1 || high > pageCount) return null
    for (let page = low; page <= high; page += 1) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}
