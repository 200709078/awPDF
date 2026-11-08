import type { PDFDocument, PDFObject } from 'pdf-lib'

/**
 * A password on a PDF: AES-256 encryption as PDF 2.0 defines it (security handler revision 6,
 * ISO 32000-2 7.6.4.3), which every current reader opens and the older RC4 ways do not match in
 * strength. pdf.js and pdf-lib can read such files but neither writes them, so this does: pdf-lib
 * parses the objects, WebCrypto hashes and encrypts.
 *
 * Every string and stream of every object is encrypted with the file key (revision 6 has no key
 * per object): AES-256-CBC, a random IV in front, PKCS#5 padding. The cross-reference data and
 * the trailer's ID stay plain, as the standard asks. The owner password is the same as the
 * user's and every permission is granted: the password keeps the document closed; it does not
 * pretend to stop printing or copying, which readers only honour if they wish.
 */

type Bytes = Uint8Array<ArrayBuffer>

const ZERO_IV: Bytes = new Uint8Array(16)
/** Every permission (bits 3-12 set, the reserved ones as the standard asks). */
const ALL_PERMISSIONS = -4

function random(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length))
}

function joined(...parts: Uint8Array[]): Bytes {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The password as revision 6 takes it: SASLprep's normalisation (NFKC), UTF-8, at most 127 bytes. */
export function passwordBytes(password: string): Bytes {
  return new TextEncoder().encode(password.normalize('NFKC')).slice(0, 127)
}

async function digest(name: 'SHA-256' | 'SHA-384' | 'SHA-512', data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest(name, data))
}

/**
 * AES-CBC without padding, for data a whole number of blocks long. WebCrypto always pads; in CBC
 * the padding block comes last and changes nothing before it, so it is cut off. With a zero IV
 * and one block this is also AES-ECB.
 */
async function aesNoPadding(key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt'])
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, data)).slice(0, data.length)
}

/** Algorithm 2.B: the hash of revision 6, rounds of AES-128 and SHA-2 that make guessing slow. */
async function hash(password: Bytes, input: Bytes, userBytes: Bytes): Promise<Bytes> {
  let key = (await digest('SHA-256', input)).slice(0, 32)
  let round = 0
  let encrypted: Bytes = new Uint8Array([0])
  while (round < 64 || encrypted[encrypted.length - 1] > round - 32) {
    const block = joined(password, key, userBytes)
    const repeated = new Uint8Array(block.length * 64)
    for (let copy = 0; copy < 64; copy += 1) repeated.set(block, copy * block.length)
    encrypted = await aesNoPadding(key.slice(0, 16), key.slice(16, 32), repeated)
    let sum = 0
    for (let index = 0; index < 16; index += 1) sum += encrypted[index]
    key = await digest(sum % 3 === 0 ? 'SHA-256' : sum % 3 === 1 ? 'SHA-384' : 'SHA-512', encrypted)
    round += 1
  }
  return key.slice(0, 32)
}

/** The Encrypt dictionary's keys for a password and a file key (algorithms 8, 9 and 10). */
async function securityValues(password: Bytes, fileKey: Bytes) {
  const none = new Uint8Array(0)
  const [userCheckSalt, userKeySalt, ownerCheckSalt, ownerKeySalt] = [random(8), random(8), random(8), random(8)]
  const U = joined(await hash(password, joined(password, userCheckSalt), none), userCheckSalt, userKeySalt)
  const UE = await aesNoPadding(await hash(password, joined(password, userKeySalt), none), ZERO_IV, fileKey)
  const O = joined(await hash(password, joined(password, ownerCheckSalt, U), U), ownerCheckSalt, ownerKeySalt)
  const OE = await aesNoPadding(await hash(password, joined(password, ownerKeySalt, U), U), ZERO_IV, fileKey)
  const permissions = new Uint8Array(16)
  const view = new DataView(permissions.buffer)
  view.setInt32(0, ALL_PERMISSIONS, true)
  view.setUint32(4, 0xffffffff, true)
  permissions.set(new TextEncoder().encode('Tadb'), 8)
  permissions.set(random(4), 12)
  const Perms = await aesNoPadding(fileKey, ZERO_IV, permissions)
  return { O, U, OE, UE, Perms }
}

type PdfLib = typeof import('pdf-lib')

/**
 * A new file gets a new ID: pdf.js tells documents apart by it, and a copy with its original's
 * ID would be taken for the original (its tab would come up instead of the copy).
 */
export function giveNewId(lib: PdfLib, document: PDFDocument): void {
  const id = lib.PDFHexString.of(hex(random(16)))
  document.context.trailerInfo.ID = document.context.obj([id, id])
}

/**
 * The PDF with its last page dropped (the blank one joined to take a password off, see
 * `blankPdf`) and, with a password, encrypted; without one it is written plain.
 */
export async function protectPdf(bytes: Uint8Array, password: string | null, { dropLastPage = false } = {}): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const document = await lib.PDFDocument.load(bytes, { updateMetadata: false })
  if (dropLastPage) document.removePage(document.getPageCount() - 1)
  giveNewId(lib, document)
  if (password !== null) await encrypt(lib, document, passwordBytes(password))
  return document.save({ useObjectStreams: false, updateFieldAppearances: false })
}

async function encrypt(lib: PdfLib, document: PDFDocument, password: Bytes): Promise<void> {
  const { PDFArray, PDFDict, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString } = lib
  const { context } = document
  const fileKey = random(32)
  const key = await crypto.subtle.importKey('raw', fileKey, 'AES-CBC', false, ['encrypt'])
  const sealed = async (data: Uint8Array): Promise<Bytes> => {
    const iv = random(16)
    return joined(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data as Bytes)))
  }
  const visit = async (object: PDFObject): Promise<PDFObject> => {
    if (object instanceof PDFString || object instanceof PDFHexString) return PDFHexString.of(hex(await sealed(object.asBytes())))
    if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index += 1) object.set(index, await visit(object.get(index)))
      return object
    }
    if (object instanceof PDFDict) {
      for (const [name, value] of object.entries()) object.set(name, await visit(value))
      return object
    }
    return object
  }
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (object instanceof PDFStream) {
      // The dictionary's strings, then the data (still in its own filters, which apply inside).
      await visit(object.dict)
      context.assign(ref, PDFRawStream.of(object.dict, await sealed(object.getContents())))
    } else {
      context.assign(ref, await visit(object))
    }
  }
  const values = await securityValues(password, fileKey)
  const encryptDict = context.obj({
    Filter: 'Standard',
    V: 5,
    R: 6,
    Length: 256,
    CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } },
    StmF: 'StdCF',
    StrF: 'StdCF',
    P: ALL_PERMISSIONS,
    EncryptMetadata: true,
  })
  for (const [name, value] of Object.entries(values)) encryptDict.set(PDFName.of(name), PDFHexString.of(hex(value)))
  context.trailerInfo.Encrypt = context.register(encryptDict)
}
