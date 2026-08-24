import { supabase } from './supabaseClient'
import { db } from './db'

// Pushes every queued item with a quantity filled in to Supabase.
// Items with no quantity are left in the queue on purpose.
// Items that fail (e.g. offline) are also left in the queue and retried
// on the next call — nothing is lost.
export async function submitQueue(userId) {
  const items = await db.queue.toArray()
  const ready = items.filter((i) => i.qty !== '' && Number(i.qty) > 0)

  const results = { succeeded: 0, failed: 0, skipped: items.length - ready.length }

  for (const item of ready) {
    try {
      const { data: material, error: materialErr } = await supabase
        .from('materials')
        .select('id')
        .eq('sku', item.sku)
        .single()

      if (materialErr || !material) throw new Error('Unknown material SKU: ' + item.sku)

      const { error: txErr } = await supabase.from('transactions').insert({
        material_id: material.id,
        qty: Number(item.qty),
        direction: item.direction,
        user_id: userId,
      })

      if (txErr) throw txErr

      await db.queue.delete(item.id)
      results.succeeded += 1
    } catch (err) {
      console.warn('Sync failed for item, will retry later:', item.sku, err.message)
      results.failed += 1
    }
  }

  return results
}
