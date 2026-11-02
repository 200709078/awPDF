const DATABASE = 'awPDF'
const STORE = 'files'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function inStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const connection = await database()
  return new Promise((resolve, reject) => {
    const request = work(connection.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).finally(() => connection.close()) as Promise<T>
}

/** A browser can keep a file handle, and nothing else that leads back to a file. */
export async function keepHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  await inStore('readwrite', store => store.put(handle, key))
}

export function findHandle(key: string): Promise<FileSystemFileHandle | undefined> {
  return inStore('readonly', store => store.get(key) as IDBRequest<FileSystemFileHandle | undefined>)
}
