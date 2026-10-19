import { useLiveQuery } from 'dexie-react-hooks'
import { accDb } from './accountingDb'

/**
 * Live view of a table: re-renders automatically whenever ANY code (a voucher
 * save, an import, another tab) changes it. Returns `undefined` while loading.
 * Replaces the old load() + window 'accounting-data-updated' event plumbing.
 */
export function useTable(name) {
  return useLiveQuery(() => accDb[name].toArray(), [name])
}

const EMPTY = []
/** Same as useTable but returns a stable empty array while loading (safe in hook deps). */
export function useRows(name) {
  return useLiveQuery(() => accDb[name].toArray(), [name]) ?? EMPTY
}
export { EMPTY }
