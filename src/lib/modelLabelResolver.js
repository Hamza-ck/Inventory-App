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

export async function resolveSupplierModelLabel(supabase, rawLabel) {
  const normalized = normalizeLabel(rawLabel)
  if (!normalized) return null

  try {
    const { data, error } = await supabase
      .from('supplier_model_labels')
      .select('label_code, canonical_model')
      .eq('normalized_label', normalized)
      .maybeSingle()

    if (!error && data?.canonical_model) {
      const result = {
        rawLabel,
        labelCode: data.label_code,
        canonicalModel: data.canonical_model,
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

export async function saveSupplierModelLabel(supabase, labelCode, canonicalModel) {
  const label = String(labelCode || '').trim()
  const model = String(canonicalModel || '').trim()
  if (!label || !model) return { data: null, error: new Error('Label and model are required') }

  const result = await supabase
    .from('supplier_model_labels')
    .upsert(
      { label_code: label, canonical_model: model, updated_at: new Date().toISOString() },
      { onConflict: 'normalized_label' }
    )
    .select('label_code, canonical_model')
    .single()

  if (!result.error && result.data?.canonical_model) {
    const normalized = normalizeLabel(label)
    setLocalCache(`supplier-model-label:${normalized}`, {
      rawLabel: label,
      labelCode: result.data.label_code,
      canonicalModel: result.data.canonical_model,
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
