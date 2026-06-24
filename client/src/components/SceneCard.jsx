import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { getSupportedDurations, snapDuration } from "../videoModelCapabilities";

const STORYBOARD_BADGE = {
  pending:    { key: "scene.sbPending",    className: "badge-neutral" },
  generating: { key: "scene.sbGenerating", className: "badge-progress" },
  ready:      { key: "scene.sbReady",      className: "badge-review" },
  approved:   { key: "scene.sbApproved",   className: "badge-success" },
  error:      { key: "scene.sbError",      className: "badge-error" }
};

const VIDEO_BADGE = {
  idle:        { key: "scene.vIdle",       className: "badge-neutral" },
  submitting:  { key: "scene.vSubmitting", className: "badge-progress" },
  queued:      { key: "scene.vQueued",     className: "badge-progress" },
  generating:  { key: "scene.vGenerating", className: "badge-progress" },
  ready:       { key: "scene.vReady",      className: "badge-review" },
  approved:    { key: "scene.vApproved",   className: "badge-success" },
  error:       { key: "scene.vError",      className: "badge-error" }
};

export default function SceneCard({
  scene,
  workspaceRoot,
  folder,
  imageModel,
  videoModel,
  generateAudioDefault,
  onChanged,
  onDelete
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene);
  const [busy, setBusy] = useState(false);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [error, setError] = useState("");
  const [generateAudio, setGenerateAudio] = useState(generateAudioDefault);

  useEffect(() => setDraft(scene), [scene]);

  useEffect(() => {
    if (scene.videoStatus === "queued" || scene.videoStatus === "generating") {
      const interval = setInterval(() => onChanged(), 6000);
      return () => clearInterval(interval);
    }
  }, [scene.videoStatus, onChanged]);

  async function handleSaveEdit() {
    setBusy(true);
    setError("");
    try {
      await api.updateScene(workspaceRoot, folder, scene.id, {
        title: draft.title,
        description: draft.description,
        storyboardPrompt: draft.storyboardPrompt,
        camera: draft.camera,
        transition: draft.transition,
        durationSeconds: Number(draft.durationSeconds),
        styleOverride: draft.styleOverride || null
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateStoryboard() {
    setBusy(true);
    setError("");
    try {
      await api.generateStoryboard(workspaceRoot, folder, scene.id, imageModel);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveStoryboard() {
    setBusy(true);
    setError("");
    try {
      await api.approveStoryboard(workspaceRoot, folder, scene.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreStoryboardVariant(idx) {
    setBusy(true);
    setError("");
    try {
      await api.restoreStoryboardVariant(workspaceRoot, folder, scene.id, idx);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateVideo() {
    setBusy(true);
    setSubmittingVideo(true);
    setError("");
    try {
      await api.generateVideo(workspaceRoot, folder, scene.id, { model: videoModel, generateAudio });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setSubmittingVideo(false);
    }
  }

  async function handleApproveVideo() {
    setBusy(true);
    setError("");
    try {
      await api.approveVideo(workspaceRoot, folder, scene.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreVideoVariant(idx) {
    setBusy(true);
    setError("");
    try {
      await api.restoreVideoVariant(workspaceRoot, folder, scene.id, idx);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sbBadgeDef = STORYBOARD_BADGE[scene.storyboardStatus] || STORYBOARD_BADGE.pending;
  const sbBadge = { text: t(sbBadgeDef.key), className: sbBadgeDef.className };
  const effectiveVideoStatus = submittingVideo ? "submitting" : scene.videoStatus;
  const vidBadgeDef = VIDEO_BADGE[effectiveVideoStatus] || VIDEO_BADGE.idle;
  const vidBadge = { text: t(vidBadgeDef.key), className: vidBadgeDef.className };

  const supportedDurations = getSupportedDurations(videoModel);
  const snappedDuration = snapDuration(scene.durationSeconds, videoModel);
  const durationMismatch = supportedDurations && !supportedDurations.includes(Number(scene.durationSeconds));

  const storyboardVariants = scene.storyboardVariants || [];
  const videoVariants = scene.videoVariants || [];

  const isVideoActive = scene.videoStatus === "queued" || scene.videoStatus === "generating";
  const progress = isVideoActive && scene.videoJobProgress != null ? scene.videoJobProgress : null;

  return (
    <div className="scene-card">
      <div className="scene-card-header">
        <span className="scene-order">#{scene.order}</span>
        {editing ? (
          <input
            className="scene-title-input"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        ) : (
          <h3>{scene.title}</h3>
        )}
        <div className="scene-card-actions">
          {!editing && (
            <button className="btn-icon" title={t("scene.editTitle")} onClick={() => setEditing(true)}>✏️</button>
          )}
          <button className="btn-icon" title={t("scene.deleteTitle")} onClick={() => onDelete(scene.id)}>🗑️</button>
        </div>
      </div>

      <div className="scene-card-body">
        <div className="scene-storyboard-area">
          {scene.storyboardImagePath ? (
            <img
              className="storyboard-image"
              src={api.assetUrl(workspaceRoot, folder, scene.storyboardImagePath)}
              alt={scene.title}
            />
          ) : (
            <div className="storyboard-placeholder">{t("scene.noStoryboard")}</div>
          )}
          {storyboardVariants.length > 0 && (
            <div className="storyboard-variants">
              <span className="variants-label">{t("scene.history")}</span>
              {storyboardVariants.slice(0, 4).map((v, idx) => (
                <button
                  key={idx}
                  className="variant-thumb-btn"
                  title={`Seed ${v.seed} – klick zum Wiederherstellen`}
                  onClick={() => handleRestoreStoryboardVariant(idx)}
                  disabled={busy}
                >
                  <img
                    className="variant-thumb"
                    src={api.assetUrl(workspaceRoot, folder, v.path)}
                    alt={`Variante ${idx + 1}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="scene-details">
          {editing ? (
            <>
              <label>{t("scene.descriptionLabel")}</label>
              <textarea
                rows={4}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <label>{t("scene.storyboardPromptLabel")}</label>
              <textarea
                rows={2}
                value={draft.storyboardPrompt}
                onChange={(e) => setDraft({ ...draft, storyboardPrompt: e.target.value })}
              />
              <label>{t("scene.cameraLabel")}</label>
              <input value={draft.camera} onChange={(e) => setDraft({ ...draft, camera: e.target.value })} />
              <label>{t("scene.transitionLabel")}</label>
              <input value={draft.transition} onChange={(e) => setDraft({ ...draft, transition: e.target.value })} />
              <label>{t("scene.styleLabel")}</label>
              <select
                value={draft.styleOverride || ""}
                onChange={(e) => setDraft({ ...draft, styleOverride: e.target.value || null })}
              >
                <option value="">{t("styles.useFilm")}</option>
                <option value="cinematic">{t("styles.cinematic")}</option>
                <option value="comic">{t("styles.comic")}</option>
                <option value="anime">{t("styles.anime")}</option>
                <option value="oil-painting">{t("styles.oilPainting")}</option>
                <option value="watercolor">{t("styles.watercolor")}</option>
                <option value="3d-render">{t("styles.render3d")}</option>
              </select>
              <label>
                {t("scene.durationLabel")}
                {supportedDurations && (
                  <span className="hint-text small" style={{ marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
                    {t("scene.allowed", { list: supportedDurations.join(", ") })}
                  </span>
                )}
              </label>
              {supportedDurations ? (
                <select
                  value={draft.durationSeconds}
                  onChange={(e) => setDraft({ ...draft, durationSeconds: Number(e.target.value) })}
                >
                  {supportedDurations.map((d) => (
                    <option key={d} value={d}>{d}s</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={draft.durationSeconds}
                  onChange={(e) => setDraft({ ...draft, durationSeconds: e.target.value })}
                />
              )}
              <div className="scene-edit-actions">
                <button className="btn-secondary" onClick={() => { setEditing(false); setDraft(scene); }}>{t("scene.cancel")}</button>
                <button className="btn-primary" onClick={handleSaveEdit} disabled={busy}>{t("scene.save")}</button>
              </div>
            </>
          ) : (
            <>
              <p>{scene.description}</p>
              <p className="scene-meta"><strong>{t("scene.cameraMeta")}</strong> {scene.camera}</p>
              <p className="scene-meta"><strong>{t("scene.transitionMeta")}</strong> {scene.transition}</p>
              {scene.styleOverride && (
                <p className="scene-meta"><strong>{t("scene.styleMeta")}</strong> {scene.styleOverride}</p>
              )}
              <p className="scene-meta">
                <strong>{t("scene.durationMeta")}</strong> {scene.durationSeconds}s
                {durationMismatch && (
                  <span className="duration-warning">
                    {t("scene.durationWarning", { snapped: snappedDuration })}
                  </span>
                )}
              </p>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}

          <div className="scene-pipeline">
            <div className="pipeline-step">
              <span className={`badge ${sbBadge.className}`}>
                {scene.storyboardStatus === "generating" && <span className="spinner" />}
                {sbBadge.text}
              </span>
              {scene.storyboardStatus === "error" && scene.storyboardError && (
                <p className="error-text">{scene.storyboardError}</p>
              )}
              <div className="pipeline-step-actions">
                {(scene.storyboardStatus === "pending" || scene.storyboardStatus === "error") && (
                  <button className="btn-secondary" onClick={handleGenerateStoryboard} disabled={busy}>
                    {t("scene.genStoryboard")}
                  </button>
                )}
                {scene.storyboardStatus === "ready" && (
                  <>
                    <button className="btn-secondary" onClick={handleGenerateStoryboard} disabled={busy}>
                      {t("scene.newSeed")}
                    </button>
                    <button className="btn-primary" onClick={handleApproveStoryboard} disabled={busy}>
                      {t("scene.approveStoryboard")}
                    </button>
                  </>
                )}
                {scene.storyboardStatus === "approved" && (
                  <button className="btn-tertiary btn-small" onClick={handleGenerateStoryboard} disabled={busy}>
                    {t("scene.newStoryboard")}
                  </button>
                )}
              </div>
            </div>

            <div className="pipeline-step">
              <div className="pipeline-step-status-row">
                <span className={`badge ${vidBadge.className}`}>
                  {isVideoActive && <span className="spinner" />}
                  {vidBadge.text}
                </span>
                {scene.videoSeed != null && !isVideoActive && (
                  <span className="seed-label">{t("scene.seedLabel", { seed: scene.videoSeed })}</span>
                )}
              </div>

              {isVideoActive && (
                <div className="video-progress-wrap">
                  {progress != null ? (
                    <>
                      <div className="video-progress-bar">
                        <div className="video-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="progress-pct">{progress}%</span>
                    </>
                  ) : (
                    <div className="video-progress-bar">
                      <div className="video-progress-indeterminate" />
                    </div>
                  )}
                </div>
              )}

              {scene.videoError && <p className="error-text">{scene.videoError}</p>}

              <div className="pipeline-step-actions">
                {/* Video generieren: storyboard muss approved oder ready+image sein, video muss idle/error */}
                {(scene.storyboardStatus === "approved" || (scene.storyboardStatus === "ready" && scene.storyboardImagePath)) &&
                 (scene.videoStatus === "idle" || scene.videoStatus === "error") && (
                  <>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={generateAudio}
                        onChange={(e) => setGenerateAudio(e.target.checked)}
                      />
                      {t("scene.withSound")}
                    </label>
                    <button className="btn-secondary" onClick={handleGenerateVideo} disabled={busy || !videoModel}>
                      {t("scene.genVideo")}
                    </button>
                    {!videoModel && <p className="hint-text small">{t("scene.selectVideoModel")}</p>}
                  </>
                )}
                {scene.videoStatus === "ready" && (
                  <>
                    <video
                      className="scene-video-preview"
                      src={api.assetUrl(workspaceRoot, folder, scene.videoPath)}
                      controls
                    />
                    <button className="btn-secondary" onClick={handleGenerateVideo} disabled={busy}>
                      {t("scene.newSeed")}
                    </button>
                    <button className="btn-primary" onClick={handleApproveVideo} disabled={busy}>
                      {t("scene.approveVideo")}
                    </button>
                  </>
                )}
                {scene.videoStatus === "approved" && (
                  <>
                    <video
                      className="scene-video-preview"
                      src={api.assetUrl(workspaceRoot, folder, scene.videoPath)}
                      controls
                    />
                    <button className="btn-secondary btn-small" onClick={handleGenerateVideo} disabled={busy}>
                      {t("scene.regenSeed")}
                    </button>
                  </>
                )}
              </div>

              {videoVariants.length > 0 && (
                <div className="video-variants">
                  <span className="variants-label">{t("scene.earlierVideos")}</span>
                  {videoVariants.slice(0, 3).map((v, idx) => (
                    <button
                      key={idx}
                      className="btn-tertiary btn-small"
                      title={t("scene.seedLabel", { seed: v.seed })}
                      onClick={() => handleRestoreVideoVariant(idx)}
                      disabled={busy}
                    >
                      {t("scene.version", { n: idx + 1, seed: v.seed })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
