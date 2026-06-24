import fetch from "node-fetch";
import { randomUUID } from "crypto";

/**
 * Local image generation via ComfyUI's HTTP API.
 *
 * Flow: POST a txt2img workflow graph to /prompt -> poll /history/{id} until the
 * SaveImage node has outputs -> download the PNG via /view -> return a data URL,
 * so the rest of the storyboard pipeline is identical to the OpenRouter path.
 *
 * Reference-image conditioning (cast photos) is not handled here yet — that needs
 * IPAdapter/PhotoMaker/ControlNet nodes; the OpenRouter path keeps that for now.
 */

class ComfyUIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 500;
  }
}

function baseFrom(settings) {
  return (settings?.url || "http://localhost:8188").replace(/\/+$/, "");
}

// Minimal, parameterised SD/SDXL checkpoint txt2img workflow (ComfyUI API format).
function buildWorkflow({ checkpoint, prompt, negativePrompt, seed, steps, cfg, samplerName, scheduler, width, height }) {
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: negativePrompt || "", clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      }
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "VideoStallone", images: ["8", 0] } }
  };
}

async function pingComfy(base) {
  try {
    const res = await fetch(`${base}/system_stats`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listComfyCheckpoints(settings) {
  const base = baseFrom(settings);
  if (!(await pingComfy(base))) {
    throw new ComfyUIError(`ComfyUI nicht erreichbar unter ${base}. Bitte ComfyUI mit aktiver API starten (Port 8188).`, 503);
  }
  const res = await fetch(`${base}/object_info/CheckpointLoaderSimple`, { method: "GET" });
  if (!res.ok) throw new ComfyUIError(`ComfyUI /object_info Fehler (${res.status})`, res.status);
  const json = await res.json();
  // The available checkpoint names live in the first enum of ckpt_name's input spec.
  const names = json?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
  return Array.isArray(names) ? names : [];
}

async function pollHistory(base, promptId, { timeoutMs = 180000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/history/${promptId}`, { method: "GET" });
    if (res.ok) {
      const hist = await res.json();
      const entry = hist?.[promptId];
      if (entry?.outputs) return entry;
      // Surface a failed/cancelled run instead of waiting the full timeout.
      const status = entry?.status;
      if (status?.completed === false && status?.status_str === "error") {
        throw new ComfyUIError("ComfyUI meldet einen Fehler bei der Generierung (siehe ComfyUI-Log).", 500);
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ComfyUIError("Zeitüberschreitung beim Warten auf ComfyUI.", 408);
}

function firstImageRef(outputs) {
  for (const nodeId of Object.keys(outputs)) {
    const imgs = outputs[nodeId]?.images;
    if (Array.isArray(imgs) && imgs.length) return imgs[0];
  }
  return null;
}

export async function generateImageComfyUI({ settings, prompt, negativePrompt, seed }) {
  const s = settings || {};
  const base = baseFrom(s);
  if (!(await pingComfy(base))) {
    throw new ComfyUIError(`ComfyUI nicht erreichbar unter ${base}. Bitte ComfyUI starten (Port 8188).`, 503);
  }

  const workflow = buildWorkflow({
    checkpoint: s.checkpoint || "realisticVisionV60B1_v51HyperVAE.safetensors",
    prompt,
    negativePrompt,
    seed: seed != null ? seed : Math.floor(Math.random() * 1_000_000_000),
    steps: s.steps ?? 6,
    cfg: s.cfg ?? 2,
    samplerName: s.samplerName || "dpmpp_sde",
    scheduler: s.scheduler || "karras",
    width: s.width ?? 768,
    height: s.height ?? 432
  });

  const clientId = randomUUID();
  const submit = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  if (!submit.ok) {
    const text = await submit.text();
    throw new ComfyUIError(`ComfyUI lehnte den Workflow ab (${submit.status}): ${text.slice(0, 300)}`, submit.status);
  }
  const { prompt_id: promptId } = await submit.json();
  if (!promptId) throw new ComfyUIError("ComfyUI gab keine prompt_id zurück.", 500);

  const entry = await pollHistory(base, promptId);
  const ref = firstImageRef(entry.outputs);
  if (!ref) throw new ComfyUIError("ComfyUI lieferte kein Bild zurück.", 500);

  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder || "",
    type: ref.type || "output"
  });
  const imgRes = await fetch(`${base}/view?${params.toString()}`, { method: "GET" });
  if (!imgRes.ok) throw new ComfyUIError(`Bild-Download von ComfyUI fehlgeschlagen (${imgRes.status})`, imgRes.status);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return [`data:image/png;base64,${buf.toString("base64")}`];
}

export { ComfyUIError };
