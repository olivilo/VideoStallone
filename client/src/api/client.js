const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error || `Anfrage fehlgeschlagen (${res.status})`);
  }
  return data;
}

function qs(params) {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return clean.length ? `?${new URLSearchParams(clean).toString()}` : "";
}

export const api = {
  // Settings
  getSettings: () => request("/settings"),
  setApiKey: (apiKey) => request("/settings/api-key", { method: "POST", body: JSON.stringify({ apiKey }) }),
  setDefaultModels: (models) => request("/settings/default-models", { method: "POST", body: JSON.stringify(models) }),
  setImageProvider: (imageProvider, comfyui) => request("/settings/image-provider", { method: "POST", body: JSON.stringify({ imageProvider, comfyui }) }),
  listComfyModels: () => request("/comfyui/models"),

  // Filesystem
  browse: (path) => request(`/fs/browse${qs({ path })}`),
  createFolder: (parentPath, name) => request("/fs/create-folder", { method: "POST", body: JSON.stringify({ parentPath, name }) }),
  selectWorkspace: (folderPath) => request("/workspace/select", { method: "POST", body: JSON.stringify({ folderPath }) }),

  // Projects
  listProjects: (workspaceRoot) => request(`/projects${qs({ workspaceRoot })}`),
  createProject: (workspaceRoot, name) => request("/projects", { method: "POST", body: JSON.stringify({ workspaceRoot, name }) }),
  getProject: (workspaceRoot, folder) => request(`/projects/${folder}${qs({ workspaceRoot })}`),
  deleteProject: (workspaceRoot, folder) => request(`/projects/${folder}${qs({ workspaceRoot })}`, { method: "DELETE" }),
  updateProjectSettings: (workspaceRoot, folder, settings) =>
    request(`/projects/${folder}/settings${qs({ workspaceRoot })}`, { method: "PUT", body: JSON.stringify(settings) }),

  // Planning
  planScenes: (workspaceRoot, folder, idea, targetSceneCount, model) =>
    request(`/projects/${folder}/plan${qs({ workspaceRoot })}`, {
      method: "POST",
      body: JSON.stringify({ idea, targetSceneCount, model })
    }),
  replanScenes: (workspaceRoot, folder, instruction, model) =>
    request(`/projects/${folder}/replan${qs({ workspaceRoot })}`, {
      method: "POST",
      body: JSON.stringify({ instruction, model })
    }),

  // Scenes
  updateScene: (workspaceRoot, folder, sceneId, fields) =>
    request(`/projects/${folder}/scenes/${sceneId}${qs({ workspaceRoot })}`, { method: "PUT", body: JSON.stringify(fields) }),
  reorderScenes: (workspaceRoot, folder, sceneIdsInOrder) =>
    request(`/projects/${folder}/scenes/reorder${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ sceneIdsInOrder }) }),
  setSceneTransition: (workspaceRoot, folder, sceneId, type, durationMs, durationSeconds) =>
    request(`/projects/${folder}/scenes/${sceneId}/transition${qs({ workspaceRoot })}`, { method: "PUT", body: JSON.stringify({ type, durationMs, durationSeconds }) }),
  generateTransitionVideo: (workspaceRoot, folder, sceneId, model) =>
    request(`/projects/${folder}/scenes/${sceneId}/transition-video${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ model }) }),
  deleteScene: (workspaceRoot, folder, sceneId) =>
    request(`/projects/${folder}/scenes/${sceneId}${qs({ workspaceRoot })}`, { method: "DELETE" }),

  // Storyboard
  generateStoryboard: (workspaceRoot, folder, sceneId, model) =>
    request(`/projects/${folder}/scenes/${sceneId}/storyboard${qs({ workspaceRoot })}`, {
      method: "POST",
      body: JSON.stringify({ model })
    }),
  approveStoryboard: (workspaceRoot, folder, sceneId) =>
    request(`/projects/${folder}/scenes/${sceneId}/storyboard/approve${qs({ workspaceRoot })}`, { method: "POST" }),
  restoreStoryboardVariant: (workspaceRoot, folder, sceneId, variantIndex) =>
    request(`/projects/${folder}/scenes/${sceneId}/storyboard/restore-variant${qs({ workspaceRoot })}`, {
      method: "POST", body: JSON.stringify({ variantIndex })
    }),
  restoreVideoVariant: (workspaceRoot, folder, sceneId, variantIndex) =>
    request(`/projects/${folder}/scenes/${sceneId}/video/restore-variant${qs({ workspaceRoot })}`, {
      method: "POST", body: JSON.stringify({ variantIndex })
    }),

  snapAllDurations: (workspaceRoot, folder, model) =>
    request(`/projects/${folder}/snap-durations${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ model }) }),

  // Models
  listVideoModels: () => request("/video-models"),
  listTextModels: () => request("/text-models"),
  listImageModels: () => request("/image-models"),
  getVideoModelCapabilities: () => request("/video-models/capabilities"),
  generateVideo: (workspaceRoot, folder, sceneId, options) =>
    request(`/projects/${folder}/scenes/${sceneId}/video${qs({ workspaceRoot })}`, {
      method: "POST",
      body: JSON.stringify(options)
    }),
  approveVideo: (workspaceRoot, folder, sceneId) =>
    request(`/projects/${folder}/scenes/${sceneId}/video/approve${qs({ workspaceRoot })}`, { method: "POST" }),

  // Batch
  generateAll: (workspaceRoot, folder, options) =>
    request(`/projects/${folder}/generate-all${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify(options) }),
  generateStoryboards: (workspaceRoot, folder) =>
    request(`/projects/${folder}/generate-storyboards${qs({ workspaceRoot })}`, { method: "POST" }),
  exportFilm: (workspaceRoot, folder, options) =>
    request(`/projects/${folder}/export${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify(options) }),
  uploadMusic: (workspaceRoot, folder, base64, filename) =>
    request(`/projects/${folder}/music${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ base64, filename }) }),
  deleteMusic: (workspaceRoot, folder) =>
    request(`/projects/${folder}/music${qs({ workspaceRoot })}`, { method: "DELETE" }),

  assetUrl: (workspaceRoot, folder, relPath) =>
    `${BASE}/projects/${folder}/assets/${relPath}${qs({ workspaceRoot })}`,

  // Global Cast
  listGlobalCast: () => request("/cast/global"),
  createGlobalCast: (entry) => request("/cast/global", { method: "POST", body: JSON.stringify(entry) }),
  updateGlobalCast: (id, data) => request(`/cast/global/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteGlobalCast: (id) => request(`/cast/global/${id}`, { method: "DELETE" }),
  uploadGlobalCastPhoto: (id, base64, filename) => request(`/cast/global/${id}/photo`, { method: "POST", body: JSON.stringify({ base64, filename }) }),
  deleteGlobalCastPhoto: (id, photoPath) => request(`/cast/global/${id}/photo`, { method: "DELETE", body: JSON.stringify({ photoPath }) }),
  setGlobalCastReferencePhoto: (id, photoPath) => request(`/cast/global/${id}/set-reference-photo`, { method: "POST", body: JSON.stringify({ photoPath }) }),
  generateGlobalCastReference: (id, imageModel, draft) => request(`/cast/global/${id}/generate-reference`, { method: "POST", body: JSON.stringify({ imageModel, draft }) }),
  generateGlobalCastDescription: (id, textModel, draft) => request(`/cast/global/${id}/generate-description`, { method: "POST", body: JSON.stringify({ textModel, draft }) }),
  globalCastAssetUrl: (relPath) => `${BASE}/cast/global/assets/${relPath}`,

  // Project Cast
  listProjectCast: (workspaceRoot, folder) => request(`/projects/${folder}/cast${qs({ workspaceRoot })}`),
  createProjectCast: (workspaceRoot, folder, entry) => request(`/projects/${folder}/cast${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify(entry) }),
  updateProjectCast: (workspaceRoot, folder, id, data) => request(`/projects/${folder}/cast/${id}${qs({ workspaceRoot })}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProjectCast: (workspaceRoot, folder, id) => request(`/projects/${folder}/cast/${id}${qs({ workspaceRoot })}`, { method: "DELETE" }),
  uploadProjectCastPhoto: (workspaceRoot, folder, id, base64, filename) => request(`/projects/${folder}/cast/${id}/photo${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ base64, filename }) }),
  deleteProjectCastPhoto: (workspaceRoot, folder, id, photoPath) => request(`/projects/${folder}/cast/${id}/photo${qs({ workspaceRoot })}`, { method: "DELETE", body: JSON.stringify({ photoPath }) }),
  setProjectCastReferencePhoto: (workspaceRoot, folder, id, photoPath) => request(`/projects/${folder}/cast/${id}/set-reference-photo${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ photoPath }) }),
  generateProjectCastReference: (workspaceRoot, folder, id, imageModel, draft) => request(`/projects/${folder}/cast/${id}/generate-reference${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ imageModel, draft }) }),
  generateProjectCastDescription: (workspaceRoot, folder, id, textModel, draft) => request(`/projects/${folder}/cast/${id}/generate-description${qs({ workspaceRoot })}`, { method: "POST", body: JSON.stringify({ textModel, draft }) }),
  importGlobalCast: (workspaceRoot, folder, globalId) => request(`/projects/${folder}/cast/import/${globalId}${qs({ workspaceRoot })}`, { method: "POST" }),
  pushCastToGlobal: (workspaceRoot, folder, id) => request(`/projects/${folder}/cast/${id}/push-global${qs({ workspaceRoot })}`, { method: "POST" }),
  projectCastAssetUrl: (workspaceRoot, folder, relPath) => `${BASE}/projects/${folder}/assets/cast/${relPath}${qs({ workspaceRoot })}`,
};
