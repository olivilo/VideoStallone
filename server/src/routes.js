import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { loadConfig, saveConfig, addRecentWorkspace } from "./config.js";
import { listDirectory, createFolder, resolveSafePath } from "./fsBrowser.js";

const execFileAsync = promisify(execFile);
import {
  listProjects,
  createProject,
  loadProject,
  saveProject,
  deleteProject,
  getProjectDir,
  newSceneId
} from "./projects.js";
import {
  chatCompletion,
  generateImage,
  listVideoModels,
  listTextModels,
  listImageModels,
  submitVideoJob,
  OpenRouterError,
  VIDEO_MODEL_CAPABILITIES,
  getLiveCapabilities,
  getVideoPricePerSec,
  snapDuration
} from "./openrouter.js";
import {
  loadProjectCast,
  buildCastInjection,
  getCastReferenceUrls,
  getProjectCastDir
} from "./cast.js";
import { generateImageComfyUI, listComfyCheckpoints, ComfyUIError } from "./comfyui.js";

// A single film format drives image size, video aspect ratio and export canvas.
const VIDEO_FORMAT_DIMS = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1":  { width: 1024, height: 1024 },
  "21:9": { width: 1280, height: 548 },
  "4:5":  { width: 1024, height: 1280 }
};
function formatToDims(aspect) {
  return VIDEO_FORMAT_DIMS[aspect] || null;
}

