import type { DocumentView } from './document-view'

/** Below this the change is too small for pdf.js, which rounds the scale; it adds up instead. */
const MIN_PINCH_CHANGE = 0.02
const WHEEL_ZOOM_SPEED = 0.003
const SWIPE_DISTANCE = 60
const WHEEL_FLIP_PAUSE_MS = 350
/** A page's margins leave a little to scroll even when it fits; that does not count as reading on. */
const PAGE_EDGE = 24

function fingerGap(touches: TouchList): number {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
}

/**
 * Touch and wheel on the document: two fingers or ctrl+wheel (a laptop's pinch) zoom around the
 * hand. In single page view, where nothing scrolls on to the next page, a swipe or the wheel at
 * the page's edge turns it.
 */
export function bindGestures(container: HTMLElement, view: DocumentView): void {
  let pinchGap = 0
  let swipeStart: { x: number; y: number } | null = null
  let lastFlip = 0
  // A finger that draws or highlights does not turn the page.
  const drawing = () => view.editorMode === 'ink' || view.editorMode === 'highlight'

  container.addEventListener('touchstart', event => {
    if (event.touches.length === 2) {
      pinchGap = fingerGap(event.touches)
      swipeStart = null
    } else if (event.touches.length === 1 && !drawing()) {
      swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
  }, { passive: true })

  const scrollsSideways = () => container.scrollWidth > container.clientWidth

  container.addEventListener('touchmove', event => {
    if (event.touches.length === 1 && swipeStart && event.cancelable && !scrollsSideways()) {
      // With nothing to scroll, a browser takes a sideways swipe as "go back" and leaves the app.
      const { clientX, clientY } = event.touches[0]
      if (Math.abs(clientX - swipeStart.x) > Math.abs(clientY - swipeStart.y)) event.preventDefault()
    }
    if (event.touches.length !== 2 || pinchGap === 0) return
    event.preventDefault()
    const gap = fingerGap(event.touches)
    const factor = gap / pinchGap
    if (Math.abs(factor - 1) < MIN_PINCH_CHANGE) return
    pinchGap = gap
    const [first, second] = [event.touches[0], event.touches[1]]
    view.zoomAt(factor, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2)
  }, { passive: false })

  container.addEventListener('touchend', event => {
    if (event.touches.length < 2) pinchGap = 0
    const end = event.changedTouches[0]
    if (!swipeStart || !view.singlePage || event.touches.length > 0) return
    const distance = end.clientX - swipeStart.x
    const isHorizontal = Math.abs(distance) > Math.abs(end.clientY - swipeStart.y) * 1.5
    swipeStart = null
    if (!isHorizontal || scrollsSideways() || Math.abs(distance) < SWIPE_DISTANCE) return
    if (distance < 0) view.nextPage()
    else view.previousPage()
  })

  container.addEventListener('wheel', event => {
    if (event.ctrlKey) {
      event.preventDefault()
      view.zoomAt(Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED), event.clientX, event.clientY)
      return
    }
    if (!view.singlePage || event.timeStamp - lastFlip < WHEEL_FLIP_PAUSE_MS) return
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - PAGE_EDGE
    if (event.deltaY > 0 && atBottom && view.hasNextPage) view.nextPage()
    else if (event.deltaY < 0 && container.scrollTop <= PAGE_EDGE && view.hasPreviousPage) view.previousPage()
    else return
    lastFlip = event.timeStamp
  }, { passive: false })
}
