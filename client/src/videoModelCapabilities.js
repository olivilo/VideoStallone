// Fallback map — used when live API data isn't loaded yet.
// { durations: [...] } = fixed set, snap to nearest
// { min, max }         = any integer second in range, clamp
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
  // Legacy IDs kept for backward compatibility
  "kuaishou/kling-v3-pro":        { min: 3, max: 15 },
  "kuaishou/kling-v3-standard":   { min: 3, max: 15 },
  "kuaishou/kling-video-o1":      { durations: [5, 10] },
  "xai/grok-imagine-video":       { min: 1, max: 15 },
};

// Live capabilities override — populated from server API on load
let _liveCapabilities = {};

export function setLiveCapabilities(map) {
  _liveCapabilities = map || {};
}

export function getSupportedDurations(modelId) {
  const caps = _liveCapabilities[modelId] || VIDEO_MODEL_CAPABILITIES[modelId];
  if (!caps) return null;
  if (caps.durations) return caps.durations;
  if (caps.min != null && caps.max != null) {
    const arr = [];
    for (let d = caps.min; d <= caps.max; d++) arr.push(d);
    return arr;
  }
  return null;
}

export function getCapabilities(modelId) {
  return _liveCapabilities[modelId] || VIDEO_MODEL_CAPABILITIES[modelId] || null;
}

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