function readImageDataUrl(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(absPath).toString("base64")}`;
}

// A scene's own video uses only its storyboard as the first frame; it keeps its
// full duration. The "morph" transition is a SEPARATE bridge clip (see
// buildTransitionFrameImages) so it never eats into the scene's running time.
function buildFrameImages(project, scene, projectDir) {
  if (!scene.storyboardImagePath) return undefined;
  const abs = path.join(projectDir, scene.storyboardImagePath);
  if (!fs.existsSync(abs)) return undefined;
  return [{ frame_type: "first_frame", type: "image_url", image_url: { url: readImageDataUrl(abs) } }];
}

// Frames for a transition bridge clip between scene N and N+1:
// first frame = N's last actual video frame (extracted) if available, else N's
// storyboard; last frame = N+1's storyboard. The clip starts where N ended and
// ends where N+1 begins, for a seamless join.
function buildTransitionFrameImages(project, scene, projectDir, firstFrameAbs) {
  const frames = [];
  if (firstFrameAbs && fs.existsSync(firstFrameAbs)) {
    frames.push({ frame_type: "first_frame", type: "image_url", image_url: { url: readImageDataUrl(firstFrameAbs) } });
  } else if (scene.storyboardImagePath) {
    const abs = path.join(projectDir, scene.storyboardImagePath);
    if (fs.existsSync(abs)) frames.push({ frame_type: "first_frame", type: "image_url", image_url: { url: readImageDataUrl(abs) } });
  }
  const next = project.scenes.find((s) => s.order === scene.order + 1);
  if (next?.storyboardImagePath) {
    const absNext = path.join(projectDir, next.storyboardImagePath);
    if (fs.existsSync(absNext)) frames.push({ frame_type: "last_frame", type: "image_url", image_url: { url: readImageDataUrl(absNext) } });
  }
  return frames.length ? frames : undefined;
}

// Extract the last frame of a video clip to a PNG (for use as a transition's first frame).
async function extractLastFrame(videoAbs, outAbs) {
  try {
    await execFileAsync("ffmpeg", ["-y", "-sseof", "-0.1", "-i", videoAbs, "-frames:v", "1", "-q:v", "2", outAbs]);
    return fs.existsSync(outAbs) ? outAbs : null;
  } catch {
    return null;
  }
}

// Route storyboard image generation to the configured provider.
// Returns an array of image URLs/data-URLs (same shape as generateImage()).
async function generateStoryboardImage({ cfg, project, model, prompt, referenceImageUrls, seed }) {
  if (cfg.imageProvider === "comfyui") {
    // Generate at the project's film format so storyboards match the video aspect.
    const dims = formatToDims(project?.settings?.aspectRatio);
    const settings = dims ? { ...cfg.comfyui, width: dims.width, height: dims.height } : cfg.comfyui;
    return generateImageComfyUI({
      settings,
      prompt,
      negativePrompt: project?.settings?.negativePrompt || "",
      seed
    });
  }
  return generateImage({ apiKey: cfg.openrouterApiKey, model, prompt, referenceImageUrls, seed });
}

// Generate (and auto-approve) a storyboard image for every scene that needs one.
// Shared by the "generate all" and "generate all storyboards" actions.
async function generateAllStoryboards({ cfg, workspaceRoot, folder, effectiveImageModel }) {
  const total = loadProject(workspaceRoot, folder).scenes.length;
  for (let i = 0; i < total; i++) {
    let project = loadProject(workspaceRoot, folder);
    const scene = project.scenes[i];
    if (!scene) continue;
    if (scene.storyboardStatus === "approved" || scene.storyboardStatus === "generating") continue;

    scene.storyboardStatus = "generating";
    saveProject(workspaceRoot, folder, project);

    try {
      const seed = randomSeed();
      const sceneStyle = scene.styleOverride || project.settings.style || "";
      const stylePfx = buildStylePrefix(sceneStyle);
      const castEntriesBatch = loadProjectCast(workspaceRoot, folder);
      const sbText = scene.storyboardPrompt || scene.description || "";
      const castNoteSb = buildCastInjection(castEntriesBatch, sbText);
      const castRefUrlsSb = getCastReferenceUrls(castEntriesBatch, getProjectCastDir(workspaceRoot, folder));
      const urls = await generateStoryboardImage({
        cfg,
        project,
        model: effectiveImageModel,
        prompt: `${stylePfx}Cinematic storyboard frame, single key composition, ${scene.camera}. Scene: ${sbText}${castNoteSb}`,
        referenceImageUrls: castRefUrlsSb,
        seed
      });
      const dataUrl = urls[0];
      const projectDir = getProjectDir(workspaceRoot, folder);
      const storyboardsDir = path.join(projectDir, "storyboards");
      if (!fs.existsSync(storyboardsDir)) fs.mkdirSync(storyboardsDir, { recursive: true });
      const fileName = `scene_${scene.order}_${scene.id.slice(0, 8)}_${seed}.png`;
      const filePath = path.join(storyboardsDir, fileName);
      if (dataUrl.startsWith("data:")) {
        fs.writeFileSync(filePath, Buffer.from(dataUrl.split(",")[1], "base64"));
      } else {
        const fetched = await fetch(dataUrl);
        fs.writeFileSync(filePath, Buffer.from(await fetched.arrayBuffer()));
      }
      project = loadProject(workspaceRoot, folder);
      const s = project.scenes.find((x) => x.id === scene.id);
      if (s) {
        if (s.storyboardImagePath) {
          s.storyboardVariants = addVariant(s.storyboardVariants, {
            seed: s.storyboardSeed ?? null,
            path: s.storyboardImagePath,
            createdAt: new Date().toISOString()
          });
        }
        s.storyboardStatus = "approved";
        s.storyboardSeed = seed;
        s.storyboardImagePath = path.join("storyboards", fileName);
        project.settings.imageModel = effectiveImageModel;
        saveProject(workspaceRoot, folder, project);
      }
    } catch (err) {
      console.error(`Storyboard-Fehler Szene ${scene.order}:`, err.message);
      const project2 = loadProject(workspaceRoot, folder);
      const s = project2.scenes.find((x) => x.id === scene.id);
      if (s) { s.storyboardStatus = "error"; s.storyboardError = err.message || "Unbekannter Fehler"; saveProject(workspaceRoot, folder, project2); }
    }
  }
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

function addVariant(variants = [], entry, max = 5) {
  return [entry, ...variants.filter((v) => v.path !== entry.path)].slice(0, max);
}

const STYLE_PROMPTS = {
  cinematic:     "Photorealistic cinematic style, film quality, 8K. ",
  comic:         "Comic book illustration style, bold outlines, vibrant flat colors, halftone. ",
  anime:         "Anime style, cel-shaded, vibrant colors, Japanese animation. ",
  "oil-painting": "Oil painting style, rich textured brushstrokes, museum quality. ",
  watercolor:    "Watercolor illustration, soft transparent washes, artistic. ",
  "3d-render":   "High-quality 3D CGI render, physically based rendering, studio lighting. ",
};

function buildStylePrefix(style) {
  return STYLE_PROMPTS[style] || "";
}

const DEFAULT_NEGATIVE_PROMPT =
  // Character / anatomy consistency
  "character transformation, gender change, species change, morphing, inconsistent character appearance, " +
  "shape-shifting, body horror, anatomy errors, extra limbs, extra fingers, deformed hands, fused fingers, " +
  "distorted face, melting, duplicated characters, " +
  // Reverse / unnatural motion
  "reverse motion, backwards movement, walking backwards, moving backward, driving in reverse, vehicles driving backwards, " +
  "people walking backwards, rewind, reversed footage, time reversal, unnatural movement, jerky motion, stuttering motion, " +
  "frozen frame, static freeze, teleporting, " +
  // General quality
  "blurry, lowres, watermark, text overlay, jpeg artifacts, flickering";

// Always-on exclusions appended even when the project provides its own negatives,
// because these (reverse motion, anatomy) must never be allowed.
const ALWAYS_NEGATIVE =
  "reverse motion, walking backwards, driving in reverse, moving backward, rewind, reversed footage, " +
  "extra limbs, deformed hands, character transformation";

function buildNegativePrompt(projectNegPrompt) {
  const base = projectNegPrompt?.trim();
  if (base) return `${base}, ${ALWAYS_NEGATIVE}`;
  return DEFAULT_NEGATIVE_PROMPT;
}

function buildCharacterNote(characters) {
  return characters?.trim() ? ` Consistent characters: ${characters.trim()}.` : "";
}
import {
  buildScenePlanningMessages,
  parseScenePlanningResponse,
  buildSceneRefinementMessages
} from "./scenePrompts.js";
import { startVideoPolling, isPollingActive } from "./videoJobManager.js";

export const router = express.Router();

function wrapAsync(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      const status = err.status || (err instanceof OpenRouterError ? 500 : 500);
      res.status(status).json({ error: err.message || "Unbekannter Fehler" });
    });
  };
}

/* ---------------- Settings ---------------- */

router.get("/settings", (req, res) => {
  const cfg = loadConfig();
  // API Key nicht im Klartext an Frontend zurückgeben, nur ob er gesetzt ist
  res.json({
    hasApiKey: Boolean(cfg.openrouterApiKey),
    workspaceRoot: cfg.workspaceRoot,
    recentWorkspaces: cfg.recentWorkspaces,
    defaultModels: cfg.defaultModels,
    imageProvider: cfg.imageProvider || "openrouter",
    comfyui: cfg.comfyui
  });
});

router.post("/settings/api-key", (req, res) => {
  const { apiKey } = req.body;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return res.status(400).json({ error: "API-Key fehlt" });
  }
  saveConfig({ openrouterApiKey: apiKey.trim() });
  res.json({ ok: true });
});

router.post("/settings/default-models", (req, res) => {
  const { text, image, video } = req.body;
  const cfg = loadConfig();
  const defaultModels = { ...cfg.defaultModels, ...(text && { text }), ...(image && { image }), ...(video !== undefined && { video }) };
  saveConfig({ defaultModels });
  res.json({ defaultModels });
});

router.post("/settings/image-provider", (req, res) => {
  const { imageProvider, comfyui } = req.body;
  const cfg = loadConfig();
  const next = {};
  if (imageProvider === "openrouter" || imageProvider === "comfyui") next.imageProvider = imageProvider;
  if (comfyui && typeof comfyui === "object") next.comfyui = { ...cfg.comfyui, ...comfyui };
  saveConfig(next);
  const saved = loadConfig();
  res.json({ imageProvider: saved.imageProvider, comfyui: saved.comfyui });
});

// List checkpoints available in the running ComfyUI instance.
router.get("/comfyui/models", wrapAsync(async (req, res) => {
  const cfg = loadConfig();
  const checkpoints = await listComfyCheckpoints(cfg.comfyui);
  res.json({ checkpoints });
}));

/* ---------------- Filesystem Browser (für Ordner-Auswahl GUI) ---------------- */

router.get("/fs/browse", wrapAsync(async (req, res) => {
  const target = req.query.path || "";
  const result = listDirectory(target);
  res.json(result);
}));

router.post("/fs/create-folder", wrapAsync(async (req, res) => {
  const { parentPath, name } = req.body;
  const newPath = createFolder(parentPath, name);
  res.json({ path: newPath });
}));

router.post("/workspace/select", wrapAsync(async (req, res) => {
  const { folderPath } = req.body;
  const resolved = resolveSafePath(folderPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  const cfg = addRecentWorkspace(resolved);
  res.json({ workspaceRoot: cfg.workspaceRoot, recentWorkspaces: cfg.recentWorkspaces });
}));

/* ---------------- Projekte ---------------- */

router.get("/projects", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  if (!workspaceRoot) return res.status(400).json({ error: "workspaceRoot fehlt" });
  res.json({ projects: listProjects(workspaceRoot) });
}));

router.post("/projects", wrapAsync(async (req, res) => {
  const { workspaceRoot, name } = req.body;
  if (!workspaceRoot || !name) {
    return res.status(400).json({ error: "workspaceRoot und name sind erforderlich" });
  }
  const { project, folder } = createProject(workspaceRoot, name);
  res.json({ project, folder });
}));

router.get("/projects/:folder", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  const cfg = loadConfig();

  // Resume polling for any jobs that were running before a server restart
  if (cfg.openrouterApiKey) {
    for (const scene of project.scenes || []) {
      if ((scene.videoStatus === "generating" || scene.videoStatus === "queued") &&
          scene.videoJobId && !isPollingActive(req.params.folder, scene.id)) {
        startVideoPolling({
          apiKey: cfg.openrouterApiKey,
          workspaceRoot: resolveSafePath(workspaceRoot),
          folder: req.params.folder,
          sceneId: scene.id,
          jobId: scene.videoJobId
        });
      }
    }
  }

  res.json({ project });
}));

router.delete("/projects/:folder", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  deleteProject(workspaceRoot, req.params.folder);
  res.json({ ok: true });
}));

router.put("/projects/:folder/settings", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  project.settings = { ...project.settings, ...req.body };
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

/* ---------------- Szenenplanung (Idee -> Szenenliste via LLM) ---------------- */

router.post("/projects/:folder/plan", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { idea, targetSceneCount, model } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);

  const textModel = model || project.settings.textModel || cfg.defaultModels.text;
  const messages = buildScenePlanningMessages(idea, targetSceneCount);
  const raw = await chatCompletion({
    apiKey: cfg.openrouterApiKey,
    model: textModel,
    messages,
    responseFormatJson: true
  });
  const planned = parseScenePlanningResponse(raw);

  project.idea = idea;
  project.settings.textModel = textModel;
  project.scenes = planned.map((s, idx) => ({
    id: newSceneId(),
    order: idx + 1,
    title: s.title,
    description: s.description,
    storyboardPrompt: s.storyboardPrompt,
    camera: s.camera,
    transition: s.transition,
    // Structured outgoing transition into the NEXT scene (cut by default).
    transitionOut: { type: "cut", durationMs: 0 },
    durationSeconds: s.durationSeconds || 6,
    storyboardStatus: "pending",
    storyboardImagePath: null,
    videoStatus: "idle",
    videoJobId: null,
    videoPath: null,
    hasAudio: false,
    videoError: null
  }));

  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.post("/projects/:folder/replan", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { instruction, model } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);
  const textModel = model || project.settings.textModel || cfg.defaultModels.text;

  const messages = buildSceneRefinementMessages(project.idea, project.scenes, instruction);
  const raw = await chatCompletion({
    apiKey: cfg.openrouterApiKey,
    model: textModel,
    messages,
    responseFormatJson: true
  });
  const planned = parseScenePlanningResponse(raw);

  // Wir mappen auf bestehende IDs soweit Reihenfolge passt, sonst neue IDs.
  const oldScenes = project.scenes;
  project.scenes = planned.map((s, idx) => {
    const existing = oldScenes[idx];
    return {
      id: existing?.id || newSceneId(),
      order: idx + 1,
      title: s.title,
      description: s.description,
      storyboardPrompt: s.storyboardPrompt,
      camera: s.camera,
      transition: s.transition,
      durationSeconds: s.durationSeconds || 6,
      storyboardStatus: existing?.storyboardStatus === "approved" && existing.description === s.description
        ? "approved"
        : "pending",
      storyboardImagePath: existing?.description === s.description ? existing.storyboardImagePath : null,
      videoStatus: existing?.description === s.description ? existing.videoStatus : "idle",
      videoJobId: existing?.description === s.description ? existing.videoJobId : null,
      videoPath: existing?.description === s.description ? existing.videoPath : null,
      hasAudio: existing?.hasAudio || false,
      videoError: null
    };
  });

  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.put("/projects/:folder/scenes/:sceneId", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });

  const editableFields = ["title", "description", "storyboardPrompt", "camera", "transition", "durationSeconds", "styleOverride"];
  for (const field of editableFields) {
    if (req.body[field] !== undefined) scene[field] = req.body[field];
  }
  // Manuelle Bearbeitung entwertet vorherige Freigaben/Assets für diese Szene
  scene.storyboardStatus = "pending";
  scene.storyboardImagePath = null;
  scene.videoStatus = "idle";
  scene.videoJobId = null;
  scene.videoPath = null;

  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

// Set a scene's outgoing transition WITHOUT invalidating its rendered assets.
router.put("/projects/:folder/scenes/:sceneId/transition", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { type, durationMs, durationSeconds } = req.body;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });

  const VALID = ["cut", "dissolve", "fadeblack", "fadewhite", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "morph"];
  if (type && !VALID.includes(type)) {
    return res.status(400).json({ error: `Unbekannter Übergangstyp: ${type}` });
  }
  const next = {
    type: type || "cut",
    // Visual blend length for xfade transitions (ms).
    durationMs: type === "cut" || type === "morph" ? 0 : Math.max(0, Number(durationMs) || 500),
    // A morph is a SEPARATE bridge clip with its own length in seconds.
    durationSeconds: Math.min(10, Math.max(2, Number(durationSeconds) || scene.transitionOut?.durationSeconds || 3))
  };
  // Changing the transition invalidates a previously generated bridge clip.
  if (scene.transitionOut?.type !== next.type) {
    scene.transitionVideoStatus = "idle";
    scene.transitionVideoPath = null;
  }
  scene.transitionOut = next;
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.post("/projects/:folder/scenes/reorder", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { sceneIdsInOrder } = req.body;
  const project = loadProject(workspaceRoot, req.params.folder);
  const byId = new Map(project.scenes.map((s) => [s.id, s]));
  project.scenes = sceneIdsInOrder.map((id, idx) => {
    const scene = byId.get(id);
    scene.order = idx + 1;
    return scene;
  });
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.delete("/projects/:folder/scenes/:sceneId", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  project.scenes = project.scenes
    .filter((s) => s.id !== req.params.sceneId)
    .map((s, idx) => ({ ...s, order: idx + 1 }));
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

/* ---------------- Storyboard (Bild pro Szene) ---------------- */

router.post("/projects/:folder/scenes/:sceneId/storyboard", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { model } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });

  const rawModel = model || project.settings.imageModel || cfg.defaultModels.image;
  const imageModel = rawModel ? rawModel.replace(/^[~\s]+/, "").trim() : rawModel;
  if (cfg.imageProvider !== "comfyui" && !imageModel) {
    return res.status(400).json({ error: "Kein Bild-Modell ausgewählt." });
  }
  const seed = randomSeed();

  // Save current image to variants before overwriting
  if (scene.storyboardImagePath) {
    scene.storyboardVariants = addVariant(scene.storyboardVariants, {
      seed: scene.storyboardSeed ?? null,
      path: scene.storyboardImagePath,
      createdAt: new Date().toISOString()
    });
  }

  scene.storyboardStatus = "generating";
  saveProject(workspaceRoot, req.params.folder, project);

  try {
    const effectiveStyle = scene.styleOverride || project.settings.style || "";
    const stylePrefix = buildStylePrefix(effectiveStyle);
    const castEntries = loadProjectCast(workspaceRoot, req.params.folder);
    const sceneText = scene.storyboardPrompt || scene.description || "";
    const castNote = buildCastInjection(castEntries, sceneText);
    const castRefUrls = getCastReferenceUrls(castEntries, getProjectCastDir(workspaceRoot, req.params.folder));
    const urls = await generateStoryboardImage({
      cfg,
      project,
      model: imageModel,
      prompt: `${stylePrefix}Cinematic storyboard frame, single key composition, ${scene.camera}. Scene: ${sceneText}${castNote}`,
      referenceImageUrls: castRefUrls,
      seed
    });
    const dataUrl = urls[0];

    const projectDir = getProjectDir(workspaceRoot, req.params.folder);
    const storyboardsDir = path.join(projectDir, "storyboards");
    if (!fs.existsSync(storyboardsDir)) fs.mkdirSync(storyboardsDir, { recursive: true });
    const fileName = `scene_${scene.order}_${scene.id.slice(0, 8)}_${seed}.png`;
    const filePath = path.join(storyboardsDir, fileName);

    if (dataUrl.startsWith("data:")) {
      fs.writeFileSync(filePath, Buffer.from(dataUrl.split(",")[1], "base64"));
    } else {
      const fetched = await fetch(dataUrl);
      fs.writeFileSync(filePath, Buffer.from(await fetched.arrayBuffer()));
    }

    scene.storyboardStatus = "ready";
    scene.storyboardSeed = seed;
    scene.storyboardImagePath = path.join("storyboards", fileName);
    project.settings.imageModel = imageModel;
    saveProject(workspaceRoot, req.params.folder, project);
    res.json({ project });
  } catch (err) {
    scene.storyboardStatus = "error";
    scene.storyboardError = err.message || "Unbekannter Fehler";
    saveProject(workspaceRoot, req.params.folder, project);
    throw err;
  }
}));

router.post("/projects/:folder/scenes/:sceneId/storyboard/restore-variant", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { variantIndex } = req.body;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  const variant = (scene.storyboardVariants || [])[variantIndex];
  if (!variant) return res.status(404).json({ error: "Variante nicht gefunden" });

  // Save current to variants before switching
  if (scene.storyboardImagePath) {
    scene.storyboardVariants = addVariant(scene.storyboardVariants, {
      seed: scene.storyboardSeed ?? null,
      path: scene.storyboardImagePath,
      createdAt: new Date().toISOString()
    });
  }
  scene.storyboardSeed = variant.seed;
  scene.storyboardImagePath = variant.path;
  scene.storyboardStatus = "approved";
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.post("/projects/:folder/scenes/:sceneId/storyboard/approve", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  if (scene.storyboardStatus !== "ready") {
    return res.status(400).json({ error: "Storyboard ist noch nicht bereit" });
  }
  scene.storyboardStatus = "approved";
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

/* ---------------- Alle Szenendauern anpassen ---------------- */

router.post("/projects/:folder/snap-durations", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: "model fehlt" });

  const live = getLiveCapabilities();
  const caps = live[model] || VIDEO_MODEL_CAPABILITIES[model];
  if (!caps) {
    return res.status(400).json({ error: `Keine Dauer-Informationen für Modell "${model}" bekannt. Bitte zuerst die Modell-Liste laden.` });
  }

  const project = loadProject(workspaceRoot, req.params.folder);
  let changed = 0;
  const details = [];
  for (const scene of project.scenes) {
    const snapped = snapDuration(scene.durationSeconds, model);
    if (snapped !== scene.durationSeconds) {
      details.push({ scene: scene.order, from: scene.durationSeconds, to: snapped });
      scene.durationSeconds = snapped;
      changed++;
    }
  }
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project, changed, details });
}));

/* ---------------- Video-Modelle Liste ---------------- */

router.get("/video-models", wrapAsync(async (req, res) => {
  const cfg = loadConfig();
  const data = await listVideoModels({ apiKey: cfg.openrouterApiKey });
  res.json(data);
}));

router.get("/text-models", wrapAsync(async (req, res) => {
  const cfg = loadConfig();
  res.json({ models: await listTextModels({ apiKey: cfg.openrouterApiKey }) });
}));

router.get("/image-models", wrapAsync(async (req, res) => {
  const cfg = loadConfig();
  res.json({ models: await listImageModels({ apiKey: cfg.openrouterApiKey }) });
}));

/* ---------------- Video-Generierung pro Szene ---------------- */

router.post("/projects/:folder/scenes/:sceneId/video", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { model, generateAudio, aspectRatio, resolution } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  const canGenerateVideo = scene.storyboardStatus === "approved" ||
    (scene.storyboardStatus === "ready" && scene.storyboardImagePath);
  if (!canGenerateVideo) {
    return res.status(400).json({ error: "Storyboard-Bild muss zuerst generiert und freigegeben werden." });
  }

  const videoModel = model || project.settings.videoModel || cfg.defaultModels.video;
  if (!videoModel) {
    return res.status(400).json({ error: "Kein Video-Modell ausgewählt." });
  }

  const snapped = snapDuration(scene.durationSeconds, videoModel);
  if (snapped !== scene.durationSeconds) {
    console.log(`Dauer ${scene.durationSeconds}s → ${snapped}s angepasst für ${videoModel}`);
  }

  const frameImages = buildFrameImages(project, scene, getProjectDir(workspaceRoot, req.params.folder));

  const seed = randomSeed();
  const effectiveStyle = scene.styleOverride || project.settings.style || "";
  const stylePrefix = buildStylePrefix(effectiveStyle);
  const charNote = buildCharacterNote(project.settings.characters);
  const castEntries = loadProjectCast(workspaceRoot, req.params.folder);
  const castNote = buildCastInjection(castEntries, scene.description || "");
  const negPrompt = buildNegativePrompt(project.settings.negativePrompt);

  // Save current video to variants before overwriting
  if (scene.videoPath) {
    scene.videoVariants = addVariant(scene.videoVariants, {
      seed: scene.videoSeed ?? null,
      jobId: scene.videoJobId ?? null,
      path: scene.videoPath,
      createdAt: new Date().toISOString()
    });
  }

  const job = await submitVideoJob({
    apiKey: cfg.openrouterApiKey,
    model: videoModel,
    prompt: `${stylePrefix}${scene.description}${charNote}${castNote} Camera: ${scene.camera}.`,
    aspectRatio: aspectRatio || project.settings.aspectRatio || project.settings.defaultAspectRatio,
    duration: snapped,
    resolution,
    generateAudio: typeof generateAudio === "boolean" ? generateAudio : (project.settings.generateSound ?? project.settings.defaultGenerateAudio),
    frameImages,
    seed,
    negativePrompt: negPrompt
  });

  scene.videoStatus = "queued";
  scene.videoJobId = job.id;
  scene.videoSeed = seed;
  scene.videoJobProgress = null;
  scene.hasAudio = Boolean(generateAudio ?? (project.settings.generateSound ?? project.settings.defaultGenerateAudio));
  scene.videoError = null;
  const pps = getVideoPricePerSec(videoModel);
  scene.videoCost = pps ? Math.round(pps * snapped * 10000) / 10000 : null;
  project.settings.videoModel = videoModel;
  saveProject(workspaceRoot, req.params.folder, project);

  startVideoPolling({
    apiKey: cfg.openrouterApiKey,
    workspaceRoot: resolveSafePath(workspaceRoot),
    folder: req.params.folder,
    sceneId: scene.id,
    jobId: job.id
  });

  res.json({ project });
}));

router.post("/projects/:folder/scenes/:sceneId/video/approve", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  if (scene.videoStatus !== "ready") {
    return res.status(400).json({ error: "Video ist noch nicht bereit" });
  }
  scene.videoStatus = "approved";
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

// Generate a separate "morph" bridge clip between this scene and the next.
// It has its own duration (seconds) so it never shortens the scenes themselves.
router.post("/projects/:folder/scenes/:sceneId/transition-video", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { model } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  if (scene.transitionOut?.type !== "morph") {
    return res.status(400).json({ error: "Nur 'Nahtlos'-Übergänge erzeugen einen Brücken-Clip." });
  }
  const next = project.scenes.find((s) => s.order === scene.order + 1);
  if (!next?.storyboardImagePath) {
    return res.status(400).json({ error: "Die nächste Szene braucht zuerst ein Storyboard-Bild." });
  }
  const videoModel = model || project.settings.videoModel || cfg.defaultModels.video;
  if (!videoModel) return res.status(400).json({ error: "Kein Video-Modell ausgewählt." });

  const projectDir = getProjectDir(workspaceRoot, req.params.folder);
  // First frame = scene N's last actual video frame if it exists, else its storyboard.
  let firstFrameAbs = null;
  if (scene.videoPath) {
    const vidAbs = path.join(projectDir, scene.videoPath);
    if (fs.existsSync(vidAbs)) {
      const sbDir = path.join(projectDir, "storyboards");
      if (!fs.existsSync(sbDir)) fs.mkdirSync(sbDir, { recursive: true });
      firstFrameAbs = await extractLastFrame(vidAbs, path.join(sbDir, `transition_src_${scene.id.slice(0, 8)}.png`));
    }
  }
  const frameImages = buildTransitionFrameImages(project, scene, projectDir, firstFrameAbs);

  const seconds = Math.min(10, Math.max(2, Number(scene.transitionOut?.durationSeconds) || 3));
  const snapped = snapDuration(seconds, videoModel);
  const seed = randomSeed();
  const stylePrefix = buildStylePrefix(scene.styleOverride || project.settings.style || "");
  const negPrompt = buildNegativePrompt(project.settings.negativePrompt);

  const job = await submitVideoJob({
    apiKey: cfg.openrouterApiKey,
    model: videoModel,
    prompt: `${stylePrefix}Smooth cinematic transition that flows from the previous shot into the next. Continuous forward camera motion, seamless morph, no hard cut.`,
    aspectRatio: project.settings.aspectRatio || project.settings.defaultAspectRatio,
    duration: snapped,
    generateAudio: false,
    frameImages,
    seed,
    negativePrompt: negPrompt
  });

  scene.transitionVideoStatus = "queued";
  scene.transitionVideoJobId = job.id;
  scene.transitionVideoError = null;
  project.settings.videoModel = videoModel;
  saveProject(workspaceRoot, req.params.folder, project);

  startVideoPolling({
    apiKey: cfg.openrouterApiKey,
    workspaceRoot: resolveSafePath(workspaceRoot),
    folder: req.params.folder,
    sceneId: scene.id,
    jobId: job.id,
    target: "transition"
  });

  res.json({ project });
}));

router.post("/projects/:folder/scenes/:sceneId/video/restore-variant", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { variantIndex } = req.body;
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  const variant = (scene.videoVariants || [])[variantIndex];
  if (!variant) return res.status(404).json({ error: "Variante nicht gefunden" });

  if (scene.videoPath) {
    scene.videoVariants = addVariant(scene.videoVariants, {
      seed: scene.videoSeed ?? null,
      jobId: scene.videoJobId ?? null,
      path: scene.videoPath,
      createdAt: new Date().toISOString()
    });
  }
  scene.videoSeed = variant.seed;
  scene.videoJobId = variant.jobId;
  scene.videoPath = variant.path;
  scene.videoStatus = "ready";
  scene.videoError = null;
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

/* ---------------- Video-Modell Capabilities ---------------- */

router.get("/video-models/capabilities", (req, res) => {
  // Live capabilities override the hardcoded fallback map
  res.json({ ...VIDEO_MODEL_CAPABILITIES, ...getLiveCapabilities() });
});

/* ---------------- Batch: Alle Szenen generieren ---------------- */

// Generate ONLY the storyboard images for every scene (no videos).
router.post("/projects/:folder/generate-storyboards", wrapAsync(async (req, res) => {
  const folder = req.params.folder;
  const { workspaceRoot } = req.query;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, folder);
  const rawImageModel = project.settings.imageModel || cfg.defaultModels.image;
  const effectiveImageModel = rawImageModel ? rawImageModel.replace(/^[~\s]+/, "").trim() : rawImageModel;
  if (cfg.imageProvider !== "comfyui" && !effectiveImageModel) {
    return res.status(400).json({ error: "Kein Bild-Modell ausgewählt." });
  }
  res.json({ started: true, totalScenes: project.scenes.length });
  generateAllStoryboards({ cfg, workspaceRoot, folder, effectiveImageModel })
    .catch((err) => console.error("Storyboard-Batch-Fehler:", err.message));
}));

router.post("/projects/:folder/generate-all", wrapAsync(async (req, res) => {
  const folder = req.params.folder;
  const { workspaceRoot } = req.query;
  const { generateAudio } = req.body;
  const cfg = loadConfig();
  let project = loadProject(workspaceRoot, folder);

  const rawImageModel = project.settings.imageModel || cfg.defaultModels.image;
  const effectiveImageModel = rawImageModel ? rawImageModel.replace(/^[~\s]+/, "").trim() : rawImageModel;
  const effectiveVideoModel = project.settings.videoModel || cfg.defaultModels.video;

  if (!effectiveVideoModel) {
    return res.status(400).json({ error: "Kein Video-Modell ausgewählt. Bitte zuerst in den Einstellungen wählen." });
  }

  // Sofort antworten — Verarbeitung läuft im Hintergrund
  res.json({ started: true, totalScenes: project.scenes.length });

  // Hintergrundverarbeitung (nicht awaited)
  (async () => {
    const resolvedWorkspace = resolveSafePath(workspaceRoot);

    // Phase 1: Storyboard für jede Szene generieren + automatisch freigeben
    await generateAllStoryboards({ cfg, workspaceRoot, folder, effectiveImageModel });

    // Phase 2: Video-Job für jede freigegebene Szene starten
    project = loadProject(workspaceRoot, folder);
    for (const scene of project.scenes) {
      if (scene.storyboardStatus !== "approved") continue;
      if (["queued", "generating", "ready", "approved"].includes(scene.videoStatus)) continue;

      const frameImages = buildFrameImages(project, scene, getProjectDir(workspaceRoot, folder));

      try {
        const snapped = snapDuration(scene.durationSeconds, effectiveVideoModel);
        const seed = randomSeed();
        const sceneStyleV = scene.styleOverride || project.settings.style || "";
        const stylePfxV = buildStylePrefix(sceneStyleV);
        const charNoteV = buildCharacterNote(project.settings.characters);
        const castEntriesVid = loadProjectCast(workspaceRoot, folder);
        const castNoteVid = buildCastInjection(castEntriesVid, scene.description || "");
        const negPromptV = buildNegativePrompt(project.settings.negativePrompt);
        const job = await submitVideoJob({
          apiKey: cfg.openrouterApiKey,
          model: effectiveVideoModel,
          prompt: `${stylePfxV}${scene.description}${charNoteV}${castNoteVid} Camera: ${scene.camera}.`,
          aspectRatio: project.settings.aspectRatio || project.settings.defaultAspectRatio,
          duration: snapped,
          generateAudio: typeof generateAudio === "boolean" ? generateAudio : (project.settings.generateSound ?? project.settings.defaultGenerateAudio),
          frameImages,
          seed,
          negativePrompt: negPromptV
        });
        project = loadProject(workspaceRoot, folder);
        const s = project.scenes.find((x) => x.id === scene.id);
        if (s) {
          if (s.videoPath) {
            s.videoVariants = addVariant(s.videoVariants, {
              seed: s.videoSeed ?? null,
              jobId: s.videoJobId ?? null,
              path: s.videoPath,
              createdAt: new Date().toISOString()
            });
          }
          s.videoStatus = "queued";
          s.videoJobId = job.id;
          s.videoSeed = seed;
          s.videoJobProgress = null;
          s.hasAudio = Boolean(generateAudio ?? (project.settings.generateSound ?? project.settings.defaultGenerateAudio));
          s.videoError = null;
          project.settings.videoModel = effectiveVideoModel;
          saveProject(workspaceRoot, folder, project);
        }
        startVideoPolling({ apiKey: cfg.openrouterApiKey, workspaceRoot: resolvedWorkspace, folder, sceneId: scene.id, jobId: job.id });
      } catch (err) {
        console.error(`Video-Job-Fehler Szene ${scene.order}:`, err.message);
        project = loadProject(workspaceRoot, folder);
        const s = project.scenes.find((x) => x.id === scene.id);
        if (s) { s.videoStatus = "error"; s.videoError = err.message; saveProject(workspaceRoot, folder, project); }
      }
    }
  })().catch((err) => console.error("Batch-Fehler:", err.message));
}));

/* ---------------- Export: Alle Videos zu Film zusammenfügen ---------------- */

// Probe a clip's resolution, framerate and whether it carries an audio track.
async function probeClip(absPath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", absPath]);
    const data = JSON.parse(stdout);
    const v = (data.streams || []).find((s) => s.codec_type === "video");
    const hasAudio = (data.streams || []).some((s) => s.codec_type === "audio");
    let fps = 30;
    if (v?.r_frame_rate && v.r_frame_rate.includes("/")) {
      const [n, d] = v.r_frame_rate.split("/").map(Number);
      if (d) fps = Math.round(n / d);
    }
    return { width: v?.width || 0, height: v?.height || 0, fps: fps || 30, hasAudio };
  } catch {
    return { width: 0, height: 0, fps: 30, hasAudio: false };
  }
}

// Pick a single output canvas: the most common clip resolution (tie-break by
// largest area), unless the project overrides it. Clips that differ get
// letterboxed to this canvas instead of being stretched.
function chooseCanvas(probes, override) {
  if (override?.width && override?.height) {
    return { width: override.width, height: override.height, fps: override.fps || 30 };
  }
  const counts = new Map();
  for (const p of probes) {
    if (!p.width || !p.height) continue;
    const key = `${p.width}x${p.height}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null, bestCount = -1, bestArea = -1;
  for (const [key, count] of counts) {
    const [w, h] = key.split("x").map(Number);
    const area = w * h;
    if (count > bestCount || (count === bestCount && area > bestArea)) {
      best = { width: w, height: h }; bestCount = count; bestArea = area;
    }
  }
  if (!best) best = { width: 1280, height: 720 };
  best.width -= best.width % 2;   // libx264 needs even dimensions
  best.height -= best.height % 2;
  const fps = Math.min(60, Math.max(24, ...probes.map((p) => p.fps || 30)));
  return { width: best.width, height: best.height, fps };
}

