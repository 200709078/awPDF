/** Above this size the user is warned and may still open the file; nothing is ever refused. */
export const LARGE_FILE_WARNING_BYTES = 200 * 1024 * 1024

export function needsLargeFileWarning(size: number): boolean {
  return size > LARGE_FILE_WARNING_BYTES
}

export function formatMegabytes(size: number): string {
  return `${Math.round(size / (1024 * 1024)).toLocaleString('tr-TR')} MB`
}
