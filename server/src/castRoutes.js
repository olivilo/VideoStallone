import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { loadConfig } from "./config.js";
import {
  loadGlobalCast, saveGlobalCast, getGlobalCastDir,
  loadProjectCast, saveProjectCast, getProjectCastDir,
  newCastEntry
} from "./cast.js";
import { generateImage, chatCompletion, OpenRouterError } from "./openrouter.js";

export const castRouter = express.Router();

function wrapAsync(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch(err => {
    console.error(err);
    const status = err instanceof OpenRouterError ? err.status || 500 : 500;
    res.status(status).json({ error: err.message || "Fehler" });
  });
}

function photoToDataUrl(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const buf = fs.readFileSync(absPath);
  const ext = path.extname(absPath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function getPhotoDataUrls(castDir, entry) {
  return (entry.photos || [])
    .map(p => photoToDataUrl(path.join(castDir, p)))
    .filter(Boolean)
    .slice(0, 4);
}

function savePhoto(dir, base64, filename) {
  const photosDir = path.join(dir, "photos");
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
  const safeFilename = `${uuidv4()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dataMatch = base64.match(/^data:([^;]+);base64,(.+)$/s);
  if (!dataMatch) throw new Error("Ungültiges base64-Format");
  fs.writeFileSync(path.join(photosDir, safeFilename), Buffer.from(dataMatch[2], "base64"));
  return `photos/${safeFilename}`;
}

async function generateReference(entry, castDir, imageModel, apiKey) {
  const photoUrls = getPhotoDataUrls(castDir, entry);
  const desc = [entry.description, entry.styleNotes].filter(Boolean).join(". ");
  const prompt = `Detailed reference portrait/view of "${entry.name}". ${desc}. Consistent design, clear details, neutral background.`;
  const urls = await generateImage({ apiKey, model: imageModel, prompt, referenceImageUrls: photoUrls });
  const dataUrl = urls[0];
  const refDir = path.join(castDir, "references");
  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
  const fileName = `${entry.id}_ref.png`;
  if (dataUrl.startsWith("data:")) {
    fs.writeFileSync(path.join(refDir, fileName), Buffer.from(dataUrl.split(",")[1], "base64"));
  } else {
    const fetched = await fetch(dataUrl);
    fs.writeFileSync(path.join(refDir, fileName), Buffer.from(await fetched.arrayBuffer()));
  }
  return `references/${fileName}`;
}

async function generateDescription(entry, castDir, textModel, apiKey) {
  const photoUrls = getPhotoDataUrls(castDir, entry);
  const notes = [entry.description, entry.styleNotes, entry.role].filter(Boolean).join(". ");
  const userContent = [
    {
      type: "text",
      text: `Write a precise 2-3 sentence visual description of "${entry.name}" (type: ${entry.type}) for use in AI image/video generation prompts. Focus on appearance, clothing/design, and distinctive features that must stay consistent across all scenes. Notes: ${notes || "(no additional notes)"}`
    },
    ...photoUrls.map(url => ({ type: "image_url", image_url: { url } }))
  ];
  return await chatCompletion({ apiKey, model: textModel, messages: [{ role: "user", content: userContent }] });
}

// ─── GLOBAL CAST ─────────────────────────────────────────────────────────────

castRouter.get("/cast/global", (req, res) => {
  res.json({ cast: loadGlobalCast() });
});

castRouter.post("/cast/global", (req, res) => {
  const entries = loadGlobalCast();
  const entry = newCastEntry(req.body);
  entries.push(entry);
  saveGlobalCast(entries);
  res.json({ entry });
});

castRouter.put("/cast/global/:id", (req, res) => {
  const entries = loadGlobalCast();
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Nicht gefunden" });
  entries[idx] = { ...entries[idx], ...req.body, id: entries[idx].id, updatedAt: new Date().toISOString() };
  saveGlobalCast(entries);
  res.json({ entry: entries[idx] });
});

castRouter.delete("/cast/global/:id", (req, res) => {
  saveGlobalCast(loadGlobalCast().filter(e => e.id !== req.params.id));
  res.json({ ok: true });
});

castRouter.post("/cast/global/:id/photo", wrapAsync(async (req, res) => {
  const { base64, filename } = req.body;
  if (!base64 || !filename) return res.status(400).json({ error: "base64 und filename fehlen" });
  const entries = loadGlobalCast();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const relPath = savePhoto(getGlobalCastDir(), base64, filename);
  entry.photos = [...(entry.photos || []), relPath];
  entry.updatedAt = new Date().toISOString();
  saveGlobalCast(entries);
  res.json({ entry });
}));

castRouter.delete("/cast/global/:id/photo", wrapAsync(async (req, res) => {
  const { photoPath } = req.body;
  const entries = loadGlobalCast();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const dir = getGlobalCastDir();
  const abs = path.resolve(dir, photoPath);
  if (abs.startsWith(path.resolve(dir)) && fs.existsSync(abs)) try { fs.unlinkSync(abs); } catch {}
  entry.photos = (entry.photos || []).filter(p => p !== photoPath);
  entry.updatedAt = new Date().toISOString();
  saveGlobalCast(entries);
  res.json({ entry });
}));

castRouter.post("/cast/global/:id/set-reference-photo", wrapAsync(async (req, res) => {
  const { photoPath } = req.body;
  if (!photoPath) return res.status(400).json({ error: "photoPath fehlt" });
  const castDir = getGlobalCastDir();
  const srcAbs = path.resolve(castDir, photoPath);
  if (!srcAbs.startsWith(path.resolve(castDir))) return res.status(403).json({ error: "Ungültig" });
  if (!fs.existsSync(srcAbs)) return res.status(404).json({ error: "Foto nicht gefunden" });
  const entries = loadGlobalCast();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const refDir = path.join(castDir, "references");
  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
  const fileName = `${entry.id}_ref${path.extname(photoPath)}`;
  fs.copyFileSync(srcAbs, path.join(refDir, fileName));
  entry.referenceImagePath = `references/${fileName}`;
  entry.updatedAt = new Date().toISOString();
  saveGlobalCast(entries);
  res.json({ entry });
}));

castRouter.post("/cast/global/:id/generate-reference", wrapAsync(async (req, res) => {
  const { imageModel, draft } = req.body;
  const cfg = loadConfig();
  const entries = loadGlobalCast();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  if (draft) Object.assign(entry, { ...draft, id: entry.id, photos: entry.photos, referenceImagePath: entry.referenceImagePath });
  entry.referenceImagePath = await generateReference(entry, getGlobalCastDir(), imageModel || cfg.defaultModels.image, cfg.openrouterApiKey);
  entry.updatedAt = new Date().toISOString();
  saveGlobalCast(entries);
  res.json({ entry });
}));

castRouter.post("/cast/global/:id/generate-description", wrapAsync(async (req, res) => {
  const { textModel, draft } = req.body;
  const cfg = loadConfig();
  const entries = loadGlobalCast();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  if (draft) Object.assign(entry, { ...draft, id: entry.id, photos: entry.photos, referenceImagePath: entry.referenceImagePath });
  entry.aiDescription = (await generateDescription(entry, getGlobalCastDir(), textModel || cfg.defaultModels.text, cfg.openrouterApiKey)).trim();
  entry.updatedAt = new Date().toISOString();
  saveGlobalCast(entries);
  res.json({ entry });
}));

castRouter.get("/cast/global/assets/*", (req, res) => {
  const dir = getGlobalCastDir();
  const abs = path.resolve(dir, req.params[0]);
  if (!abs.startsWith(path.resolve(dir))) return res.status(403).json({ error: "Ungültig" });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "Nicht gefunden" });
  res.sendFile(abs);
});

// ─── PROJECT CAST ─────────────────────────────────────────────────────────────

castRouter.get("/projects/:folder/cast", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  res.json({ cast: loadProjectCast(workspaceRoot, req.params.folder) });
}));

castRouter.post("/projects/:folder/cast", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = newCastEntry(req.body);
  cast.push(entry);
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

castRouter.put("/projects/:folder/cast/:id", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const idx = cast.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Nicht gefunden" });
  cast[idx] = { ...cast[idx], ...req.body, id: cast[idx].id, updatedAt: new Date().toISOString() };
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry: cast[idx] });
}));

castRouter.delete("/projects/:folder/cast/:id", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  saveProjectCast(workspaceRoot, req.params.folder, loadProjectCast(workspaceRoot, req.params.folder).filter(e => e.id !== req.params.id));
  res.json({ ok: true });
}));

castRouter.post("/projects/:folder/cast/:id/photo", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { base64, filename } = req.body;
  if (!base64 || !filename) return res.status(400).json({ error: "base64 und filename fehlen" });
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
  entry.photos = [...(entry.photos || []), savePhoto(castDir, base64, filename)];
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

castRouter.delete("/projects/:folder/cast/:id/photo", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { photoPath } = req.body;
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
  const abs = path.resolve(castDir, photoPath);
  if (abs.startsWith(path.resolve(castDir)) && fs.existsSync(abs)) try { fs.unlinkSync(abs); } catch {}
  entry.photos = (entry.photos || []).filter(p => p !== photoPath);
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

castRouter.post("/projects/:folder/cast/:id/set-reference-photo", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { photoPath } = req.body;
  if (!photoPath) return res.status(400).json({ error: "photoPath fehlt" });
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
  const srcAbs = path.resolve(castDir, photoPath);
  if (!srcAbs.startsWith(path.resolve(castDir))) return res.status(403).json({ error: "Ungültig" });
  if (!fs.existsSync(srcAbs)) return res.status(404).json({ error: "Foto nicht gefunden" });
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  const refDir = path.join(castDir, "references");
  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
  const fileName = `${entry.id}_ref${path.extname(photoPath)}`;
  fs.copyFileSync(srcAbs, path.join(refDir, fileName));
  entry.referenceImagePath = `references/${fileName}`;
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

castRouter.post("/projects/:folder/cast/:id/generate-reference", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { imageModel, draft } = req.body;
  const cfg = loadConfig();
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  if (draft) Object.assign(entry, { ...draft, id: entry.id, photos: entry.photos, referenceImagePath: entry.referenceImagePath });
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
  entry.referenceImagePath = await generateReference(entry, castDir, imageModel || cfg.defaultModels.image, cfg.openrouterApiKey);
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

castRouter.post("/projects/:folder/cast/:id/generate-description", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const { textModel, draft } = req.body;
  const cfg = loadConfig();
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });
  if (draft) Object.assign(entry, { ...draft, id: entry.id, photos: entry.photos, referenceImagePath: entry.referenceImagePath });
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
  entry.aiDescription = (await generateDescription(entry, castDir, textModel || cfg.defaultModels.text, cfg.openrouterApiKey)).trim();
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry });
}));

// Import a global entry into the project (makes a copy)
castRouter.post("/projects/:folder/cast/import/:globalId", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const globalCast = loadGlobalCast();
  const globalEntry = globalCast.find(e => e.id === req.params.globalId);
  if (!globalEntry) return res.status(404).json({ error: "Globaler Eintrag nicht gefunden" });

  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  if (cast.find(e => e.sourceGlobalId === req.params.globalId)) {
    return res.status(400).json({ error: "Bereits importiert" });
  }

  const globalDir = getGlobalCastDir();
  const castDir = getProjectCastDir(workspaceRoot, req.params.folder);

  // Copy reference image if present
  let newRefPath = null;
  if (globalEntry.referenceImagePath) {
    const srcPath = path.join(globalDir, globalEntry.referenceImagePath);
    if (fs.existsSync(srcPath)) {
      const refDir = path.join(castDir, "references");
      if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
      const ext = path.extname(globalEntry.referenceImagePath) || ".png";
      const destName = `${globalEntry.id}_imported_ref${ext}`;
      fs.copyFileSync(srcPath, path.join(refDir, destName));
      newRefPath = `references/${destName}`;
    }
  }

  // Copy photos
  const copiedPhotos = [];
  for (const photoRel of globalEntry.photos || []) {
    const srcPath = path.join(globalDir, photoRel);
    if (fs.existsSync(srcPath)) {
      const photosDir = path.join(castDir, "photos");
      if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
      const destName = `imported_${path.basename(photoRel)}`;
      fs.copyFileSync(srcPath, path.join(photosDir, destName));
      copiedPhotos.push(`photos/${destName}`);
    }
  }

  const newEntry = newCastEntry({
    ...globalEntry,
    id: uuidv4(),
    photos: copiedPhotos,
    referenceImagePath: newRefPath,
    sourceGlobalId: req.params.globalId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  cast.push(newEntry);
  saveProjectCast(workspaceRoot, req.params.folder, cast);
  res.json({ entry: newEntry });
}));

// Push a project entry to the global library
castRouter.post("/projects/:folder/cast/:id/push-global", wrapAsync(async (req, res) => {
  const { workspaceRoot } = req.query;
  const cast = loadProjectCast(workspaceRoot, req.params.folder);
  const entry = cast.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Nicht gefunden" });

  const globalCast = loadGlobalCast();
  const globalDir = getGlobalCastDir();

  let newRefPath = null;
  if (entry.referenceImagePath) {
    const castDir = getProjectCastDir(workspaceRoot, req.params.folder);
    const srcPath = path.join(castDir, entry.referenceImagePath);
    if (fs.existsSync(srcPath)) {
      const refDir = path.join(globalDir, "references");
      if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
      const destName = `${entry.sourceGlobalId || entry.id}_ref.png`;
      fs.copyFileSync(srcPath, path.join(refDir, destName));
      newRefPath = `references/${destName}`;
    }
  }

  const globalId = entry.sourceGlobalId || entry.id;
  const globalEntry = newCastEntry({
    ...entry,
    id: globalId,
    photos: [],
    referenceImagePath: newRefPath,
    sourceGlobalId: null,
    updatedAt: new Date().toISOString()
  });

  const existingIdx = globalCast.findIndex(e => e.id === globalId);
  if (existingIdx >= 0) globalCast[existingIdx] = globalEntry;
  else globalCast.push(globalEntry);
  saveGlobalCast(globalCast);

  entry.sourceGlobalId = globalId;
  entry.updatedAt = new Date().toISOString();
  saveProjectCast(workspaceRoot, req.params.folder, cast);

  res.json({ entry, globalEntry });
}));
