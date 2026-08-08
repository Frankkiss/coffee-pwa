import 'fake-indexeddb/auto'

export async function deleteTestDatabase(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Test database delete failed'))
    request.onblocked = () => reject(new Error('Test database delete blocked'))
  })
}
