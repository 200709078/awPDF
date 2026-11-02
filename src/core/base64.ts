const BINARY_STRING_BYTES = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_STRING_BYTES))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), letter => letter.charCodeAt(0))
}
