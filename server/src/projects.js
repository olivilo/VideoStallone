import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { ensureDir, resolveSafePath } from "./fsBrowser.js";

const PROJECT_FILE_NAME = "project.json";

function emptyProject({ id, name }) {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idea: "",
    settings: {
      textModel: "",
      imageModel: "",
      videoModel: "",
      defaultAspectRatio: "16:9",
      defaultGenerateAudio: false
    },
    scenes: []
    // scene shape:
    // {
    //   id, order, title, description, camera, transitionIn,
    //   storyboardStatus: 'pending'|'generating'|'ready'|'approved'|'error',
    //   storyboardImageUrl, storyboardImagePath,
    //   videoStatus: 'idle'|'queued'|'generating'|'ready'|'approved'|'error',
    //   videoJobId, videoPath, hasAudio, errorMessage
    // }
  };
}

export function listProjects(workspaceRoot) {
  const root = resolveSafePath(workspaceRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectFile = path.join(root, entry.name, PROJECT_FILE_NAME);
    if (fs.existsSync(projectFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
        projects.push({
          id: data.id,
          name: data.name,
          folder: entry.name,
          updatedAt: data.updatedAt,
          sceneCount: data.scenes?.length || 0
        });
      } catch (err) {
        console.warn(`Konnte Projekt in ${entry.name} nicht lesen:`, err.message);
      }
    }
  }
  return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getProjectDir(workspaceRoot, folderName) {
  return path.join(resolveSafePath(workspaceRoot), folderName);
}

export function createProject(workspaceRoot, name) {
  const root = resolveSafePath(workspaceRoot);
  ensureDir(root);
  const safeFolder = name.trim().replace(/[\\/:*?"<>|]/g, "_") || "Projekt";
  let folderName = safeFolder;
  let counter = 1;
  while (fs.existsSync(path.join(root, folderName))) {
    folderName = `${safeFolder}_${counter++}`;
  }
  const projectDir = path.join(root, folderName);
  ensureDir(projectDir);
  ensureDir(path.join(projectDir, "storyboards"));
  ensureDir(path.join(projectDir, "clips"));

  const project = emptyProject({ id: uuidv4(), name: name.trim() || folderName });
  saveProject(workspaceRoot, folderName, project);
  return { project, folder: folderName };
}

export function loadProject(workspaceRoot, folderName) {
  const projectFile = path.join(getProjectDir(workspaceRoot, folderName), PROJECT_FILE_NAME);
  if (!fs.existsSync(projectFile)) {
    throw new Error(`Kein Projekt gefunden in ${folderName}`);
  }
  return JSON.parse(fs.readFileSync(projectFile, "utf-8"));
}

export function saveProject(workspaceRoot, folderName, project) {
  const projectDir = getProjectDir(workspaceRoot, folderName);
  ensureDir(projectDir);
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(projectDir, PROJECT_FILE_NAME),
    JSON.stringify(project, null, 2)
  );
  return project;
}

export function deleteProject(workspaceRoot, folderName) {
  const projectDir = getProjectDir(workspaceRoot, folderName);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

export function newSceneId() {
  return uuidv4();
}
