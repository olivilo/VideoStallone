import fetch from "node-fetch";

const BASE_URL = "https://openrouter.ai/api/v1";

// Supported durations per model (seconds). Used for snapping before job submission.
export const VIDEO_MODEL_CAPABILITIES = {
  "google/veo-3.1":               { durations: [4, 6, 8] },
  "google/veo-3.1-fast":          { durations: [4, 6, 8] },
  "google/veo-3.1-lite":          { durations: [4, 5, 6, 7, 8] },
  "kwaivgi/kling-v3.0-pro":       { min: 3, max: 15 },
  "kwaivgi/kling-v3.0-std":       { min: 3, max: 15 },
  "kwaivgi/kling-video-o1":       { durations: [5, 10] },
  "minimax/hailuo-2.3":           { durations: [6] },
  "alibaba/wan-2.7":              { durations: [5, 10] },
  "alibaba/wan-2.6":              { durations: [5, 10] },
  "alibaba/happyhorse-1.1":       { min: 3, max: 15 },
  "alibaba/happyhorse-1.0":       { min: 3, max: 15 },
  "bytedance/seedance-2.0":       { durations: [5, 10] },
  "bytedance/seedance-2.0-fast":  { durations: [5, 10] },
  "bytedance/seedance-1.5-pro":   { durations: [5, 10] },
  "openai/sora-2-pro":            { durations: [5, 10, 15, 20] },
  "x-ai/grok-imagine-video":      { min: 1, max: 15 },
  // Legacy IDs
  "kuaishou/kling-v3-pro":        { min: 3, max: 15 },
  "kuaishou/kling-v3-standard":   { min: 3, max: 15 },
  "kuaishou/kling-video-o1":      { durations: [5, 10] },
  "xai/grok-imagine-video":       { min: 1, max: 15 },
};

// In-memory cache of live capabilities and pricing from the API
let _liveCapabilities = {};
let _videoPricing = {}; // modelId -> price per second (number)

export function getLiveCapabilities() { return _liveCapabilities; }
export function getVideoPricePerSec(modelId) { return _videoPricing[modelId] || null; }

export function snapDuration(duration, modelId) {
  const caps = _liveCapabilities[modelId] || VIDEO_MODEL_CAPABILITIES[modelId];
  if (!caps) return Number(duration);
  const d = Number(duration);
  if (caps.durations) {
    if (caps.durations.includes(d)) return d;
    return caps.durations.reduce((best, v) =>
      Math.abs(v - d) < Math.abs(best - d) ? v : best
    );
  }
  if (caps.min != null && caps.max != null) {
    return Math.max(caps.min, Math.min(caps.max, d));
  }
  return d;
}

class OpenRouterError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function headers(apiKey, extra = {}) {
  if (!apiKey) {
    throw new OpenRouterError("Kein OpenRouter API-Key gesetzt. Bitte in den Einstellungen eintragen.", 401);
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://videostallone.local",
    "X-Title": "VideoStallone",
    ...extra
  };
}

async function handleResponse(res) {
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message = json?.error?.message || json?.message || `OpenRouter Fehler (${res.status})`;
    throw new OpenRouterError(message, res.status, json);
  }
  return json;
}

/* ---------- Text-Generierung (LLM): Idee -> Szenenliste ---------- */

export async function chatCompletion({ apiKey, model, messages, responseFormatJson = false }) {
  const body = {
    model,
    messages
  };
  if (responseFormatJson) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const json = await handleResponse(res);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterError("Leere Antwort vom Sprachmodell erhalten.", 500, json);
  }
  return content;
}

/* ---------- Bild-Generierung: Storyboard-Standbilder ---------- */

export async function generateImage({ apiKey, model, prompt, referenceImageUrls = [], seed }) {
  const userContent = [{ type: "text", text: prompt }];
  for (const url of referenceImageUrls) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const body = {
    model,
    messages: [{ role: "user", content: userContent }],
    modalities: ["image"]
  };
  if (seed != null) body.seed = seed;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const json = await handleResponse(res);
  const message = json?.choices?.[0]?.message;

  // Images can come back as message.images[] or embedded in message.content[]
  let images = message?.images || [];
  if (images.length === 0 && Array.isArray(message?.content)) {
    images = message.content
      .filter(c => c.type === "image_url")
      .map(c => ({ image_url: c.image_url }));
  }

  if (images.length === 0) {
    throw new OpenRouterError(
      "Das Bildmodell hat kein Bild zurückgegeben. Modell ggf. wechseln.",
      500,
      json
    );
  }
  return images.map((img) => img.image_url?.url).filter(Boolean);
}

/* ---------- Video-Generierung: asynchrone Jobs ---------- */

