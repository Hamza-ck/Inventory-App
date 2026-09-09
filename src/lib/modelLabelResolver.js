function getLocalCache(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setLocalCache(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local storage is an optimization only; scanning must still work online.
  }
}

export function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Standard edit distance (single-row DP, O(n) memory).
 */
export function levenshtein(a, b) {
  a = String(a || '')
  b = String(b || '')
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

// Short codes only tolerate 1 confused character; longer strings a couple more.
// A single-character OCR slip (G/E, 6/A, 4/7, O/0, S/5) is the overwhelmingly
// common failure mode on a short sticker code, which is exactly what this covers.
function maxEditDistance(len) {
  if (len <= 4) return 1
  if (len <= 8) return 2
  return 3
}

/**
 * Find the closest known label to `candidate` among `knownKeys` (already-normalized
 * strings). Returns { key, distance } or null if nothing is close enough, or if two
 * different known labels are equally close (too risky to silently pick one).
 */
export function fuzzyFindClosest(candidate, knownKeys) {
  const target = normalizeLabel(candidate)
  if (!target || !knownKeys?.length) return null

  let best = null
  let bestDist = Infinity
  let ambiguous = false

  for (const key of knownKeys) {
    if (!key || key === target) continue // exact matches are handled elsewhere, before this runs
    const dist = levenshtein(target, key)
    if (dist < bestDist) {
      bestDist = dist
      best = key
      ambiguous = false
    } else if (dist === bestDist && key !== best) {
      ambiguous = true
    }
  }

  if (!best) return null
  if (bestDist > maxEditDistance(target.length)) return null
  if (ambiguous) return null

  return { key: best, distance: bestDist }
}

/**
 * Resolve a scanned supplier label to its canonical model and optional direct material.
 * Returns { rawLabel, labelCode, canonicalModel, materialId, materialSku } or null.
 */
export async function resolveSupplierModelLabel(supabase, rawLabel) {
  const normalized = normalizeLabel(rawLabel)
  if (!normalized) return null

  try {
    const { data, error } = await supabase
      .from('supplier_model_labels')
      .select('label_code, canonical_model, material_id')
      .eq('normalized_label', normalized)
      .maybeSingle()

    if (!error && data?.canonical_model) {
      // If we have a material_id, fetch the material's SKU so we can queue it directly
      let materialSku = null
      if (data.material_id) {
        const { data: matData } = await supabase
          .from('materials')
          .select('sku')
          .eq('id', data.material_id)
          .maybeSingle()
        materialSku = matData?.sku || null
      }

      const result = {
        rawLabel,
        labelCode: data.label_code,
        canonicalModel: data.canonical_model,
        materialId: data.material_id || null,
        materialSku,
      }
      setLocalCache(`supplier-model-label:${normalized}`, result)
      return result
    }
  } catch {
    // Fall through to the local cache for offline use.
  }

  return getLocalCache(`supplier-model-label:${normalized}`)
}

export async function resolveModelAlias(supabase, value) {
  const normalized = normalizeLabel(value)
  if (!normalized) return null

  try {
    const { data, error } = await supabase
      .from('model_aliases')
      .select('alias, canonical_model')
      .eq('normalized_alias', normalized)
      .maybeSingle()

    if (!error && data?.canonical_model) {
      const result = {
        alias: data.alias,
        canonicalModel: data.canonical_model,
      }
      setLocalCache(`model-alias:${normalized}`, result)
      return result
    }
  } catch {
    // Fall through to the local cache for offline use.
  }

  return getLocalCache(`model-alias:${normalized}`)
}

/**
 * Save or upsert a supplier label mapping.
 * @param {object} supabase - Supabase client
 * @param {string} labelCode - The raw label text scanned from the product
 * @param {string} canonicalModel - The canonical phone model (e.g. "VIVO V22")
 * @param {string|null} materialId - Optional material UUID for direct resolution
 */
export async function saveSupplierModelLabel(supabase, labelCode, canonicalModel, materialId = null) {
  const label = String(labelCode || '').trim()
  const model = String(canonicalModel || '').trim()
  if (!label || !model) return { data: null, error: new Error('Label and model are required') }

  const row = {
    label_code: label,
    canonical_model: model,
    updated_at: new Date().toISOString(),
  }
  if (materialId) row.material_id = materialId

  const result = await supabase
    .from('supplier_model_labels')
    .upsert(row, { onConflict: 'normalized_label' })
    .select('label_code, canonical_model, material_id')
    .single()

  if (!result.error && result.data?.canonical_model) {
    const normalized = normalizeLabel(label)
    setLocalCache(`supplier-model-label:${normalized}`, {
      rawLabel: label,
      labelCode: result.data.label_code,
      canonicalModel: result.data.canonical_model,
      materialId: result.data.material_id || null,
      materialSku: null, // Will be resolved fresh on next scan
    })
  }

  return result
}

/**
 * Link an existing supplier label mapping to a specific material.
 * Called when the user picks a material from the picker and wants to "remember" it.
 */
export async function updateSupplierModelLabelMaterial(supabase, labelCode, materialId) {
  const label = String(labelCode || '').trim()
  if (!label || !materialId) return { data: null, error: new Error('Label and material are required') }

  const normalized = normalizeLabel(label)

  const result = await supabase
    .from('supplier_model_labels')
    .update({
      material_id: materialId,
      updated_at: new Date().toISOString(),
    })
    .eq('normalized_label', normalized)
    .select('label_code, canonical_model, material_id')
    .single()

  if (!result.error && result.data) {
    setLocalCache(`supplier-model-label:${normalized}`, {
      rawLabel: label,
      labelCode: result.data.label_code,
      canonicalModel: result.data.canonical_model,
      materialId: result.data.material_id || null,
      materialSku: null,
    })
  }

  return result
}

export async function saveModelAlias(supabase, alias, canonicalModel) {
  const rawAlias = String(alias || '').trim()
  const model = String(canonicalModel || '').trim()
  if (!rawAlias || !model) return { data: null, error: new Error('Alias and model are required') }

  const result = await supabase
    .from('model_aliases')
    .upsert(
      { alias: rawAlias, canonical_model: model },
      { onConflict: 'normalized_alias' }
    )
    .select('alias, canonical_model')
    .single()

  if (!result.error && result.data?.canonical_model) {
    const normalized = normalizeLabel(rawAlias)
    setLocalCache(`model-alias:${normalized}`, {
      alias: result.data.alias,
      canonicalModel: result.data.canonical_model,
    })
  }

  return result
}

export function filterMaterialsByCanonicalModel(materials, canonicalModel) {
  const target = normalizeLabel(canonicalModel)
  return target
    ? (materials || []).filter((material) => normalizeLabel(material.model) === target)
    : []
}

/**
 * Fetch all supplier label mappings (with joined material name) for the management page.
 */
export async function getAllSupplierModelLabels(supabase) {
  const { data, error } = await supabase
    .from('supplier_model_labels')
    .select('id, label_code, canonical_model, material_id, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) return { data: [], error }

  // Enrich with material info if material_id is set
  const materialIds = (data || []).filter((d) => d.material_id).map((d) => d.material_id)
  let materialsMap = {}

  if (materialIds.length > 0) {
    const { data: matData } = await supabase
      .from('materials')
      .select('id, sku, name, model')
      .in('id', materialIds)
    if (matData) {
      materialsMap = Object.fromEntries(matData.map((m) => [m.id, m]))
    }
  }

  const enriched = (data || []).map((row) => ({
    ...row,
    material: row.material_id ? materialsMap[row.material_id] || null : null,
  }))

  return { data: enriched, error: null }
}

/**
 * Delete a supplier label mapping by its ID.
 */
export async function deleteSupplierModelLabel(supabase, id) {
  return supabase.from('supplier_model_labels').delete().eq('id', id)
}
