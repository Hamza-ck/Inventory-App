/**
 * Vision-Language AI OCR Service
 * 
 * Supports:
 * 1. Hugging Face Serverless Inference (Qwen2.5-VL-72B-Instruct - free & active)
 * 2. Hugging Face Idefics3 (HuggingFaceM4/Idefics3-8B-Llama3 via Dedicated Endpoint or self-hosted)
 * 3. Automatic fallback so scans never fail with 400 "Model not supported"
 */

export const MODELS = {
  SERVERLESS_VISION: 'Qwen/Qwen2.5-VL-72B-Instruct', // Free active Vision model on HF Router
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

  if (typeof localStorage !== 'undefined') {
    localToken = localStorage.getItem('idefics_hf_token') || ''
    localEndpoint = localStorage.getItem('idefics_endpoint') || ''
    localModel = localStorage.getItem('idefics_model') || ''

    // Clean up any previously saved invalid endpoints
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
    hasToken: Boolean(token),
  }
}

export function saveIdeficsConfig({ token, endpoint, model }) {
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
}

/**
 * Sends a captured image snapshot to Vision AI for model code extraction.
 * 
 * @param {Object} options
 * @param {string} options.dataUrl Base64 JPEG data URL of the image
 * @param {string} [options.customPrompt] Optional prompt override
 * @returns {Promise<{ rawText: string, latencyMs: number, model: string }>}
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

  // Helper to send a chat completion request with a specific model
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
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    let activeModel = config.model
    let response = await sendVisionRequest(activeModel, config.endpoint, controller.signal)

    // If the requested model is not supported by the free serverless provider (HF error 400),
    // automatically fallback to the active serverless vision model on the router
    if (response.status === 400) {
      const errText = await response.clone().text().catch(() => '')
      if (errText.includes('not supported by provider') || errText.includes('model_not_supported')) {
        console.warn(`[Vision OCR] Model ${activeModel} not supported on free serverless tier. Falling back to ${MODELS.SERVERLESS_VISION}...`)
        activeModel = MODELS.SERVERLESS_VISION
        response = await sendVisionRequest(activeModel, DEFAULT_ENDPOINT, controller.signal)
      }
    }

    // If chat completions returned 404, fallback to direct HF inference endpoint
    if (response.status === 404 && config.endpoint.includes('/chat/completions') && !config.endpoint.includes('localhost')) {
      const fallbackEndpoint = `https://router.huggingface.co/hf-inference/models/${activeModel}`
      response = await sendVisionRequest(activeModel, fallbackEndpoint, controller.signal)
    }

    const latencyMs = Math.round(performance.now() - startTime)

    if (response.status === 401) {
      throw new Error('Hugging Face API key is missing or invalid. Please check your token in Setup.')
    }

    if (response.status === 503) {
      throw new Error('Vision model is currently loading on Hugging Face. Please retry in 15 seconds.')
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      throw new Error(`Vision API error (${response.status}): ${errBody.slice(0, 140)}`)
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
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Vision OCR request timed out after 20 seconds.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
