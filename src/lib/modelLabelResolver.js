export function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export async function resolveSupplierModelLabel(supabase, rawLabel) {
  const normalized = normalizeLabel(rawLabel)
  if (!normalized) return null
  const { data, error } = await supabase.from('supplier_model_labels').select('label_code, canonical_model').eq('normalized_label', normalized).maybeSingle()
  if (error || !data?.canonical_model) return null
  return { rawLabel, labelCode: data.label_code, canonicalModel: data.canonical_model }
}

export async function resolveModelAlias(supabase, value) {
  const normalized = normalizeLabel(value)
  if (!normalized) return null
  const { data, error } = await supabase.from('model_aliases').select('alias, canonical_model').eq('normalized_alias', normalized).maybeSingle()
  if (error || !data?.canonical_model) return null
  return { alias: data.alias, canonicalModel: data.canonical_model }
}

export async function saveSupplierModelLabel(supabase, labelCode, canonicalModel) {
  const label = String(labelCode || '').trim()
  const model = String(canonicalModel || '').trim()
  if (!label || !model) return { data: null, error: new Error('Label and model are required') }
  return supabase.from('supplier_model_labels').upsert({ label_code: label, canonical_model: model, updated_at: new Date().toISOString() }, { onConflict: 'normalized_label' }).select('label_code, canonical_model').single()
}

export async function saveModelAlias(supabase, alias, canonicalModel) {
  const rawAlias = String(alias || '').trim()
  const model = String(canonicalModel || '').trim()
  if (!rawAlias || !model) return { data: null, error: new Error('Alias and model are required') }
  return supabase.from('model_aliases').upsert({ alias: rawAlias, canonical_model: model }, { onConflict: 'normalized_alias' }).select('alias, canonical_model').single()
}

export function filterMaterialsByCanonicalModel(materials, canonicalModel) {
  const target = normalizeLabel(canonicalModel)
  return target ? (materials || []).filter((material) => normalizeLabel(material.model) === target) : []
}