router.post("/projects/:folder/export", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { approveReady } = req.body;
  const folder = req.params.folder;
  let project = loadProject(workspaceRoot, folder);
  const projectDir = getProjectDir(workspaceRoot, folder);

  // Alle "ready" Videos automatisch freigeben falls gewünscht
  if (approveReady) {
    let changed = false;
    for (const scene of project.scenes) {
      if (scene.videoStatus === "ready") { scene.videoStatus = "approved"; changed = true; }
    }
    if (changed) saveProject(workspaceRoot, folder, project);
    project = loadProject(workspaceRoot, folder);
  }

  const approvedScenes = project.scenes
    .filter((s) => s.videoStatus === "approved" && s.videoPath)
    .sort((a, b) => a.order - b.order);

  if (approvedScenes.length === 0) {
    return res.status(400).json({ error: "Keine freigegebenen Videos vorhanden." });
  }

  // Flatten to the actual clip order: each scene's video, followed by its
  // generated "morph" bridge clip (a separate clip with its own duration).
  const clipPaths = [];
  for (const s of approvedScenes) {
    clipPaths.push(path.resolve(projectDir, s.videoPath));
    if (s.transitionOut?.type === "morph" && s.transitionVideoPath) {
      const tAbs = path.resolve(projectDir, s.transitionVideoPath);
      if (fs.existsSync(tAbs)) clipPaths.push(tAbs);
    }
  }

  const outputFile = path.join(projectDir, `${folder}_film.mp4`);
  const tmpDir = path.join(projectDir, ".export_tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  let canvas;
  try {
    // 1. Probe every clip (scene videos + bridge clips).
    const probes = [];
    for (const clip of clipPaths) {
      probes.push(await probeClip(clip));
    }

    // 2. Decide on one common canvas (project.settings.exportFormat overrides).
    canvas = chooseCanvas(probes, project.settings.exportFormat || formatToDims(project.settings.aspectRatio));
    const { width: W, height: H, fps: FPS } = canvas;
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=yuv420p`;

    // 3. Normalize each clip to the canvas — letterboxed (never stretched),
    //    constant fps, and always with an audio track so concat stays in sync.
    const normalized = [];
    for (let i = 0; i < clipPaths.length; i++) {
      const src = clipPaths[i];
      const dst = path.join(tmpDir, `norm_${i}.mp4`);
      if (probes[i].hasAudio) {
        await execFileAsync("ffmpeg", ["-y", "-i", src, "-vf", vf,
          "-c:v", "libx264", "-crf", "18", "-preset", "fast",
          "-c:a", "aac", "-ar", "48000", "-ac", "2", dst]);
      } else {
        await execFileAsync("ffmpeg", ["-y", "-i", src,
          "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
          "-filter_complex", `[0:v]${vf}[v]`, "-map", "[v]", "-map", "1:a:0",
          "-c:v", "libx264", "-crf", "18", "-preset", "fast",
          "-c:a", "aac", "-shortest", dst]);
      }
      normalized.push(dst);
    }

    // 4. Concatenate the now-uniform clips (lossless stream copy).
    const listFile = path.join(tmpDir, "concat_list.txt");
    fs.writeFileSync(listFile, normalized.map((p) => `file '${p}'`).join("\n"));
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-c", "copy", "-movflags", "+faststart", outputFile]);

    // 5. Optional continuous music track laid over the whole assembled film
    //    (no cuts at scene boundaries). Mixed under the per-scene sound, or
    //    louder when there is no per-scene sound.
    const musicRel = project.settings.useMusic && project.settings.musicPath;
    if (musicRel) {
      const musicAbs = path.resolve(projectDir, musicRel);
      if (fs.existsSync(musicAbs)) {
        const withMusic = path.join(tmpDir, "with_music.mp4");
        const musicVol = project.settings.generateSound ? 0.35 : 0.9;
        await execFileAsync("ffmpeg", ["-y", "-i", outputFile, "-stream_loop", "-1", "-i", musicAbs,
          "-filter_complex", `[1:a]volume=${musicVol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", withMusic]);
        fs.copyFileSync(withMusic, outputFile);
      }
    }
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const msg = (err.stderr || err.message || "").toString().slice(-400);
    return res.status(500).json({ error: `ffmpeg Fehler: ${msg}\n\nIst ffmpeg installiert? → brew install ffmpeg` });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  res.json({
    outputPath: outputFile,
    sceneCount: approvedScenes.length,
    fileName: path.basename(outputFile),
    format: canvas ? `${canvas.width}×${canvas.height} @ ${canvas.fps}fps` : undefined
  });
}));

