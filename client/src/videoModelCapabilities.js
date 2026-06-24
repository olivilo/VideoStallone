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

export function getSupportedDurations(modelId) {
  return VIDEO_MODEL_CAPABILITIES[modelId]?.durations ?? null;
}

export function snapDuration(duration, modelId) {
  const supported = getSupportedDurations(modelId);
  if (!supported) return duration;
  if (supported.includes(Number(duration))) return Number(duration);
  return supported.reduce((best, d) =>
    Math.abs(d - duration) < Math.abs(best - duration) ? d : best
  );
}
