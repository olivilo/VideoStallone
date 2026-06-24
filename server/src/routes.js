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
  submitVideoJob,
  OpenRouterError,
  VIDEO_MODEL_CAPABILITIES,
  snapDuration
} from "./openrouter.js";
import {
  loadProjectCast,
  buildCastInjection,
  getCastReferenceUrls,
  getProjectCastDir
} from "./cast.js";

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
  "character transformation, gender change, species change, morphing, inconsistent character appearance, shape-shifting, body horror, anatomy errors";

function buildNegativePrompt(projectNegPrompt) {
  return projectNegPrompt?.trim() || DEFAULT_NEGATIVE_PROMPT;
}

function buildCharacterNote(characters) {
  return characters?.trim() ? ` Consistent characters: ${characters.trim()}.` : "";
}
import {
  buildScenePlanningMessages,
  parseScenePlanningResponse,
  buildSceneRefinementMessages
} from "./scenePrompts.js";
import { startVideoPolling } from "./videoJobManager.js";

export const router = express.Router();

function wrapAsync(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      const status = err instanceof OpenRouterError ? err.status || 500 : 500;
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
    defaultModels: cfg.defaultModels
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

  const imageModel = model || project.settings.imageModel || cfg.defaultModels.image;
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
    const urls = await generateImage({
      apiKey: cfg.openrouterApiKey,
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

/* ---------------- Video-Modelle Liste ---------------- */

router.get("/video-models", wrapAsync(async (req, res) => {
  const cfg = loadConfig();
  const data = await listVideoModels({ apiKey: cfg.openrouterApiKey });
  res.json(data);
}));

/* ---------------- Video-Generierung pro Szene ---------------- */

router.post("/projects/:folder/scenes/:sceneId/video", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { model, generateAudio, aspectRatio, resolution } = req.body;
  const cfg = loadConfig();
  const project = loadProject(workspaceRoot, req.params.folder);
  const scene = project.scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: "Szene nicht gefunden" });
  if (scene.storyboardStatus !== "approved") {
    return res.status(400).json({ error: "Storyboard muss erst freigegeben werden, bevor das Video generiert wird." });
  }

  const videoModel = model || project.settings.videoModel || cfg.defaultModels.video;
  if (!videoModel) {
    return res.status(400).json({ error: "Kein Video-Modell ausgewählt." });
  }

  const snapped = snapDuration(scene.durationSeconds, videoModel);
  if (snapped !== scene.durationSeconds) {
    console.log(`Dauer ${scene.durationSeconds}s → ${snapped}s angepasst für ${videoModel}`);
  }

  let frameImages;
  if (scene.storyboardImagePath) {
    const projectDir = getProjectDir(workspaceRoot, req.params.folder);
    const absImagePath = path.join(projectDir, scene.storyboardImagePath);
    if (fs.existsSync(absImagePath)) {
      const base64 = fs.readFileSync(absImagePath).toString("base64");
      frameImages = [
        {
          frame_type: "first_frame",
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64}` }
        }
      ];
    }
  }

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
    aspectRatio: aspectRatio || project.settings.defaultAspectRatio,
    duration: snapped,
    resolution,
    generateAudio: typeof generateAudio === "boolean" ? generateAudio : project.settings.defaultGenerateAudio,
    frameImages,
    seed,
    negativePrompt: negPrompt
  });

  scene.videoStatus = "queued";
  scene.videoJobId = job.id;
  scene.videoSeed = seed;
  scene.videoJobProgress = null;
  scene.hasAudio = Boolean(generateAudio ?? project.settings.defaultGenerateAudio);
  scene.videoError = null;
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
  res.json(VIDEO_MODEL_CAPABILITIES);
});

/* ---------------- Batch: Alle Szenen generieren ---------------- */

router.post("/projects/:folder/generate-all", wrapAsync(async (req, res) => {
  const folder = req.params.folder;
  const { workspaceRoot } = req.query;
  const { generateAudio } = req.body;
  const cfg = loadConfig();
  let project = loadProject(workspaceRoot, folder);

  const effectiveImageModel = project.settings.imageModel || cfg.defaultModels.image;
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
    for (let i = 0; i < project.scenes.length; i++) {
      project = loadProject(workspaceRoot, folder);
      const scene = project.scenes[i];
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
        const urls = await generateImage({
          apiKey: cfg.openrouterApiKey,
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
        project = loadProject(workspaceRoot, folder);
        const s = project.scenes.find((x) => x.id === scene.id);
        if (s) { s.storyboardStatus = "error"; saveProject(workspaceRoot, folder, project); }
      }
    }

    // Phase 2: Video-Job für jede freigegebene Szene starten
    project = loadProject(workspaceRoot, folder);
    for (const scene of project.scenes) {
      if (scene.storyboardStatus !== "approved") continue;
      if (["queued", "generating", "ready", "approved"].includes(scene.videoStatus)) continue;

      let frameImages;
      if (scene.storyboardImagePath) {
        const absImg = path.join(getProjectDir(workspaceRoot, folder), scene.storyboardImagePath);
        if (fs.existsSync(absImg)) {
          frameImages = [{ frame_type: "first_frame", type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(absImg).toString("base64")}` } }];
        }
      }

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
          aspectRatio: project.settings.defaultAspectRatio,
          duration: snapped,
          generateAudio: typeof generateAudio === "boolean" ? generateAudio : project.settings.defaultGenerateAudio,
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
          s.hasAudio = Boolean(generateAudio ?? project.settings.defaultGenerateAudio);
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

  const listFile = path.join(projectDir, ".concat_list.txt");
  fs.writeFileSync(listFile, approvedScenes.map((s) => `file '${path.resolve(projectDir, s.videoPath)}'`).join("\n"));

  const outputFile = path.join(projectDir, `${folder}_film.mp4`);

  try {
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-c:a", "aac", outputFile]);
  } catch (err) {
    try { fs.unlinkSync(listFile); } catch { /* ignore */ }
    const msg = (err.stderr || err.message || "").toString().slice(-300);
    return res.status(500).json({ error: `ffmpeg Fehler: ${msg}\n\nIst ffmpeg installiert? → brew install ffmpeg` });
  }
  try { fs.unlinkSync(listFile); } catch { /* ignore */ }

  res.json({ outputPath: outputFile, sceneCount: approvedScenes.length, fileName: path.basename(outputFile) });
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
