import { useEffect, useState } from "react";
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
  "google/veo-3.1":              { price: "$0.20–0.60/s", badge: "🏆 Premium" },
  "google/veo-3.1-fast":         { price: "$0.08–0.30/s", badge: "⚡ Empfohlen" },
  "google/veo-3.1-lite":         { price: "$0.03–0.08/s", badge: "💰 Günstig" },
  "kuaishou/kling-v3-pro":       { price: "$0.112/s · $0.168/s mit Audio", badge: "" },
  "kuaishou/kling-v3-standard":  { price: "$0.084/s · $0.126/s mit Audio", badge: "" },
  "kuaishou/kling-video-o1":     { price: "$0.112/s", badge: "" },
  "minimax/hailuo-2.3":          { price: "$0.0817/s", badge: "" },
  "alibaba/wan-2.7":             { price: "$0.10/s", badge: "" },
  "alibaba/wan-2.6":             { price: "$0.04–0.15/s", badge: "💰 Günstig" },
  "openai/sora-2-pro":           { price: "$0.30–0.50/s", badge: "🏆 Premium" },
  "xai/grok-imagine-video":      { price: "$0.05/s (480p) · $0.07/s (720p)", badge: "" },
  "bytedance/seedance-2.0":      { price: "nach Video-Token", badge: "💰 Günstig" },
  "bytedance/seedance-2.0-fast": { price: "nach Video-Token", badge: "💰 Günstig" },
  "bytedance/seedance-1.5-pro":  { price: "nach Video-Token (mit Audio)", badge: "" },
};


