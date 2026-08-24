import Dexie from 'dexie'

// Local-first database. The scan queue lives here first and is always
// readable/editable even with zero connectivity. Items are pushed to
// Supabase on submit, and retried later if that push fails.
export const db = new Dexie('inventoryApp')

db.version(1).stores({
  // ++id = auto-increment local id
  queue: '++id, sku, direction, createdAt, synced',
  // simple offline cache of materials so a scan can resolve a name/sku
  // even without a live connection
  materialsCache: 'sku, name, currentQty, updatedAt',
})

export async function addToQueue({ sku, name, direction }) {
  return db.queue.add({
    sku,
    name: name || null,
    qty: '', // left blank on purpose — user fills it in, or leaves it
    direction, // 'in' | 'out'
    createdAt: new Date().toISOString(),
    synced: false,
  })
}

export async function updateQueueQty(id, qty) {
  return db.queue.update(id, { qty })
}

export async function removeFromQueue(id) {
  return db.queue.delete(id)
}

export async function clearSyncedItems(ids) {
  return db.queue.bulkDelete(ids)
}
