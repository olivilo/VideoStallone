import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".videostallone");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
// API-Key wird separat mit restriktiven Dateiberechtigungen gespeichert (nur Owner lesbar)
const KEY_FILE = path.join(CONFIG_DIR, ".api_key");

const DEFAULT_CONFIG = {
  workspaceRoot: "",
  recentWorkspaces: [],
  defaultModels: {
    text: "anthropic/claude-sonnet-4.5",
    image: "google/gemini-2.5-flash-image",
    video: ""
  }
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    // Verzeichnis selbst nur für Owner zugänglich
    fs.chmodSync(CONFIG_DIR, 0o700);
  }
}

export function loadApiKey() {
  if (!fs.existsSync(KEY_FILE)) return "";
  try {
    return fs.readFileSync(KEY_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

export function saveApiKey(apiKey) {
  ensureConfigDir();
  fs.writeFileSync(KEY_FILE, apiKey, { mode: 0o600 });
}

export function loadConfig() {
  ensureConfigDir();
  let parsed = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (err) {
      console.error("Konnte config.json nicht lesen, nutze Defaults:", err.message);
    }
  }
  // Migriere alten Klartext-Key aus config.json falls vorhanden
  if (parsed.openrouterApiKey && !fs.existsSync(KEY_FILE)) {
    saveApiKey(parsed.openrouterApiKey);
    delete parsed.openrouterApiKey;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(parsed, null, 2));
  }
  return { ...DEFAULT_CONFIG, ...parsed, openrouterApiKey: loadApiKey() };
}

export function saveConfig(partial) {
  ensureConfigDir();
  const current = loadConfig();
  const { openrouterApiKey, ...rest } = partial;
  if (openrouterApiKey !== undefined) {
    saveApiKey(openrouterApiKey);
  }
  const next = { ...current, ...rest };
  const { openrouterApiKey: _drop, ...toWrite } = next;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toWrite, null, 2));
  return next;
}

export function addRecentWorkspace(folderPath) {
  const cfg = loadConfig();
  const recents = cfg.recentWorkspaces.filter((p) => p !== folderPath);
  recents.unshift(folderPath);
  return saveConfig({
    workspaceRoot: folderPath,
    recentWorkspaces: recents.slice(0, 10)
  });
}

export { CONFIG_DIR, CONFIG_FILE, KEY_FILE };