export async function listVideoModels({ apiKey }) {
  const res = await fetch(`${BASE_URL}/videos/models`, {
    method: "GET",
    headers: headers(apiKey)
  });
  const json = await handleResponse(res);
  // Cache live capabilities and pricing from API response
  const liveMap = {};
  const priceMap = {};
  for (const m of json.data || []) {
    if (!m.id) continue;
    if (Array.isArray(m.supported_durations) && m.supported_durations.length) {
      liveMap[m.id] = { durations: m.supported_durations };
    } else if (m.min_duration != null || m.max_duration != null) {
      liveMap[m.id] = { min: m.min_duration ?? 1, max: m.max_duration ?? 60 };
    }
    const pps = parseFloat(m.pricing?.video || m.pricing?.per_second || 0);
    if (pps) priceMap[m.id] = pps;
  }
  if (Object.keys(liveMap).length) _liveCapabilities = liveMap;
  if (Object.keys(priceMap).length) _videoPricing = priceMap;
  return json;
}

function fmt1M(val) {
  const n = parseFloat(val);
  if (!n || isNaN(n)) return null;
  const per1M = n * 1_000_000;
  return per1M >= 1 ? `$${per1M.toFixed(2)}` : `$${per1M.toFixed(3)}`;
}

export async function listTextModels({ apiKey }) {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey) });
  const json = await handleResponse(res);
  return (json.data || [])
    .filter(m => {
      const mod = m.architecture?.modality || "";
      return mod.includes("->text") && !mod.includes("->image") && !mod.includes("->audio");
    })
    .map(m => {
      const p = m.pricing || {};
      const inP = fmt1M(p.prompt);
      const outP = fmt1M(p.completion);
      const priceLabel = inP && outP ? `${inP} / ${outP} per M` : inP ? `${inP}/M` : null;
      return {
        id: m.id,
        name: m.name || m.id,
        contextK: m.context_length ? Math.round(m.context_length / 1000) : null,
        priceLabel,
        pricing: p
      };
    })
    .sort((a, b) => {
      const pa = parseFloat(a.pricing?.prompt || "9999");
      const pb = parseFloat(b.pricing?.prompt || "9999");
      return pa - pb;
    });
}

export async function listImageModels({ apiKey }) {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey) });
  const json = await handleResponse(res);
  return (json.data || [])
    .filter(m => {
      const mod = (m.architecture?.modality || "").toLowerCase();
      // Only models whose OUTPUT side contains "image" (e.g. "text->image", "text+image->image+text")
      // Excludes multimodal LLMs like "text+image->text" that accept images but only output text
      const output = mod.split("->").pop() || "";
      return output.includes("image");
    })
    .map(m => {
      const p = m.pricing || {};
      const imgP = parseFloat(p.image);
      const priceLabel = imgP ? `$${imgP.toFixed(4)}/img` : null;
      return { id: m.id, name: m.name || m.id, priceLabel, pricing: p };
    })
    .sort((a, b) => {
      const pa = parseFloat(a.pricing?.image || "9999");
      const pb = parseFloat(b.pricing?.image || "9999");
      return pa - pb;
    });
}

function withTimeout(promise, ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      controller.signal.addEventListener("abort", () =>
        reject(new OpenRouterError(`Zeitüberschreitung: ${label} (>${Math.round(ms / 1000)}s)`, 408))
      )
    )
  ]).finally(() => clearTimeout(timer));
}

export async function submitVideoJob({
  apiKey,
  model,
  prompt,
  aspectRatio,
  duration,
  resolution,
  generateAudio,
  frameImages,
  inputReferences,
  seed,
  negativePrompt
}) {
  const body = { model, prompt };
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (duration) body.duration = duration;
  if (resolution) body.resolution = resolution;
  if (typeof generateAudio === "boolean") body.generate_audio = generateAudio;
  if (frameImages?.length) body.frame_images = frameImages;
  if (inputReferences?.length) body.input_references = inputReferences;
  if (seed != null) body.seed = seed;
  if (negativePrompt) body.negative_prompt = negativePrompt;

  const res = await withTimeout(
    fetch(`${BASE_URL}/videos`, { method: "POST", headers: headers(apiKey), body: JSON.stringify(body) }),
    45_000,
    "Video-Job einreichen"
  );
  return handleResponse(res);
}

export async function getVideoJobStatus({ apiKey, jobId }) {
  const res = await withTimeout(
    fetch(`${BASE_URL}/videos/${jobId}`, { method: "GET", headers: headers(apiKey) }),
    20_000,
    "Job-Status abrufen"
  );
  return handleResponse(res);
}

export async function downloadVideoContent({ apiKey, jobId, index = 0 }) {
  const res = await withTimeout(
    fetch(`${BASE_URL}/videos/${jobId}/content?index=${index}`, { method: "GET", headers: headers(apiKey) }),
    120_000,
    "Video herunterladen"
  );
  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterError(`Video-Download fehlgeschlagen (${res.status})`, res.status, text);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { OpenRouterError };
