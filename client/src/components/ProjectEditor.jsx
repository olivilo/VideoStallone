import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import IdeaInput from "./IdeaInput";
import SceneCard from "./SceneCard";
import RefinementBar from "./RefinementBar";
import CastPanel from "./CastPanel";
import ModelSelect from "./ModelSelect";
import CostBar from "./CostBar";
import { setLiveCapabilities } from "../videoModelCapabilities";

// Preisangaben pro Sekunde (Stand Juni 2026, Quelle: OpenRouter)
const VIDEO_PRICING_MAP = {
  "google/veo-3.1":              { price: "$0.20–0.60/s", pricePerSec: 0.40,  badge: "🏆 Premium" },
  "google/veo-3.1-fast":         { price: "$0.08–0.30/s", pricePerSec: 0.19,  badge: "⚡ Empfohlen" },
  "google/veo-3.1-lite":         { price: "$0.03–0.08/s", pricePerSec: 0.055, badge: "💰 Günstig" },
  "kuaishou/kling-v3-pro":       { price: "$0.112/s · $0.168/s mit Audio", pricePerSec: 0.112, badge: "" },
  "kuaishou/kling-v3-standard":  { price: "$0.084/s · $0.126/s mit Audio", pricePerSec: 0.084, badge: "" },
  "kuaishou/kling-video-o1":     { price: "$0.112/s",                        pricePerSec: 0.112, badge: "" },
  "kwaivgi/kling-v3.0-pro":      { price: "$0.112/s · $0.168/s mit Audio", pricePerSec: 0.112, badge: "" },
  "kwaivgi/kling-v3.0-std":      { price: "$0.084/s · $0.126/s mit Audio", pricePerSec: 0.084, badge: "" },
  "minimax/hailuo-2.3":          { price: "$0.0817/s",                       pricePerSec: 0.0817, badge: "" },
  "alibaba/wan-2.7":             { price: "$0.10/s",                         pricePerSec: 0.10,  badge: "" },
  "alibaba/wan-2.6":             { price: "$0.04–0.15/s",                    pricePerSec: 0.09,  badge: "💰 Günstig" },
  "openai/sora-2-pro":           { price: "$0.30–0.50/s",                    pricePerSec: 0.40,  badge: "🏆 Premium" },
  "xai/grok-imagine-video":      { price: "$0.05/s (480p) · $0.07/s (720p)", pricePerSec: 0.06, badge: "" },
  "x-ai/grok-imagine-video":     { price: "$0.05/s (480p) · $0.07/s (720p)", pricePerSec: 0.06, badge: "" },
  "bytedance/seedance-2.0":      { price: "nach Video-Token",                 pricePerSec: 0,    badge: "💰 Günstig" },
  "bytedance/seedance-2.0-fast": { price: "nach Video-Token",                 pricePerSec: 0,    badge: "💰 Günstig" },
  "bytedance/seedance-1.5-pro":  { price: "nach Video-Token (mit Audio)",     pricePerSec: 0,    badge: "" },
};


