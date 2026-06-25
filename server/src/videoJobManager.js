import fs from "fs";
import path from "path";
import { getVideoJobStatus, downloadVideoContent } from "./openrouter.js";
import { loadProject, saveProject } from "./projects.js";

// In-memory Tracking der aktiven Polling-Intervalle, key = `${folder}:${sceneId}`
const activePolls = new Map();

const POLL_INTERVAL_MS = 8000;
const MAX_POLL_MINUTES = 20;

// Field names written on the scene depending on whether we poll the scene's own
// video or its outgoing transition (bridge) clip — so both can run in parallel.
function fieldsFor(target, scene, sceneId) {
  if (target === "transition") {
    return {
      status: "transitionVideoStatus",
      pathF: "transitionVideoPath",
      err: "transitionVideoError",
      prog: "transitionVideoProgress",
      raw: "transitionVideoStatusRaw",
      file: `transition_${scene.order}_${sceneId.slice(0, 8)}.mp4`
    };
  }
  return {
    status: "videoStatus",
    pathF: "videoPath",
    err: "videoError",
    prog: "videoJobProgress",
    raw: "videoJobStatusRaw",
    file: `scene_${scene.order}_${sceneId.slice(0, 8)}.mp4`
  };
}

export function startVideoPolling({ apiKey, workspaceRoot, folder, sceneId, jobId, target = "video" }) {
  const key = `${folder}:${sceneId}:${target}`;
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
      const F = fieldsFor(target, scene, sceneId);

      if (status.status === "completed") {
        stopPolling(key);
        const buffer = await downloadVideoContent({ apiKey, jobId, index: 0 });
        const clipsDir = path.join(workspaceRoot, folder, "clips");
        if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });
        const filePath = path.join(clipsDir, F.file);
        fs.writeFileSync(filePath, buffer);

        scene[F.status] = "ready";
        scene[F.pathF] = path.join("clips", F.file);
        scene[F.err] = null;
        saveProject(workspaceRoot, folder, project);
      } else if (status.status === "failed" || status.status === "error") {
        stopPolling(key);
        scene[F.status] = "error";
        scene[F.err] = status.error?.message || "Video-Generierung fehlgeschlagen";
        saveProject(workspaceRoot, folder, project);
      } else {
        scene[F.status] = "generating";
        scene[F.raw] = status.status;
        scene[F.prog] = typeof status.progress === "number" ? Math.round(status.progress) : null;
        saveProject(workspaceRoot, folder, project);

        const elapsedMinutes = (Date.now() - startedAt) / 60000;
        if (elapsedMinutes > MAX_POLL_MINUTES) {
          stopPolling(key);
          scene[F.status] = "error";
          scene[F.err] = "Zeitüberschreitung beim Warten auf das Video.";
          saveProject(workspaceRoot, folder, project);
        }
      }
    } catch (err) {
      console.error(`Polling-Fehler für ${key}:`, err.message);
      try {
        const project = loadProject(workspaceRoot, folder);
        const scene = project.scenes.find((s) => s.id === sceneId);
        if (scene) {
          const F = fieldsFor(target, scene, sceneId);
          scene[F.status] = "error";
          scene[F.err] = err.message;
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

export function isPollingActive(folder, sceneId, target = "video") {
  return activePolls.has(`${folder}:${sceneId}:${target}`);
}

export function stopVideoPolling(folder, sceneId, target = "video") {
  const key = `${folder}:${sceneId}:${target}`;
  const interval = activePolls.get(key);
  if (interval) {
    clearInterval(interval);
    activePolls.delete(key);
  }
}
