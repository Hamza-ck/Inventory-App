/**
 * Vision-Language AI OCR Service with On-Device Unlimited Failover
 * 
 * Capabilities:
 * 1. Hugging Face Serverless Vision AI (Qwen2.5-VL-72B-Instruct)
 * 2. Hugging Face Idefics3 (Dedicated endpoint / self-hosted vLLM/Ollama)
 * 3. Automatic failover to Unlimited In-Browser On-Device OCR when cloud credits are exhausted
 */

import { recognizeOnDevice } from './onDeviceOcr'

export const MODELS = {
  SERVERLESS_VISION: 'Qwen/Qwen2.5-VL-72B-Instruct', // Active serverless model on HF Router
  IDEFICS3: 'HuggingFaceM4/Idefics3-8B-Llama3',      // Dedicated endpoint / self-hosted
}

export const DEFAULT_MODEL = MODELS.SERVERLESS_VISION
export const DEFAULT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions'

export function getIdeficsConfig() {
  const envToken = import.meta.env.VITE_HUGGINGFACE_API_KEY || import.meta.env.VITE_HF_TOKEN || ''
  const envEndpoint = import.meta.env.VITE_IDEFICS_ENDPOINT || ''
  const envModel = import.meta.env.VITE_VISION_MODEL || ''

  let localToken = ''
  let localEndpoint = ''
  let localModel = ''
  let localEngine = 'auto' // 'auto' | 'ondevice' | 'cloud'
  let isQuotaExhausted = false

  if (typeof localStorage !== 'undefined') {
    localToken = localStorage.getItem('idefics_hf_token') || ''
    localEndpoint = localStorage.getItem('idefics_endpoint') || ''
    localModel = localStorage.getItem('idefics_model') || ''
    localEngine = localStorage.getItem('idefics_preferred_engine') || 'auto'
    isQuotaExhausted = localStorage.getItem('idefics_quota_exhausted') === 'true'

    // Clean up any historical malformed endpoints
    if (localEndpoint.includes('/models/') && localEndpoint.includes('/chat/completions')) {
      localEndpoint = ''
      localStorage.removeItem('idefics_endpoint')
    }
  }

  const token = localToken || envToken || ''
  const endpoint = localEndpoint || envEndpoint || DEFAULT_ENDPOINT
  const model = localModel || envModel || DEFAULT_MODEL

  return {
    token,
    endpoint,
    model,
    engine: localEngine,
    isQuotaExhausted,
    hasToken: Boolean(token),
  }
}

export function saveIdeficsConfig({ token, endpoint, model, engine }) {
  if (typeof localStorage === 'undefined') return
  if (token !== undefined) {
    if (token.trim()) {
      localStorage.setItem('idefics_hf_token', token.trim())
    } else {
      localStorage.removeItem('idefics_hf_token')
    }
  }
  if (endpoint !== undefined) {
    if (endpoint.trim()) {
      localStorage.setItem('idefics_endpoint', endpoint.trim())
    } else {
      localStorage.removeItem('idefics_endpoint')
    }
  }
  if (model !== undefined) {
    if (model.trim()) {
      localStorage.setItem('idefics_model', model.trim())
    } else {
      localStorage.removeItem('idefics_model')
    }
  }
  if (engine !== undefined) {
    localStorage.setItem('idefics_preferred_engine', engine)
  }
}

export function clearQuotaExhausted() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('idefics_quota_exhausted')
  }
}

/**
 * Checks if an error message represents a Hugging Face quota / credit exhaustion.
 */
function isCreditExhaustedError(status, message = '') {
  if (status === 402 || status === 429) return true
  const lower = String(message).toLowerCase()
  return (
    lower.includes('credit') ||
    lower.includes('budget') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('exceeded') ||
    lower.includes('exhausted')
  )
}

/**
 * Calls Hugging Face Vision AI endpoint.
 */