/* ---------------- Musik (durchgehende Spur für den fertigen Film) ---------------- */

router.post("/projects/:folder/music", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { base64, filename } = req.body;
  if (!base64) return res.status(400).json({ error: "Keine Audiodatei." });
  const m = base64.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return res.status(400).json({ error: "Ungültiges Audio-Format." });
  const project = loadProject(workspaceRoot, req.params.folder);
  const projectDir = getProjectDir(workspaceRoot, req.params.folder);
  let ext = filename ? path.extname(filename).toLowerCase() : "";
  if (!ext) ext = m[1].includes("wav") ? ".wav" : m[1].includes("ogg") ? ".ogg" : ".mp3";
  const musicName = `music${ext}`;
  fs.writeFileSync(path.join(projectDir, musicName), Buffer.from(m[2], "base64"));
  project.settings.musicPath = musicName;
  project.settings.useMusic = true;
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

router.delete("/projects/:folder/music", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const project = loadProject(workspaceRoot, req.params.folder);
  const projectDir = getProjectDir(workspaceRoot, req.params.folder);
  if (project.settings.musicPath) {
    const abs = path.resolve(projectDir, project.settings.musicPath);
    if (abs.startsWith(path.resolve(projectDir)) && fs.existsSync(abs)) {
      try { fs.unlinkSync(abs); } catch { /* ignore */ }
    }
  }
  project.settings.musicPath = null;
  project.settings.useMusic = false;
  saveProject(workspaceRoot, req.params.folder, project);
  res.json({ project });
}));

/* ---------------- Statische Auslieferung von Projekt-Assets ---------------- */

router.get("/projects/:folder/assets/*", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const relPath = req.params[0];
  const projectDir = getProjectDir(workspaceRoot, req.params.folder);
  const absPath = path.resolve(projectDir, relPath);
  // Schutz vor Path-Traversal: absPath muss innerhalb projectDir liegen
  if (!absPath.startsWith(path.resolve(projectDir))) {
    return res.status(403).json({ error: "Ungültiger Pfad" });
  }
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: "Datei nicht gefunden" });
  }
  res.sendFile(absPath);
}));
