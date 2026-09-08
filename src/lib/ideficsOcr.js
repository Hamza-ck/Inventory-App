/**
 * Idefics3 Vision-Language OCR Service
 * 
 * Powered by HuggingFaceM4/Idefics3-8B-Llama3.
 * Supports:
 * 1. Hugging Face Serverless Inference API (OpenAI-compatible Vision Chat Completions)
 * 2. Custom or self-hosted Idefics3 endpoints (vLLM, Ollama, TGI, or Gradio proxy)
 * 3. Configuration via environment variables or localStorage
 */

const DEFAULT_MODEL = 'HuggingFaceM4/Idefics3-8B-Llama3'
const DEFAULT_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${DEFAULT_MODEL}/v1/chat/completions`

export function getIdeficsConfig() {
  const envToken = import.meta.env.VITE_HUGGINGFACE_API_KEY || import.meta.env.VITE_HF_TOKEN || ''
  const envEndpoint = import.meta.env.VITE_IDEFICS_ENDPOINT || ''

  const localToken = typeof localStorage !== 'undefined' ? localStorage.getItem('idefics_hf_token') || '' : ''
  const localEndpoint = typeof localStorage !== 'undefined' ? localStorage.getItem('idefics_endpoint') || '' : ''

  return {
    token: localToken || envToken || '',
    endpoint: localEndpoint || envEndpoint || DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    hasToken: Boolean(localToken || envToken),
  }
}

export function saveIdeficsConfig({ token, endpoint }) {
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
}

/**
 * Sends a captured image snapshot to Idefics3 Vision AI for model code extraction.
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
    headers['Authorization'] = `Bearer ${config.token}`
  }

  const payload = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: systemInstruction,
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
    max_tokens: 30,
    temperature: 0.1,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 18000)

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const latencyMs = Math.round(performance.now() - startTime)

    if (response.status === 401) {
      throw new Error('Hugging Face API key is missing or invalid. Please configure your HF token.')
    }

    if (response.status === 503) {
      throw new Error('Idefics3 model is currently loading on Hugging Face. Please retry in a few moments.')
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      throw new Error(`Idefics3 API returned error (${response.status}): ${errBody.slice(0, 120)}`)
    }

    const data = await response.json()

    // Support OpenAI-compatible chat completions response or direct Hugging Face response
    let extractedText = ''
    if (data.choices && data.choices.length > 0) {
      extractedText = data.choices[0]?.message?.content || ''
    } else if (Array.isArray(data) && data[0]?.generated_text) {
      extractedText = data[0].generated_text
    } else if (typeof data === 'string') {
      extractedText = data
    } else {
      extractedText = JSON.stringify(data)
    }

    return {
      rawText: extractedText.trim(),
      latencyMs,
      model: config.model,
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Idefics3 vision request timed out after 18 seconds.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
