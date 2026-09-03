/**
 * Advanced model recognition and batch text parsing utility for inventory.
 * Supports:
 * - Multi-line parsing (A6PRO-15, OP F33-13, REALME 14-32, REALME 16T-7)
 * - Brand alias normalization (OP -> OPPO, RM -> REALME, SAM -> SAMSUNG, etc.)
 * - Fuzzy and compact model matching against existing materials
 * - Unique SKU generation for newly discovered models
 */

export const BRAND_ALIASES = {
  OP: 'OPPO',
  OPP: 'OPPO',
  RM: 'REALME',
  RLM: 'REALME',
  REL: 'REALME',
  SAM: 'SAMSUNG',
  SMSG: 'SAMSUNG',
  IP: 'IPHONE',
  AP: 'APPLE',
  APP: 'APPLE',
  VV: 'VIVO',
  VI: 'VIVO',
  MI: 'REDMI',
  RDM: 'REDMI',
  XM: 'XIAOMI',
  MOTO: 'MOTOROLA',
  MOT: 'MOTOROLA',
  '1+': 'ONEPLUS',
  OPLUS: 'ONEPLUS',
  INF: 'INFINIX',
  TEC: 'TECNO',
  POCO: 'POCO',
  NOK: 'NOKIA',
  NOTH: 'NOTHING',
  PIX: 'PIXEL',
  GOOG: 'GOOGLE',
}

/**
 * Strips non-alphanumeric characters, converts to uppercase for compact matching.
 * e.g., "A6 PRO" -> "A6PRO", "OP-F33" -> "OPF33"
 */
export function toCompact(str) {
  if (!str) return ''
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Expand brand prefix if present (e.g., "OP F33" -> "OPPO F33", "Opp/Rel F31" -> "OPPO / REALME F31")
 */
export function expandBrandAliases(text) {
  if (!text) return ''
  const trimmed = text.trim()

  // Handle compound brands with slash, e.g. "Opp/Rel F31" -> "OPPO / REALME F31"
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    const firstPart = parts[0].trim()
    const rest = parts.slice(1).join('/')

    const upperFirst = firstPart.toUpperCase()
    const expandedFirst = BRAND_ALIASES[upperFirst] || firstPart

    const restTokens = rest.trim().split(/\s+/)
    if (restTokens.length > 0) {
      const restBrandUpper = restTokens[0].toUpperCase()
      if (BRAND_ALIASES[restBrandUpper]) {
        restTokens[0] = BRAND_ALIASES[restBrandUpper]
      }
      return `${expandedFirst} / ${restTokens.join(' ')}`
    }
    return `${expandedFirst} / ${rest}`
  }

  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 0) return trimmed

  const firstUpper = tokens[0].toUpperCase()
  if (BRAND_ALIASES[firstUpper]) {
    tokens[0] = BRAND_ALIASES[firstUpper]
    return tokens.join(' ')
  }

  // Only expand prefix if separated by digit, hyphen, underscore, colon, or space (e.g. OP33 or OP-F33)
  // NEVER slice mid-word (e.g. Opp must not be sliced into OP + p)
  for (const [alias, fullBrand] of Object.entries(BRAND_ALIASES)) {
    if (firstUpper.startsWith(alias) && firstUpper.length > alias.length) {
      const charAfter = firstUpper[alias.length]
      if (/\d|[-_:/]/.test(charAfter)) {
        const remainder = trimmed.slice(alias.length).replace(/^[-_:/]+/, ' ').trim()
        return `${fullBrand} ${remainder}`
      }
    }
  }

  return trimmed
}

/**
 * Calculates string similarity score (0 to 1) based on bigram / dice coefficient
 */
export function calculateSimilarity(str1, str2) {
  const s1 = toCompact(str1)
  const s2 = toCompact(str2)

  if (s1 === s2) return 1.0
  if (!s1 || !s2) return 0.0
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length)
    const maxLen = Math.max(s1.length, s2.length)
    return 0.85 + (minLen / maxLen) * 0.14
  }

  const getBigrams = (s) => {
    const bigrams = new Set()
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2))
    }
    return bigrams
  }

  const bg1 = getBigrams(s1)
  const bg2 = getBigrams(s2)

  let intersection = 0
  for (const b of bg1) {
    if (bg2.has(b)) intersection++
  }

  const total = bg1.size + bg2.size
  return total > 0 ? (2.0 * intersection) / total : 0
}

