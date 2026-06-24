import fetch from "node-fetch";

const BASE_URL = "https://openrouter.ai/api/v1";

// Supported durations per model (seconds). Used for snapping before job submission.
export const VIDEO_MODEL_CAPABILITIES = {
  "google/veo-3.1":              { durations: [5, 6, 7, 8] },
  "google/veo-3.1-fast":         { durations: [5, 6, 7, 8] },
  "google/veo-3.1-lite":         { durations: [5, 6, 7, 8] },
  "kuaishou/kling-v3-pro":       { durations: [5, 10] },
  "kuaishou/kling-v3-standard":  { durations: [5, 10] },
  "kuaishou/kling-video-o1":     { durations: [5, 10] },
  "minimax/hailuo-2.3":          { durations: [6] },
  "alibaba/wan-2.7":             { durations: [4, 6, 8] },
  "alibaba/wan-2.6":             { durations: [4, 6, 8] },
  "bytedance/seedance-2.0":      { durations: [5, 10] },
  "bytedance/seedance-2.0-fast": { durations: [5, 10] },
  "bytedance/seedance-1.5-pro":  { durations: [5, 10] },
  "openai/sora-2-pro":           { durations: [5, 10, 15, 20] },
  "xai/grok-imagine-video":      { durations: [4, 6, 8, 10] },
};

export function snapDuration(duration, modelId) {
  const caps = VIDEO_MODEL_CAPABILITIES[modelId];
  if (!caps?.durations?.length) return duration;
  if (caps.durations.includes(Number(duration))) return Number(duration);
  return caps.durations.reduce((best, d) =>
    Math.abs(d - duration) < Math.abs(best - duration) ? d : best
  );
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
    modalities: ["image", "text"]
  };
  if (seed != null) body.seed = seed;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  const json = await handleResponse(res);
  const message = json?.choices?.[0]?.message;
  const images = message?.images || [];
  if (images.length === 0) {
    throw new OpenRouterError(
      "Das Bildmodell hat kein Bild zurückgegeben. Modell ggf. wechseln.",
      500,
      json
    );
  }
  // images[0].image_url.url ist meist eine data: URL oder gehostete URL
  return images.map((img) => img.image_url?.url).filter(Boolean);
}

/* ---------- Video-Generierung: asynchrone Jobs ---------- */

export async function listVideoModels({ apiKey }) {
  const res = await fetch(`${BASE_URL}/videos/models`, {
    method: "GET",
    headers: headers(apiKey)
  });
  return handleResponse(res);
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

  const res = await fetch(`${BASE_URL}/videos`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body)
  });
  return handleResponse(res);
}

export async function getVideoJobStatus({ apiKey, jobId }) {
  const res = await fetch(`${BASE_URL}/videos/${jobId}`, {
    method: "GET",
    headers: headers(apiKey)
  });
  return handleResponse(res);
}

export async function downloadVideoContent({ apiKey, jobId, index = 0 }) {
  const res = await fetch(`${BASE_URL}/videos/${jobId}/content?index=${index}`, {
    method: "GET",
    headers: headers(apiKey)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterError(`Video-Download fehlgeschlagen (${res.status})`, res.status, text);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { OpenRouterError };
