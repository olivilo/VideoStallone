import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { getProjectDir } from "./projects.js";

const GLOBAL_CAST_DIR = path.join(os.homedir(), ".videostallone", "cast");
const GLOBAL_CAST_FILE = path.join(GLOBAL_CAST_DIR, "cast.json");

function ensureCastDirs(dir) {
  for (const d of [dir, path.join(dir, "photos"), path.join(dir, "references")]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export function getGlobalCastDir() { return GLOBAL_CAST_DIR; }

export function getProjectCastDir(workspaceRoot, folder) {
  return path.join(getProjectDir(workspaceRoot, folder), "cast");
}

export function loadGlobalCast() {
  ensureCastDirs(GLOBAL_CAST_DIR);
  if (!fs.existsSync(GLOBAL_CAST_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(GLOBAL_CAST_FILE, "utf-8")); }
  catch { return []; }
}

export function saveGlobalCast(entries) {
  ensureCastDirs(GLOBAL_CAST_DIR);
  fs.writeFileSync(GLOBAL_CAST_FILE, JSON.stringify(entries, null, 2));
}

export function loadProjectCast(workspaceRoot, folder) {
  const dir = getProjectCastDir(workspaceRoot, folder);
  const file = path.join(dir, "cast.json");
  ensureCastDirs(dir);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch { return []; }
}

export function saveProjectCast(workspaceRoot, folder, entries) {
  const dir = getProjectCastDir(workspaceRoot, folder);
  ensureCastDirs(dir);
  fs.writeFileSync(path.join(dir, "cast.json"), JSON.stringify(entries, null, 2));
}

export function newCastEntry(partial = {}) {
  return {
    id: uuidv4(),
    type: "character",
    name: "",
    role: "",
    description: "",
    aiDescription: "",
    styleNotes: "",
    photos: [],
    referenceImagePath: null,
    injectAlways: true,
    injectKeywords: [],
    sourceGlobalId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial
  };
}

export function buildCastInjection(entries, sceneText = "") {
  const lower = sceneText.toLowerCase();
  const relevant = entries.filter(e => {
    if (e.injectAlways) return true;
    return e.injectKeywords?.some(k => k && lower.includes(k.toLowerCase()));
  });
  if (!relevant.length) return "";
  return " Consistent cast & entities: " + relevant.map(e => {
    const desc = (e.aiDescription || e.description || "").trim();
    return desc ? `[${e.name}: ${desc}]` : `[${e.name}]`;
  }).join(" ");
}

export function getCastReferenceUrls(entries, castDir) {
  return entries
    .filter(e => e.referenceImagePath && e.injectAlways)
    .map(e => {
      const absPath = path.join(castDir, e.referenceImagePath);
      if (!fs.existsSync(absPath)) return null;
      const buf = fs.readFileSync(absPath);
      return `data:image/png;base64,${buf.toString("base64")}`;
    })
    .filter(Boolean)
    .slice(0, 3); // max 3 reference images per generation
}
