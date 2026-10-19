// Shared formatting / date / money helpers.
// NOTE: `new Date().toISOString().slice(0, 10)` returns the UTC date, which is
// the wrong day for ~5.5h every night in India (IST). Always use todayISO().

export function dateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayISO = () => dateISO(new Date())

export function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dateISO(d)
}

// Round to 2 decimals (avoids 0.1 + 0.2 style drift in running balances)
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// ₹12,34,567.50 (Indian digit grouping)
export const inr = (n) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