/**
 * Parses multi-line freeform user input into structured line objects.
 * Handles formats like:
 * A6PRO-15
 * OP F33-13
 * REALME 14-32
 * REALME 16T-7
 * Model : 10
 * Model x 10
 * Model 10 (separated by space or tab)
 */
export function parseBatchInput(rawText) {
  if (!rawText) return []

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const parsedItems = []

  lines.forEach((line, index) => {
    let modelQuery = ''
    let qty = 1
    let parsedSuccessfully = false

    // Pattern 1: Delimiter separated: "-", ":", "=", "*", "x", "|"
    // e.g. "A6PRO-15", "OP F33 - 13", "REALME 14: 32", "REALME 16T*7", "REALME 16T x 7"
    const delimiterMatch = line.match(/^(.*?)\s*[-:=*|xX]\s*(\d+(?:\.\d+)?)\s*$/)
    if (delimiterMatch) {
      modelQuery = delimiterMatch[1].trim()
      qty = Number(delimiterMatch[2]) || 1
      parsedSuccessfully = true
    } else {
      // Pattern 2: Whitespace / tab separated where last token is a number
      // e.g. "OP F33 13", "REALME 14 32", "A6PRO 15"
      const spaceMatch = line.match(/^(.*?)[\s\t]+(\d+(?:\.\d+)?)\s*$/)
      if (spaceMatch) {
        modelQuery = spaceMatch[1].trim()
        qty = Number(spaceMatch[2]) || 1
        parsedSuccessfully = true
      } else {
        // Fallback: entire line is model query with default qty 1
        modelQuery = line
        qty = 1
      }
    }

    if (modelQuery) {
      parsedItems.push({
        id: `batch-${index + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rawLine: line,
        lineNumber: index + 1,
        rawModel: modelQuery,
        expandedModel: expandBrandAliases(modelQuery),
        qty: Math.max(1, qty),
        parsedSuccessfully,
      })
    }
  })

  return parsedItems
}

/**
 * Matches a model query against the materials catalog, scoped or prioritized by target product/material.
 * Returns:
 * - bestMatch: material object or null
 * - confidence: 'exact' | 'high' | 'medium' | 'none'
 * - score: number
 * - suggestions: array of top matching materials with scores
 * - otherProductMatch: material found under a different product if not found in target product
 */
export function matchModelToMaterials(modelQuery, materials = [], targetProductName = '') {
  if (!modelQuery || !materials || materials.length === 0) {
    return { bestMatch: null, confidence: 'none', score: 0, suggestions: [], otherProductMatch: null }
  }

  const cleanQuery = modelQuery.trim().toLowerCase()
  const compactQuery = toCompact(modelQuery)
  const expandedQuery = expandBrandAliases(modelQuery).trim().toLowerCase()
  const compactExpanded = toCompact(expandedQuery)
  const targetProdClean = (targetProductName || '').trim().toLowerCase()

  function scoreSingle(m) {
    const mModel = (m.model || '').trim().toLowerCase()
    const mSku = (m.sku || '').trim().toLowerCase()
    const mName = (m.name || '').trim().toLowerCase()

    const mCompactModel = toCompact(m.model)
    const mCompactSku = toCompact(m.sku)
    const mCompactName = toCompact(m.name)

    let score = 0
    let matchType = ''

    // 1. Exact SKU match (Highest priority)
    if (mSku === cleanQuery || mSku === expandedQuery) {
      score = 300
      matchType = 'exact_sku'
    } else if (mCompactSku === compactQuery || mCompactSku === compactExpanded) {
      score = 280
      matchType = 'compact_sku'
    }
    // 2. Exact Model match
    else if (mModel === cleanQuery || mModel === expandedQuery) {
      score = 250
      matchType = 'exact_model'
    } else if (mCompactModel === compactQuery || mCompactModel === compactExpanded) {
      score = 230
      matchType = 'compact_model'
    }
    // 3. Exact Name match
    else if (mName === cleanQuery || mName === expandedQuery) {
      score = 200
      matchType = 'exact_name'
    } else if (mCompactName === compactQuery || mCompactName === compactExpanded) {
      score = 190
      matchType = 'compact_name'
    }
    // 4. Compact contains / boundary match
    else if (mCompactModel.length > 0 && compactExpanded.length > 0) {
      if (mCompactModel.includes(compactExpanded) || compactExpanded.includes(mCompactModel)) {
        score = 160
        matchType = 'substring_model'
      } else if (mCompactSku.includes(compactQuery) || compactQuery.includes(mCompactSku)) {
        score = 140
        matchType = 'substring_sku'
      } else {
        // 5. Fuzzy Bigram similarity check
        const simModel = calculateSimilarity(m.model, expandedQuery)
        const simName = calculateSimilarity(m.name, expandedQuery)
        const maxSim = Math.max(simModel, simName)

        if (maxSim >= 0.65) {
          score = Math.round(maxSim * 120)
          matchType = 'fuzzy'
        }
      }
    }

    return { score, matchType }
  }

  // If targetProductName is specified, look specifically in target product first
  let primaryCandidates = materials
  let isProductScoped = false
  if (targetProdClean) {
    const targetSubset = materials.filter(
      (m) => (m.name || '').trim().toLowerCase() === targetProdClean
    )
    if (targetSubset.length > 0) {
      primaryCandidates = targetSubset
      isProductScoped = true
    }
  }

  const scoredPrimary = []
  for (const m of primaryCandidates) {
    const { score, matchType } = scoreSingle(m)
    if (score > 0) {
      scoredPrimary.push({ material: m, score, matchType })
    }
  }
  scoredPrimary.sort((a, b) => b.score - a.score)

  let otherProductMatch = null
  // If no match was found in the target product, but it exists in another product
  if (scoredPrimary.length === 0 && isProductScoped) {
    const otherCandidates = materials.filter(
      (m) => (m.name || '').trim().toLowerCase() !== targetProdClean
    )
    const scoredOther = []
    for (const m of otherCandidates) {
      const { score, matchType } = scoreSingle(m)
      if (score >= 150) {
        scoredOther.push({ material: m, score, matchType })
      }
    }
    scoredOther.sort((a, b) => b.score - a.score)
    if (scoredOther.length > 0) {
      otherProductMatch = scoredOther[0].material
    }
  }

  if (scoredPrimary.length === 0) {
    return {
      bestMatch: null,
      confidence: 'none',
      score: 0,
      suggestions: [],
      otherProductMatch,
    }
  }

  const top = scoredPrimary[0]
  let confidence = 'none'

  if (top.score >= 230) {
    confidence = 'exact'
  } else if (top.score >= 150) {
    confidence = 'high'
  } else if (top.score >= 70) {
    confidence = 'medium'
  }

  return {
    bestMatch: top.material,
    confidence,
    score: top.score,
    suggestions: scoredPrimary.slice(0, 5).map((s) => s.material),
    otherProductMatch,
  }
}

/**
 * Detects the most common SKU prefix used for a given product name in existing materials.
 * e.g., for "2MM" -> "sil-2mm-", for "Clear maxsafe" -> "mag-clear_mag-"
 */
export function detectProductSkuPrefix(productName, existingMaterials = []) {
  if (!productName) return 'sku-'
  const cleanName = productName.trim().toLowerCase()

  // 1. Check existing materials with this product name
  const sameProductMaterials = existingMaterials.filter(
    (m) => (m.name || '').trim().toLowerCase() === cleanName
  )

  for (const m of sameProductMaterials) {
    if (m.sku) {
      const match = m.sku.match(/^(.*?)(\d+)$/)
      if (match) {
        return match[1] // e.g. "sil-2mm-" or "mag-clear_mag-"
      }
    }
  }

  // 2. Known default rules specified by user
  if (cleanName.includes('2mm')) return 'sil-2mm-'
  if (
    cleanName.includes('maxsafe') ||
    cleanName.includes('magsafe') ||
    (cleanName.includes('clear') && (cleanName.includes('mag') || cleanName.includes('safe')))
  ) {
    return 'mag-clear_mag-'
  }
  if (cleanName.includes('clear')) return 'clr-case-'
  if (cleanName.includes('privacy')) return 'prv-glass-'
  if (cleanName.includes('og')) return 'og-glass-'
  if (cleanName.includes('super d') || cleanName.includes('superd')) return 'spd-glass-'
  if (cleanName.includes('smoke')) return 'smk-case-'

  // 3. Fallback: clean slug from product name
  const slug = cleanName.replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `${slug}-` : 'sku-'
}

/**
 * Finds the next sequential SKU for a given prefix.
 * e.g. prefix "sil-2mm-", if "sil-2mm-0001" exists, returns "sil-2mm-0002".
 * If none exists, starts at "sil-2mm-0001".
 */
export function getNextSequentialSku(prefix, existingMaterials = [], usedInBatch = new Set(), minDigits = 4) {
  const cleanPrefix = (prefix || 'sku-').trim().toLowerCase()
  const normalizedPrefix = cleanPrefix.replace(/[-_]/g, '')
  let maxNum = 0
  let padLength = minDigits

  const allSkus = [
    ...existingMaterials.map((m) => (typeof m === 'string' ? m : m?.sku || '').trim().toLowerCase()),
    ...Array.from(usedInBatch).map((s) => (s || '').trim().toLowerCase()),
  ].filter(Boolean)

  for (const sku of allSkus) {
    const normalizedSku = sku.replace(/[-_]/g, '')
    // Matches if it starts with the clean prefix or normalized prefix (ignoring dash/underscore variations)
    if (sku.startsWith(cleanPrefix) || (normalizedPrefix && normalizedSku.startsWith(normalizedPrefix))) {
      // Extract trailing digits
      const numMatch = sku.match(/(\d+)$/)
      if (numMatch) {
        const num = parseInt(numMatch[1], 10)
        if (!isNaN(num) && num > maxNum) {
          maxNum = num
          padLength = Math.max(padLength, numMatch[1].length)
        }
      }
    }
  }

  let nextNum = maxNum + 1
  let nextCandidate = `${cleanPrefix}${String(nextNum).padStart(padLength, '0')}`

  while (allSkus.includes(nextCandidate.toLowerCase())) {
    nextNum++
    nextCandidate = `${cleanPrefix}${String(nextNum).padStart(padLength, '0')}`
  }

  return nextCandidate
}

/**
 * Generates an appropriate SKU for a model under a product.
 * Supports both sequential numbering (e.g. sil-2mm-0001, mag-clear_mag-0001)
 * or model slug format.
 */
export function generateSkuForModel(modelName, existingMaterials = [], productName = '', preferredPrefix = '') {
  const prefix = preferredPrefix || detectProductSkuPrefix(productName, existingMaterials)
  return getNextSequentialSku(prefix, existingMaterials)
}

/**
 * Checks if a given SKU code conflicts with any existing material in inventory
 * or another item in the current batch.
 * Guarantees that existing SKU codes are never overwritten.
 */
export function checkSkuConflict(sku, existingMaterials = [], batchItems = [], currentItemId = null) {
  if (!sku || !sku.trim()) {
    return { isConflict: false, conflictingMaterial: null, isDuplicateInBatch: false }
  }
  const cleanSku = sku.trim().toLowerCase()

  // 1. Check if SKU already exists in catalog
  const existing = existingMaterials.find((m) => (m.sku || '').trim().toLowerCase() === cleanSku)
  if (existing) {
    return {
      isConflict: true,
      conflictingMaterial: existing,
      isDuplicateInBatch: false,
    }
  }

  // 2. Check if another item in the current batch already claimed this SKU
  if (batchItems && batchItems.length > 0) {
    const dupItem = batchItems.find(
      (item) => item.id !== currentItemId && (item.newSku || '').trim().toLowerCase() === cleanSku
    )
    if (dupItem) {
      return {
        isConflict: true,
        conflictingMaterial: null,
        isDuplicateInBatch: true,
        conflictingLine: dupItem.rawLine || dupItem.rawModel,
      }
    }
  }

  return { isConflict: false, conflictingMaterial: null, isDuplicateInBatch: false }
}

