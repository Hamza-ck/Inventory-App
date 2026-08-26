/**
 * Advanced tokenized search utility for materials and transactions.
 * Supports multi-keyword fuzzy matching, field scoring, and normalized token matching.
 */

export function tokenize(str) {
  if (!str) return []
  return String(str)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Checks if all query tokens exist within the target fields, and returns a relevance score.
 * Returns score > 0 if matching, 0 if not matching.
 */
export function scoreMaterialMatch(material, queryTokens, rawQuery) {
  if (!queryTokens || queryTokens.length === 0) return 1

  const name = (material.name || '').toLowerCase()
  const model = (material.model || '').toLowerCase()
  const sku = (material.sku || '').toLowerCase()
  const unit = (material.unit || '').toLowerCase()

  const combined = `${name} ${model} ${sku} ${unit}`

  // Every token in query must exist in combined string
  const allTokensMatch = queryTokens.every((token) => combined.includes(token))
  if (!allTokensMatch) return 0

  let score = 10

  const cleanRaw = rawQuery.toLowerCase().trim()

  // Exact SKU match (highest priority)
  if (sku === cleanRaw) score += 200
  else if (sku.startsWith(cleanRaw)) score += 100
  else if (sku.includes(cleanRaw)) score += 50

  // Exact Model match
  if (model === cleanRaw) score += 150
  else if (model.startsWith(cleanRaw)) score += 80
  else if (model.includes(cleanRaw)) score += 40

  // Exact Name match
  if (name === cleanRaw) score += 120
  else if (name.startsWith(cleanRaw)) score += 60
  else if (name.includes(cleanRaw)) score += 30

  // Penalty if out of stock, bonus if in stock
  if (Number(material.current_qty) > 0) score += 5

  return score
}

/**
 * Filter and sort a list of materials with advanced multi-keyword search logic.
 */
export function advancedFilterMaterials(materials, rawQuery, options = {}) {
  if (!rawQuery || !rawQuery.trim()) {
    if (options.statusFilter === 'low') {
      return materials.filter(
        (m) => Number(m.current_qty) > 0 && Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
      )
    }
    if (options.statusFilter === 'out') {
      return materials.filter((m) => Number(m.current_qty) <= 0)
    }
    return materials
  }

  const queryTokens = tokenize(rawQuery)

  const scored = []
  for (const m of materials) {
    // Check status filter first if supplied
    if (options.statusFilter === 'low') {
      const isLow = Number(m.current_qty) > 0 && Number(m.current_qty) <= Number(m.reorder_threshold ?? 0)
      if (!isLow) continue
    } else if (options.statusFilter === 'out') {
      const isOut = Number(m.current_qty) <= 0
      if (!isOut) continue
    }

    const score = scoreMaterialMatch(m, queryTokens, rawQuery)
    if (score > 0) {
      scored.push({ item: m, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}
