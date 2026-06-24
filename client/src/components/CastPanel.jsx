import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

const TYPE_KEYS = { character: "cast.typeCharacter", entity: "cast.typeEntity" };

function emptyEntry(type = "character") {
  return {
    type,
    name: "",
    role: "",
    description: "",
    aiDescription: "",
    styleNotes: "",
    injectAlways: true,
    injectKeywords: [],
  };
}

function CastCard({ entry, isGlobal, workspaceRoot, folder, imageModel, textModel, onUpdated, onDeleted, onPushGlobal, onImport }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(entry);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef();

  useEffect(() => { setDraft(entry); }, [entry]);

  const assetUrl = isGlobal
    ? (path) => api.globalCastAssetUrl(path)
    : (path) => api.projectCastAssetUrl(workspaceRoot, folder, path);

  async function handleSave() {
    setBusy(true); setError("");
    try {
      const fn = isGlobal
        ? () => api.updateGlobalCast(entry.id, draft)
        : () => api.updateProjectCast(workspaceRoot, folder, entry.id, draft);
      const { entry: updated } = await fn();
      onUpdated(updated);
      setExpanded(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!window.confirm(t("cast.confirmDelete", { name: entry.name }))) return;
    setBusy(true);
    try {
      if (isGlobal) await api.deleteGlobalCast(entry.id);
      else await api.deleteProjectCast(workspaceRoot, folder, entry.id);
      onDeleted(entry.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError(t("cast.onlyImages")); return; }
    if (file.size > 8 * 1024 * 1024) { setError(t("cast.maxSize")); return; }
    setBusy(true); setBusyLabel(t("cast.uploading")); setError("");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const fn = isGlobal
          ? () => api.uploadGlobalCastPhoto(entry.id, ev.target.result, file.name)
          : () => api.uploadProjectCastPhoto(workspaceRoot, folder, entry.id, ev.target.result, file.name);
        const { entry: updated } = await fn();
        onUpdated(updated);
      } catch (err) { setError(err.message); }
      finally { setBusy(false); setBusyLabel(""); }
    };
    reader.readAsDataURL(file);
  }

  async function handleDeletePhoto(photoPath) {
    setBusy(true); setError("");
    try {
      const fn = isGlobal
        ? () => api.deleteGlobalCastPhoto(entry.id, photoPath)
        : () => api.deleteProjectCastPhoto(workspaceRoot, folder, entry.id, photoPath);
      const { entry: updated } = await fn();
      onUpdated(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleSetReferencePhoto(photoPath) {
    setBusy(true); setError("");
    try {
      const fn = isGlobal
        ? () => api.setGlobalCastReferencePhoto(entry.id, photoPath)
        : () => api.setProjectCastReferencePhoto(workspaceRoot, folder, entry.id, photoPath);
      const { entry: updated } = await fn();
      onUpdated(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleGenerateReference() {
    setBusy(true); setBusyLabel(t("cast.generatingRef")); setError("");
    try {
      const fn = isGlobal
        ? () => api.generateGlobalCastReference(entry.id, imageModel, draft)
        : () => api.generateProjectCastReference(workspaceRoot, folder, entry.id, imageModel, draft);
      const { entry: updated } = await fn();
      onUpdated(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setBusyLabel(""); }
  }

  async function handleGenerateDescription() {
    setBusy(true); setBusyLabel(t("cast.generatingDesc")); setError("");
    try {
      const fn = isGlobal
        ? () => api.generateGlobalCastDescription(entry.id, textModel, draft)
        : () => api.generateProjectCastDescription(workspaceRoot, folder, entry.id, textModel, draft);
      const { entry: updated } = await fn();
      onUpdated(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setBusyLabel(""); }
  }

  return (
    <div className={`cast-card ${expanded ? "cast-card-expanded" : ""} ${isGlobal ? "cast-card-global" : ""}`}>
      <div className="cast-card-header" onClick={() => !busy && setExpanded(v => !v)}>
        <div className="cast-card-thumb-wrap">
          {entry.referenceImagePath ? (
            <img className="cast-thumb" src={assetUrl(entry.referenceImagePath)} alt={entry.name} />
          ) : (
            <div className="cast-thumb cast-thumb-placeholder">{entry.type === "entity" ? "🏭" : "🧑"}</div>
          )}
        </div>
        <div className="cast-card-info">
          <strong className="cast-name">{entry.name || t("cast.noName")}</strong>
          <span className="cast-type-badge">{TYPE_KEYS[entry.type] ? t(TYPE_KEYS[entry.type]) : entry.type}</span>
          {entry.role && <span className="cast-role">{entry.role}</span>}
          <span className={`cast-inject-badge ${entry.injectAlways ? "inject-always" : "inject-keyword"}`}>
            {entry.injectAlways ? t("cast.always") : `🔑 ${(entry.injectKeywords || []).join(", ") || t("cast.keywordFallback")}`}
          </span>
        </div>
        {isGlobal ? (
          <span className="cast-global-badge">{t("cast.globalBadge")}</span>
        ) : (
          <button className="btn-icon" title={t("cast.pushGlobalTitle")} onClick={(e) => { e.stopPropagation(); onPushGlobal(entry.id); }} disabled={busy}>⭐</button>
        )}
        <span className="cast-expand-icon">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="cast-card-body">
          {error && <div className="error-banner">{error}</div>}
          {busy && busyLabel && <p className="hint-text small"><span className="spinner" />{busyLabel}</p>}

          <div className="cast-form-grid">
            <label>
              {t("cast.name")}
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t("cast.namePlaceholder")} />
            </label>
            <label>
              {t("cast.type")}
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                <option value="character">{t("cast.typeCharOpt")}</option>
                <option value="entity">{t("cast.typeEntityOpt")}</option>
              </select>
            </label>
            <label>
              {t("cast.role")}
              <input value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} placeholder={t("cast.rolePlaceholder")} />
            </label>
            <label>
              {t("cast.injection")}
              <select value={draft.injectAlways ? "always" : "keyword"} onChange={e => setDraft({ ...draft, injectAlways: e.target.value === "always" })}>
                <option value="always">{t("cast.injectAlwaysOpt")}</option>
                <option value="keyword">{t("cast.injectKeywordOpt")}</option>
              </select>
            </label>
          </div>

          {!draft.injectAlways && (
            <label>
              {t("cast.keywordsLabel")}
              <input
                value={(draft.injectKeywords || []).join(", ")}
                onChange={e => setDraft({ ...draft, injectKeywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) })}
                placeholder={t("cast.keywordsPlaceholder")}
              />
            </label>
          )}

          <label>
            {t("cast.descManual")}
            <textarea rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder={t("cast.descPlaceholder")} />
          </label>

          <label>
            {t("cast.styleNotes")}
            <textarea rows={2} value={draft.styleNotes} onChange={e => setDraft({ ...draft, styleNotes: e.target.value })}
              placeholder={t("cast.styleNotesPlaceholder")} />
          </label>

          <div className="cast-ai-desc-wrap">
            <label>
              {t("cast.aiDesc")}
              <textarea rows={3} value={draft.aiDescription} onChange={e => setDraft({ ...draft, aiDescription: e.target.value })}
                placeholder={t("cast.aiDescPlaceholder")} />
            </label>
            <button className="btn-secondary btn-small" onClick={handleGenerateDescription} disabled={busy}>
              {t("cast.genAiDesc")}
            </button>
            <p className="hint-text small">{t("cast.visionHint")}</p>
          </div>

          <div className="cast-photos-section">
            <div className="cast-photos-header">
              <span className="cast-section-title">{t("cast.refPhotos")}</span>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
              <button className="btn-secondary btn-small" onClick={() => fileRef.current?.click()} disabled={busy}>
                {t("cast.uploadPhoto")}
              </button>
            </div>
            {(entry.photos || []).length > 0 && (
              <div className="cast-photos-grid">
                {entry.photos.map((p, i) => {
                  const isRef = entry.referenceImagePath && entry.referenceImagePath.includes(p.replace("photos/", "").split("_").slice(1).join("_").split(".")[0]);
                  const isDirectRef = entry.referenceImagePath === p;
                  return (
                    <div key={i} className={`cast-photo-item ${isDirectRef ? "cast-photo-is-ref" : ""}`}>
                      <img src={assetUrl(p)} alt={t("cast.photoAlt", { n: i + 1 })} className="cast-photo-thumb" />
                      <div className="cast-photo-actions">
                        <button
                          className="cast-photo-pin"
                          onClick={() => handleSetReferencePhoto(p)}
                          disabled={busy}
                          title={t("cast.useAsRef")}
                        >📌</button>
                        <button className="cast-photo-delete" onClick={() => handleDeletePhoto(p)} disabled={busy} title={t("cast.deletePhoto")}>×</button>
                      </div>
                      {isDirectRef && <span className="cast-photo-ref-badge">{t("cast.refBadge")}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="hint-text small">{t("cast.photoHint")}</p>
          </div>

          <div className="cast-reference-section">
            <span className="cast-section-title">{t("cast.refImageAi")}</span>
            {entry.referenceImagePath && (
              <img src={assetUrl(entry.referenceImagePath)} alt={t("cast.refBadge")} className="cast-ref-image" />
            )}
            <button className="btn-secondary btn-small" onClick={handleGenerateReference} disabled={busy}>
              {t("cast.genRefImage")}
            </button>
            <p className="hint-text small">{t("cast.refImageHint")}</p>
          </div>

          <div className="cast-card-actions">
            <button className="btn-secondary" onClick={() => { setExpanded(false); setDraft(entry); }} disabled={busy}>{t("common.cancel")}</button>
            <button className="btn-primary" onClick={handleSave} disabled={busy}>{t("common.save")}</button>
            <button className="btn-danger btn-small" onClick={handleDelete} disabled={busy}>{t("cast.deleteBtn")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CastPanel({ workspaceRoot, folder, project }) {
  const { t } = useTranslation();
  const [projectCast, setProjectCast] = useState([]);
  const [globalCast, setGlobalCast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showGlobal, setShowGlobal] = useState(false);

  const imageModel = project?.settings?.imageModel || "";
  const textModel = project?.settings?.textModel || "";

  async function load() {
    setLoading(true);
    try {
      const [pRes, gRes] = await Promise.all([
        api.listProjectCast(workspaceRoot, folder),
        api.listGlobalCast()
      ]);
      setProjectCast(pRes.cast || []);
      setGlobalCast(gRes.cast || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [workspaceRoot, folder]);

  async function handleCreate(type) {
    setError("");
    try {
      const { entry } = await api.createProjectCast(workspaceRoot, folder, emptyEntry(type));
      setProjectCast(prev => [...prev, entry]);
    } catch (e) { setError(e.message); }
  }

  function handleUpdated(updated) {
    setProjectCast(prev => prev.map(e => e.id === updated.id ? updated : e));
  }

  function handleDeleted(id) {
    setProjectCast(prev => prev.filter(e => e.id !== id));
  }

  async function handlePushGlobal(id) {
    setError("");
    try {
      const { entry, globalEntry } = await api.pushCastToGlobal(workspaceRoot, folder, id);
      setProjectCast(prev => prev.map(e => e.id === id ? entry : e));
      setGlobalCast(prev => {
        const existing = prev.findIndex(g => g.id === globalEntry.id);
        return existing >= 0 ? prev.map(g => g.id === globalEntry.id ? globalEntry : g) : [...prev, globalEntry];
      });
    } catch (e) { setError(e.message); }
  }

  async function handleImport(globalId) {
    setError("");
    try {
      const { entry } = await api.importGlobalCast(workspaceRoot, folder, globalId);
      setProjectCast(prev => [...prev, entry]);
    } catch (e) { setError(e.message); }
  }

  function handleGlobalUpdated(updated) {
    setGlobalCast(prev => prev.map(e => e.id === updated.id ? updated : e));
  }

  function handleGlobalDeleted(id) {
    setGlobalCast(prev => prev.filter(e => e.id !== id));
  }

  if (loading) return <p className="hint-text">{t("cast.loading")}</p>;

  const alreadyImportedIds = new Set(projectCast.map(e => e.sourceGlobalId).filter(Boolean));

  return (
    <div className="cast-panel">
      {error && <div className="error-banner">{error}</div>}

      <div className="cast-actions-bar">
        <button className="btn-primary" onClick={() => handleCreate("character")}>{t("cast.addCharacter")}</button>
        <button className="btn-secondary" onClick={() => handleCreate("entity")}>{t("cast.addEntity")}</button>
        <button className="btn-tertiary" onClick={() => setShowGlobal(v => !v)}>
          {t("cast.globalLibrary")} {showGlobal ? "▲" : "▼"}
        </button>
      </div>

      <div className="cast-section">
        <h4 className="cast-section-heading">{t("cast.projectCast", { count: projectCast.length })}</h4>
        {projectCast.length === 0 && (
          <p className="hint-text">{t("cast.emptyProject")}</p>
        )}
        {projectCast.map(entry => (
          <CastCard
            key={entry.id}
            entry={entry}
            isGlobal={false}
            workspaceRoot={workspaceRoot}
            folder={folder}
            imageModel={imageModel}
            textModel={textModel}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onPushGlobal={handlePushGlobal}
          />
        ))}
      </div>

      {showGlobal && (
        <div className="cast-section cast-section-global">
          <h4 className="cast-section-heading">{t("cast.globalTitle", { count: globalCast.length })}</h4>
          <p className="hint-text small">{t("cast.globalHint")}</p>
          {globalCast.length === 0 && (
            <p className="hint-text">{t("cast.globalEmpty")}</p>
          )}
          {globalCast.map(entry => (
            <div key={entry.id} className="cast-global-row">
              <CastCard
                entry={entry}
                isGlobal={true}
                workspaceRoot={workspaceRoot}
                folder={folder}
                imageModel={imageModel}
                textModel={textModel}
                onUpdated={handleGlobalUpdated}
                onDeleted={handleGlobalDeleted}
                onPushGlobal={() => {}}
                onImport={handleImport}
              />
              {!alreadyImportedIds.has(entry.id) ? (
                <button className="btn-secondary btn-small cast-import-btn" onClick={() => handleImport(entry.id)}>
                  {t("cast.import")}
                </button>
              ) : (
                <span className="hint-text small">{t("cast.alreadyImported")}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