export async function recognizeWithIdefics3({ dataUrl, customPrompt = '' }) {
  const config = getIdeficsConfig()
  const startTime = performance.now()

  const systemInstruction = 
    customPrompt ||
    'Extract only the product model number, SKU code, or primary label text from this image. ' +
    'Reply ONLY with the extracted code or model name (e.g. G64, V22, F31, A6PRO, NOTE10). ' +
    'Do not include introductory words, formatting, quotes, or markdown.'

  const headers = {
    'Content-Type': 'application/json',
  }

  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token.trim()}`
  }

  async function sendVisionRequest(targetModel, targetEndpoint, signal) {
    const isChat = targetEndpoint.includes('/chat/completions')
    const payload = isChat
      ? {
          model: targetModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: systemInstruction },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 30,
          temperature: 0.1,
        }
      : {
          inputs: dataUrl,
          parameters: {
            prompt: systemInstruction,
            max_new_tokens: 30,
          },
        }

    return fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    let activeModel = config.model
    let response = await sendVisionRequest(activeModel, config.endpoint, controller.signal)

    // Fallback if 400 "Model not supported by provider"
    if (response.status === 400) {
      const errText = await response.clone().text().catch(() => '')
      if (errText.includes('not supported by provider') || errText.includes('model_not_supported')) {
        activeModel = MODELS.SERVERLESS_VISION
        response = await sendVisionRequest(activeModel, DEFAULT_ENDPOINT, controller.signal)
      }
    }

    // Fallback if 404 router endpoint
    if (response.status === 404 && config.endpoint.includes('/chat/completions') && !config.endpoint.includes('localhost')) {
      const fallbackEndpoint = `https://router.huggingface.co/hf-inference/models/${activeModel}`
      response = await sendVisionRequest(activeModel, fallbackEndpoint, controller.signal)
    }

    const latencyMs = Math.round(performance.now() - startTime)

    if (response.status === 401) {
      throw new Error('Hugging Face API key is missing or invalid. Please check your token in Setup.')
    }

    if (isCreditExhaustedError(response.status)) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('idefics_quota_exhausted', 'true')
      }
      throw new Error('Hugging Face monthly credit exhausted. Auto-switched to On-Device OCR.')
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      if (isCreditExhaustedError(response.status, errBody)) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('idefics_quota_exhausted', 'true')
        }
        throw new Error('Hugging Face monthly credit exhausted. Auto-switched to On-Device OCR.')
      }
      throw new Error(`Vision API error (${response.status}): ${errBody.slice(0, 120)}`)
    }

    const data = await response.json()

    let extractedText = ''
    if (data.choices && data.choices.length > 0) {
      extractedText = data.choices[0]?.message?.content || ''
    } else if (Array.isArray(data) && data[0]?.generated_text) {
      extractedText = data[0].generated_text
    } else if (data.generated_text) {
      extractedText = data.generated_text
    } else if (typeof data === 'string') {
      extractedText = data
    } else {
      extractedText = JSON.stringify(data)
    }

    return {
      rawText: extractedText.trim(),
      latencyMs,
      model: activeModel,
      isCloud: true,
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Vision OCR request timed out after 15 seconds.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * High-level OCR executor:
 * - If engine is 'ondevice' or cloud quota is exhausted: runs instantly on-device (0 latency, 0 credits).
 * - Otherwise tries Vision AI; if cloud credits are exhausted, automatically fails over to On-Device OCR.
 */
export async function recognizeLabel({ dataUrl, forceCloud = false, onProgress }) {
  const config = getIdeficsConfig()

  // 1. If user explicitly wants on-device, or quota is already known to be exhausted (and not forcing cloud test)
  if (config.engine === 'ondevice' || (config.isQuotaExhausted && !forceCloud)) {
    const onDeviceRes = await recognizeOnDevice({ dataUrl, onProgress })
    return {
      ...onDeviceRes,
      quotaExhausted: config.isQuotaExhausted,
    }
  }

  // 2. Attempt Cloud Vision AI if configured
  if (config.hasToken) {
    try {
      return await recognizeWithIdefics3({ dataUrl })
    } catch (err) {
      if (isCreditExhaustedError(null, err.message)) {
        console.warn('[Vision AI] Monthly credit exhausted. Failing over to On-Device OCR.')
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('idefics_quota_exhausted', 'true')
        }
        const onDeviceRes = await recognizeOnDevice({ dataUrl, onProgress })
        return {
          ...onDeviceRes,
          quotaExhausted: true,
        }
      }
      throw err
    }
  }

  // 3. If no token is configured, run on-device
  return recognizeOnDevice({ dataUrl, onProgress })
}