export default function ProjectEditor({ workspaceRoot, folder, onBack, defaultModels, hasApiKey }) {
  const { t } = useTranslation();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("scenes");
  const [planning, setPlanning] = useState(false);
  const [refining, setRefining] = useState(false);
  const [videoModels, setVideoModels] = useState([]);
  const [videoModelsError, setVideoModelsError] = useState("");
  const [textModels, setTextModels] = useState([]);
  const [textModelsLoading, setTextModelsLoading] = useState(false);
  const [imageModels, setImageModels] = useState([]);
  const [imageModelsLoading, setImageModelsLoading] = useState(false);
  const [snapRunning, setSnapRunning] = useState(false);
  const [snapResult, setSnapResult] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [exportRunning, setExportRunning] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  async function load() {
    try {
      const { project } = await api.getProject(workspaceRoot, folder);
      setProject(project);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, folder]);

  // Globaler Poll: läuft solange irgendeine Szene aktiv verarbeitet wird
  useEffect(() => {
    if (!project) return;
    const hasActive = project.scenes.some(
      (s) => s.storyboardStatus === "generating" || ["queued", "generating"].includes(s.videoStatus)
    );
    if (!hasActive) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Alle Modell-Listen laden sobald API-Key gesetzt/geändert wird
  useEffect(() => {
    if (!hasApiKey) {
      setVideoModels([]);
      setVideoModelsError("Kein API-Key — Modelle können nicht geladen werden.");
      setTextModels([]);
      setImageModels([]);
      return;
    }
    setVideoModelsError("");
    api.listVideoModels()
      .then((data) => {
        const raw = data?.data || [];
        setVideoModels(raw.map(m => {
          let priceLabel = null;
          let pricePerSec = 0;
          if (m.pricing?.video) {
            pricePerSec = parseFloat(m.pricing.video) || 0;
            priceLabel = `$${m.pricing.video}/s`;
          } else if (m.pricing?.per_second) {
            pricePerSec = parseFloat(m.pricing.per_second) || 0;
            priceLabel = `$${m.pricing.per_second}/s`;
          } else if (VIDEO_PRICING_MAP[m.id]) {
            priceLabel = VIDEO_PRICING_MAP[m.id].price;
            pricePerSec = VIDEO_PRICING_MAP[m.id].pricePerSec || 0;
          }
          return { id: m.id, name: m.name || m.id, priceLabel, pricePerSec };
        }));
      })
      .catch((err) => {
        setVideoModels([]);
        setVideoModelsError(`Video-Modelle: ${err.message}`);
      });

    // Load live capabilities so SceneCard duration selectors and snap are accurate
    api.getVideoModelCapabilities()
      .then(caps => setLiveCapabilities(caps))
      .catch(() => {});

    setTextModelsLoading(true);
    api.listTextModels()
      .then(data => setTextModels(data?.models || []))
      .catch(() => setTextModels([]))
      .finally(() => setTextModelsLoading(false));

    setImageModelsLoading(true);
    api.listImageModels()
      .then(data => setImageModels(data?.models || []))
      .catch(() => setImageModels([]))
      .finally(() => setImageModelsLoading(false));
  }, [hasApiKey]);

  async function handlePlan(idea, targetSceneCount) {
    setPlanning(true);
    setError("");
    try {
      const { project: updated } = await api.planScenes(workspaceRoot, folder, idea, targetSceneCount, project.settings.textModel || defaultModels.text);
      setProject(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlanning(false);
    }
  }

  async function handleReplan(instruction) {
    setRefining(true);
    setError("");
    try {
      const { project: updated } = await api.replanScenes(workspaceRoot, folder, instruction);
      setProject(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefining(false);
    }
  }

  async function handleDeleteScene(sceneId) {
    if (!window.confirm(t("editor.confirmDeleteScene"))) return;
    try {
      const { project } = await api.deleteScene(workspaceRoot, folder, sceneId);
      setProject(project);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleModelChange(field, value) {
    try {
      const { project } = await api.updateProjectSettings(workspaceRoot, folder, { [field]: value });
      setProject(project);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSnapDurations() {
    const model = project.settings.videoModel;
    if (!model) return;
    setSnapRunning(true);
    setSnapResult(null);
    setError("");
    try {
      const { project: updated, changed, details } = await api.snapAllDurations(workspaceRoot, folder, model);
      setProject(updated);
      setSnapResult({ changed, details: details || [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSnapRunning(false);
    }
  }

  async function handleGenerateAll() {
    if (!window.confirm(t("editor.confirmGenerateAll"))) return;
    setBatchRunning(true);
    setError("");
    try {
      await api.generateAll(workspaceRoot, folder, { generateAudio: project.settings.defaultGenerateAudio });
      // Kurze Polls damit der Übergang error→queued sofort sichtbar wird
      await load();
      setTimeout(load, 2000);
      setTimeout(load, 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchRunning(false);
    }
  }

  async function handleExport() {
    setExportRunning(true);
    setExportResult(null);
    setError("");
    try {
      const result = await api.exportFilm(workspaceRoot, folder, { approveReady: true });
      setExportResult(result);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setExportRunning(false);
    }
  }

  if (loading) return <p>{t("editor.loading")}</p>;
  if (!project) return <p>{t("editor.notFound")}</p>;

  const approvedVideos = project.scenes.filter((s) => s.videoStatus === "approved");
  const readyOrApprovedVideos = project.scenes.filter((s) => s.videoStatus === "approved" || s.videoStatus === "ready");
  const allScenesHaveVideo = project.scenes.length > 0 && project.scenes.every((s) => ["ready", "approved"].includes(s.videoStatus));
  const batchDone = project.scenes.length > 0 && project.scenes.every((s) =>
    s.storyboardStatus === "approved" &&
    ["queued", "generating", "ready", "approved", "error"].includes(s.videoStatus)
  );
  const batchHasErrors = project.scenes.some((s) => s.videoStatus === "error" || s.storyboardStatus === "error");

  return (
    <div className="project-editor">
      <div className="project-editor-header">
        <button className="btn-tertiary" onClick={onBack}>{t("editor.back")}</button>
        <h2>{project.name}</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="project-tabs">
        <button className={`tab ${activeTab === "scenes" ? "tab-active" : ""}`} onClick={() => setActiveTab("scenes")}>{t("editor.tabScenes")}</button>
        <button className={`tab ${activeTab === "cast" ? "tab-active" : ""}`} onClick={() => setActiveTab("cast")}>{t("editor.tabCast")}</button>
      </div>

      {activeTab === "cast" && (
        <CastPanel workspaceRoot={workspaceRoot} folder={folder} project={project} />
      )}

      {activeTab === "scenes" && project.scenes.length === 0 ? (
        <IdeaInput initialIdea={project.idea} onPlan={handlePlan} planning={planning} />
      ) : activeTab === "scenes" && (
        <>
          <section className="project-models-bar">
            <label>
              <span className="model-bar-label">
                {t("editor.videoModel")}
                {!project.settings.videoModel && <span className="model-required-badge">{t("editor.selectFirst")}</span>}
              </span>
              <ModelSelect
                value={project.settings.videoModel || ""}
                onChange={(v) => { handleModelChange("videoModel", v); setSnapResult(null); }}
                models={videoModels}
                loading={videoModels.length === 0 && hasApiKey}
                error={videoModelsError}
                placeholder={t("editor.videoModelPlaceholder")}
              />
              {project.settings.videoModel && project.scenes.length > 0 && (
                <button
                  className="btn-snap-durations"
                  onClick={handleSnapDurations}
                  disabled={snapRunning}
                  title={t("editor.snapTitle")}
                >
                  {snapRunning ? "..." : t("editor.snapDurations")}
                </button>
              )}
              {snapResult !== null && (
                <span className="snap-result">
                  {snapResult.changed === 0
                    ? t("editor.snapNoChange")
                    : `${t("editor.snapChanged", { count: snapResult.changed })}${snapResult.details.length ? ": " + snapResult.details.map(d => `S${d.scene} ${d.from}s→${d.to}s`).join(", ") : ""}`
                  }
                </span>
              )}
            </label>
            <label>
              {t("editor.imageModel")}
              <ModelSelect
                value={project.settings.imageModel || ""}
                onChange={(v) => handleModelChange("imageModel", v)}
                models={imageModels}
                loading={imageModelsLoading}
                placeholder={t("editor.imageModelPlaceholder")}
              />
            </label>
            <label>
              {t("editor.textModel")}
              <ModelSelect
                value={project.settings.textModel || ""}
                onChange={(v) => handleModelChange("textModel", v)}
                models={textModels}
                loading={textModelsLoading}
                placeholder={t("editor.textModelPlaceholder")}
              />
            </label>
            <label>
              {t("editor.style")}
              <select
                value={project.settings.style || ""}
                onChange={(e) => handleModelChange("style", e.target.value)}
              >
                <option value="">{t("styles.none")}</option>
                <option value="cinematic">{t("styles.cinematic")}</option>
                <option value="comic">{t("styles.comic")}</option>
                <option value="anime">{t("styles.anime")}</option>
                <option value="oil-painting">{t("styles.oilPainting")}</option>
                <option value="watercolor">{t("styles.watercolor")}</option>
                <option value="3d-render">{t("styles.render3d")}</option>
              </select>
            </label>
          </section>

          <details className="character-settings">
            <summary>{t("editor.charConsistency")}</summary>
            <div className="character-settings-body">
              <label>
                {t("editor.charDescription")}
                <span className="hint-text small" style={{ marginLeft: 8 }}>{t("editor.charInjected")}</span>
                <textarea
                  rows={3}
                  value={project.settings.characters || ""}
                  onChange={(e) => handleModelChange("characters", e.target.value)}
                  placeholder={t("editor.charPlaceholder")}
                />
              </label>
              <label>
                {t("editor.negDescription")}
                <span className="hint-text small" style={{ marginLeft: 8 }}>{t("editor.negPrevents")}</span>
                <textarea
                  rows={2}
                  value={project.settings.negativePrompt || ""}
                  onChange={(e) => handleModelChange("negativePrompt", e.target.value)}
                  placeholder={t("editor.negPlaceholder")}
                />
                <span className="hint-text small">{t("editor.negEmpty")}</span>
              </label>
            </div>
          </details>

          {videoModels.length > 0 && (
            <details className="video-price-details">
              <summary>{t("editor.priceCompare")}</summary>
              <table className="video-price-table">
                <thead>
                  <tr><th>{t("editor.tableModel")}</th><th>{t("editor.tablePrice")}</th></tr>
                </thead>
                <tbody>
                  {videoModels.map((m) => (
                    <tr
                      key={m.id}
                      className={project.settings.videoModel === m.id ? "price-row-active" : ""}
                      onClick={() => handleModelChange("videoModel", m.id)}
                    >
                      <td><code>{m.name}</code></td>
                      <td>{m.priceLabel || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint-text small" style={{ marginTop: 6 }}>
                {t("editor.priceHint")}
              </p>
            </details>
          )}

          <RefinementBar onRefine={handleReplan} refining={refining} />

          <div className="batch-action-bar">
            <button
              className="btn-primary btn-large"
              onClick={handleGenerateAll}
              disabled={batchRunning || !project.settings.videoModel || (batchDone && !batchHasErrors)}
            >
              {batchRunning
                ? t("editor.generating")
                : batchHasErrors
                  ? t("editor.retryFailed")
                  : t("editor.generateAll")}
            </button>
            {!project.settings.videoModel && (
              <span className="hint-text small">{t("editor.selectVideoFirst")}</span>
            )}
            {batchDone && !batchRunning && !batchHasErrors && (
              <span className="hint-text small">{t("editor.allStarted")}</span>
            )}
            {batchHasErrors && !batchRunning && (
              <span className="hint-text small" style={{ color: "var(--color-error, #ef4444)" }}>
                {t("editor.jobsFailed", { count: project.scenes.filter((s) => s.videoStatus === "error").length })}
              </span>
            )}
          </div>

          <div className="scene-list">
            {project.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                workspaceRoot={workspaceRoot}
                folder={folder}
                imageModel={project.settings.imageModel || defaultModels.image}
                videoModel={project.settings.videoModel}
                generateAudioDefault={project.settings.defaultGenerateAudio}
                onChanged={load}
                onDelete={handleDeleteScene}
              />
            ))}
          </div>

          <CostBar project={project} videoModels={videoModels} />

          <section className="export-section">
            <h3>{t("editor.exportTitle", { ready: readyOrApprovedVideos.length, total: project.scenes.length })}</h3>

            {exportResult ? (
              <div className="export-success">
                <p>{t("editor.exportSuccess")}</p>
                <code className="export-path">{exportResult.outputPath}</code>
                <p className="hint-text small">{t("editor.exportMerged", { count: exportResult.sceneCount })} <strong>{exportResult.fileName}</strong></p>
                <button className="btn-secondary" onClick={() => setExportResult(null)}>{t("editor.exportAgain")}</button>
              </div>
            ) : (
              <>
                <p className="hint-text">
                  {allScenesHaveVideo ? t("editor.exportReadyHint") : t("editor.exportWaitHint")}
                </p>
                <button
                  className="btn-primary btn-large"
                  onClick={handleExport}
                  disabled={exportRunning || readyOrApprovedVideos.length === 0}
                >
                  {exportRunning ? t("editor.exportStitching") : t("editor.exportButton", { count: readyOrApprovedVideos.length })}
                </button>
                {readyOrApprovedVideos.length === 0 && (
                  <p className="hint-text small">{t("editor.noFinishedVideos")}</p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

