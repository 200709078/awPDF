/** Boards report 20 touch points or more; a few report 10 on a large screen. `?tahta=1` forces it. */
export function isSmartBoard(): boolean {
  if (new URLSearchParams(window.location.search).get('tahta') === '1') return true
  const touchPoints = navigator.maxTouchPoints
  const { width, height } = window.screen
  return touchPoints >= 20 || (touchPoints >= 10 && Math.min(width, height) >= 900 && Math.max(width, height) >= 1800)
}