export default function ProjectEditor({ workspaceRoot, folder, onBack, defaultModels, hasApiKey }) {
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
    if (!window.confirm("Diese Szene wirklich löschen?")) return;
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
    if (!window.confirm("Alle Szenen automatisch mit Storyboard-Bild und Video-Job bestücken? (Storyboards werden automatisch freigegeben)")) return;
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

  if (loading) return <p>Lade Projekt...</p>;
  if (!project) return <p>Projekt nicht gefunden.</p>;

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
        <button className="btn-tertiary" onClick={onBack}>← Zurück zu Projekten</button>
        <h2>{project.name}</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="project-tabs">
        <button className={`tab ${activeTab === "scenes" ? "tab-active" : ""}`} onClick={() => setActiveTab("scenes")}>🎬 Szenen</button>
        <button className={`tab ${activeTab === "cast" ? "tab-active" : ""}`} onClick={() => setActiveTab("cast")}>🎭 Cast & Entities</button>
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
                Video-Modell
                {!project.settings.videoModel && <span className="model-required-badge">Zuerst wählen!</span>}
              </span>
              <ModelSelect
                value={project.settings.videoModel || ""}
                onChange={(v) => { handleModelChange("videoModel", v); setSnapResult(null); }}
                models={videoModels}
                loading={videoModels.length === 0 && hasApiKey}
                error={videoModelsError}
                placeholder="Video-Modell wählen..."
              />
              {project.settings.videoModel && project.scenes.length > 0 && (
                <button
                  className="btn-snap-durations"
                  onClick={handleSnapDurations}
                  disabled={snapRunning}
                  title="Alle Szenendauern auf nächsten gültigen Wert für dieses Modell anpassen"
                >
                  {snapRunning ? "..." : "⏱ Dauern anpassen"}
                </button>
              )}
              {snapResult !== null && (
                <span className="snap-result">
                  {snapResult.changed === 0
                    ? "✓ Alle Dauern passen bereits"
                    : `✓ ${snapResult.changed} Szene${snapResult.changed !== 1 ? "n" : ""} angepasst${snapResult.details.length ? ": " + snapResult.details.map(d => `S${d.scene} ${d.from}s→${d.to}s`).join(", ") : ""}`
                  }
                </span>
              )}
            </label>
            <label>
              Bild-Modell
              <ModelSelect
                value={project.settings.imageModel || ""}
                onChange={(v) => handleModelChange("imageModel", v)}
                models={imageModels}
                loading={imageModelsLoading}
                placeholder="Bild-Modell wählen..."
              />
            </label>
            <label>
              Text-Modell
              <ModelSelect
                value={project.settings.textModel || ""}
                onChange={(v) => handleModelChange("textModel", v)}
                models={textModels}
                loading={textModelsLoading}
                placeholder="Text-Modell wählen..."
              />
            </label>
            <label>
              Stil
              <select
                value={project.settings.style || ""}
                onChange={(e) => handleModelChange("style", e.target.value)}
              >
                <option value="">Kein Stil (Modell entscheidet)</option>
                <option value="cinematic">🎬 Cinematic / Realistisch</option>
                <option value="comic">💥 Comic Book</option>
                <option value="anime">🎌 Anime</option>
                <option value="oil-painting">🖼️ Ölgemälde</option>
                <option value="watercolor">🎨 Aquarell</option>
                <option value="3d-render">🖥️ 3D Render / CGI</option>
              </select>
            </label>
          </section>

          <details className="character-settings">
            <summary>🎭 Charakter-Konsistenz</summary>
            <div className="character-settings-body">
              <label>
                Charakterbeschreibung
                <span className="hint-text small" style={{ marginLeft: 8 }}>wird in alle Video-Prompts injiziert</span>
                <textarea
                  rows={3}
                  value={project.settings.characters || ""}
                  onChange={(e) => handleModelChange("characters", e.target.value)}
                  placeholder="z.B. Hauptcharakter: muskulöser Balkanmann Mitte 30, dunkle Haare, traditionelle Weste, immer derselbe"
                />
              </label>
              <label>
                Negative Beschreibung
                <span className="hint-text small" style={{ marginLeft: 8 }}>verhindert Transformationen</span>
                <textarea
                  rows={2}
                  value={project.settings.negativePrompt || ""}
                  onChange={(e) => handleModelChange("negativePrompt", e.target.value)}
                  placeholder="character transformation, gender change, species change, morphing, inconsistent character..."
                />
                <span className="hint-text small">leer lassen = Standardwert wird verwendet</span>
              </label>
            </div>
          </details>

          {videoModels.length > 0 && (
            <details className="video-price-details">
              <summary>💰 Preisvergleich Video-Modelle</summary>
              <table className="video-price-table">
                <thead>
                  <tr><th>Modell</th><th>Preis</th></tr>
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
                Klick auf eine Zeile wählt das Modell aus. Bei 6s/Szene × 8 Szenen z.B. Veo 3.1 Fast ≈ $3–14 pro Durchlauf.
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
                ? "⏳ Generierung läuft..."
                : batchHasErrors
                  ? "🔁 Fehlgeschlagene Szenen erneut versuchen"
                  : "🚀 Alle Szenen automatisch generieren"}
            </button>
            {!project.settings.videoModel && (
              <span className="hint-text small">Bitte zuerst ein Video-Modell auswählen.</span>
            )}
            {batchDone && !batchRunning && !batchHasErrors && (
              <span className="hint-text small">✓ Alle Szenen wurden gestartet — Videos werden im Hintergrund fertig.</span>
            )}
            {batchHasErrors && !batchRunning && (
              <span className="hint-text small" style={{ color: "var(--color-error, #ef4444)" }}>
                ⚠️ {project.scenes.filter((s) => s.videoStatus === "error").length} Video-Job(s) fehlgeschlagen — klick um erneut zu versuchen.
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
            <h3>🎬 Film exportieren ({readyOrApprovedVideos.length}/{project.scenes.length} Videos bereit)</h3>

            {exportResult ? (
              <div className="export-success">
                <p>✅ Film erfolgreich erstellt!</p>
                <code className="export-path">{exportResult.outputPath}</code>
                <p className="hint-text small">{exportResult.sceneCount} Clips zusammengeführt → <strong>{exportResult.fileName}</strong></p>
                <button className="btn-secondary" onClick={() => setExportResult(null)}>Erneut exportieren</button>
              </div>
            ) : (
              <>
                <p className="hint-text">
                  {allScenesHaveVideo
                    ? "Alle Videos sind bereit. Klick auf den Button um sie mit ffmpeg zu einem Film zusammenzuschneiden."
                    : "Sobald alle Videos generiert sind, werden sie hier zusammengeschnitten. Noch offene Videos werden automatisch freigegeben."}
                </p>
                <button
                  className="btn-primary btn-large"
                  onClick={handleExport}
                  disabled={exportRunning || readyOrApprovedVideos.length === 0}
                >
                  {exportRunning ? "⏳ Schneide zusammen..." : `✂️ ${readyOrApprovedVideos.length} Clips zu Film zusammenfügen`}
                </button>
                {readyOrApprovedVideos.length === 0 && (
                  <p className="hint-text small">Noch keine fertigen Videos vorhanden.</p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

