import fs from "fs";
import path from "path";
import { getVideoJobStatus, downloadVideoContent } from "./openrouter.js";
import { loadProject, saveProject } from "./projects.js";

// In-memory Tracking der aktiven Polling-Intervalle, key = `${folder}:${sceneId}`
const activePolls = new Map();

const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MINUTES = 20;

export function startVideoPolling({ apiKey, workspaceRoot, folder, sceneId, jobId }) {
  const key = `${folder}:${sceneId}`;
  if (activePolls.has(key)) {
    clearInterval(activePolls.get(key));
  }

  const startedAt = Date.now();

  const tick = async () => {
    try {
      const status = await getVideoJobStatus({ apiKey, jobId });
      const project = loadProject(workspaceRoot, folder);
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        stopPolling(key);
        return;
      }

      if (status.status === "completed") {
        stopPolling(key);
        const buffer = await downloadVideoContent({ apiKey, jobId, index: 0 });
        const clipsDir = path.join(workspaceRoot, folder, "clips");
        if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });
        const fileName = `scene_${scene.order}_${sceneId.slice(0, 8)}.mp4`;
        const filePath = path.join(clipsDir, fileName);
        fs.writeFileSync(filePath, buffer);

        scene.videoStatus = "ready";
        scene.videoPath = path.join("clips", fileName);
        scene.videoError = null;
        saveProject(workspaceRoot, folder, project);
      } else if (status.status === "failed" || status.status === "error") {
        stopPolling(key);
        scene.videoStatus = "error";
        scene.videoError = status.error?.message || "Video-Generierung fehlgeschlagen";
        saveProject(workspaceRoot, folder, project);
      } else {
        scene.videoStatus = "generating";
        scene.videoJobStatusRaw = status.status;
        scene.videoJobProgress = typeof status.progress === "number" ? Math.round(status.progress) : null;
        saveProject(workspaceRoot, folder, project);

        const elapsedMinutes = (Date.now() - startedAt) / 60000;
        if (elapsedMinutes > MAX_POLL_MINUTES) {
          stopPolling(key);
          scene.videoStatus = "error";
          scene.videoError = "Zeitüberschreitung beim Warten auf das Video.";
          saveProject(workspaceRoot, folder, project);
        }
      }
    } catch (err) {
      console.error(`Polling-Fehler für ${key}:`, err.message);
      try {
        const project = loadProject(workspaceRoot, folder);
        const scene = project.scenes.find((s) => s.id === sceneId);
        if (scene) {
          scene.videoStatus = "error";
          scene.videoError = err.message;
          saveProject(workspaceRoot, folder, project);
        }
      } catch {
        /* ignore */
      }
      stopPolling(key);
    }
  };

  function stopPolling(k) {
    const interval = activePolls.get(k);
    if (interval) clearInterval(interval);
    activePolls.delete(k);
  }

  const interval = setInterval(tick, POLL_INTERVAL_MS);
  activePolls.set(key, interval);
  // Sofortiger erster Check, nicht erst nach Intervall warten
  tick();
}

export function stopVideoPolling(folder, sceneId) {
  const key = `${folder}:${sceneId}`;
  const interval = activePolls.get(key);
  if (interval) {
    clearInterval(interval);
    activePolls.delete(key);
  }
}
