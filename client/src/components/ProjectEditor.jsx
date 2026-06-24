import { useEffect, useState } from "react";
import { api } from "../api/client";
import IdeaInput from "./IdeaInput";
import SceneCard from "./SceneCard";
import RefinementBar from "./RefinementBar";
import CastPanel from "./CastPanel";

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

function videoModelLabel(m) {
  // Preis aus API-Response falls vorhanden, sonst aus Fallback-Map
  let price = null;
  if (m.pricing?.video) price = `$${m.pricing.video}/s`;
  else if (m.pricing?.per_second) price = `$${m.pricing.per_second}/s`;
  else if (VIDEO_PRICING_MAP[m.id]) price = VIDEO_PRICING_MAP[m.id].price;
  const name = m.name || m.id;
  return price ? `${name} — ${price}` : name;
}

export default function ProjectEditor({ workspaceRoot, folder, onBack, defaultModels, hasApiKey }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("scenes");
  const [planning, setPlanning] = useState(false);
  const [refining, setRefining] = useState(false);
  const [videoModels, setVideoModels] = useState([]);
  const [videoModelsError, setVideoModelsError] = useState("");
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

  // Video-Modelle neu laden sobald API-Key gesetzt/geändert wird
  useEffect(() => {
    if (!hasApiKey) {
      setVideoModels([]);
      setVideoModelsError("Kein API-Key — Video-Modelle können nicht geladen werden.");
      return;
    }
    setVideoModelsError("");
    api.listVideoModels()
      .then((data) => setVideoModels(data?.data || []))
      .catch((err) => {
        setVideoModels([]);
        setVideoModelsError(`Video-Modelle konnten nicht geladen werden: ${err.message}`);
      });
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
              Text-Modell
              <input
                list="text-model-list"
                value={project.settings.textModel}
                onChange={(e) => handleModelChange("textModel", e.target.value)}
                placeholder="Modell wählen oder eingeben"
              />
              <datalist id="text-model-list">
                <option value="anthropic/claude-sonnet-4.5" />
                <option value="anthropic/claude-haiku-4-5-20251001" />
                <option value="anthropic/claude-opus-4-8" />
                <option value="openai/gpt-4o" />
                <option value="openai/gpt-4o-mini" />
                <option value="google/gemini-2.5-flash" />
                <option value="google/gemini-2.5-pro" />
                <option value="meta-llama/llama-3.3-70b-instruct" />
                <option value="mistralai/mistral-large-2411" />
              </datalist>
            </label>
            <label>
              Bild-Modell
              <input
                list="image-model-list"
                value={project.settings.imageModel}
                onChange={(e) => handleModelChange("imageModel", e.target.value)}
                placeholder="Modell wählen oder eingeben"
              />
              <datalist id="image-model-list">
                <option value="google/gemini-2.5-flash-image" />
                <option value="openai/gpt-image-1" />
                <option value="black-forest-labs/flux-1.1-pro" />
                <option value="black-forest-labs/flux-kontext-max" />
                <option value="black-forest-labs/flux-kontext-pro" />
                <option value="ideogram/V_2_TURBO" />
                <option value="stabilityai/sd3.5-large-turbo" />
              </datalist>
            </label>
            <label>
              Video-Modell
              <select
                value={project.settings.videoModel || ""}
                onChange={(e) => handleModelChange("videoModel", e.target.value)}
              >
                <option value="">-- wählen --</option>
                {videoModels.map((m) => (
                  <option key={m.id} value={m.id}>{videoModelLabel(m)}</option>
                ))}
                {project.settings.videoModel && !videoModels.find((m) => m.id === project.settings.videoModel) && (
                  <option value={project.settings.videoModel}>{project.settings.videoModel}</option>
                )}
              </select>
              {videoModelsError && <span className="hint-text small" style={{ color: "var(--color-warning, #f59e0b)" }}>{videoModelsError}</span>}
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
                  <tr><th>Modell</th><th>Preis/Sekunde</th><th></th></tr>
                </thead>
                <tbody>
                  {videoModels.map((m) => {
                    const info = VIDEO_PRICING_MAP[m.id];
                    let price = info?.price;
                    if (!price && m.pricing?.video) price = `$${m.pricing.video}/s`;
                    if (!price && m.pricing?.per_second) price = `$${m.pricing.per_second}/s`;
                    return (
                      <tr
                        key={m.id}
                        className={project.settings.videoModel === m.id ? "price-row-active" : ""}
                        onClick={() => handleModelChange("videoModel", m.id)}
                      >
                        <td><code>{m.name || m.id}</code></td>
                        <td>{price || "—"}</td>
                        <td>{info?.badge || ""}</td>
                      </tr>
                    );
                  })}
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

