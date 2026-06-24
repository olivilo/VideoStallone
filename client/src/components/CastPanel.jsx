import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const TYPE_LABELS = { character: "🧑 Charakter", entity: "🏭 Entität" };

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
    if (!window.confirm(`"${entry.name}" wirklich löschen?`)) return;
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
    if (!file.type.startsWith("image/")) { setError("Nur Bilder erlaubt"); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Max. 8MB"); return; }
    setBusy(true); setBusyLabel("Lade hoch..."); setError("");
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
    setBusy(true); setBusyLabel("Generiere Referenzbild..."); setError("");
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
    setBusy(true); setBusyLabel("Erstelle KI-Beschreibung..."); setError("");
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
          <strong className="cast-name">{entry.name || "(kein Name)"}</strong>
          <span className="cast-type-badge">{TYPE_LABELS[entry.type] || entry.type}</span>
          {entry.role && <span className="cast-role">{entry.role}</span>}
          <span className={`cast-inject-badge ${entry.injectAlways ? "inject-always" : "inject-keyword"}`}>
            {entry.injectAlways ? "⚡ Immer" : `🔑 ${(entry.injectKeywords || []).join(", ") || "Keyword"}`}
          </span>
        </div>
        {isGlobal ? (
          <span className="cast-global-badge">⭐ Global</span>
        ) : (
          <button className="btn-icon" title="In globale Bibliothek schieben" onClick={(e) => { e.stopPropagation(); onPushGlobal(entry.id); }} disabled={busy}>⭐</button>
        )}
        <span className="cast-expand-icon">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="cast-card-body">
          {error && <div className="error-banner">{error}</div>}
          {busy && busyLabel && <p className="hint-text small"><span className="spinner" />{busyLabel}</p>}

          <div className="cast-form-grid">
            <label>
              Name
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="z.B. DampfLok, GnussZep, DJ Max" />
            </label>
            <label>
              Typ
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                <option value="character">🧑 Charakter (Person)</option>
                <option value="entity">🏭 Entität (Objekt/Fahrzeug/Ort)</option>
              </select>
            </label>
            <label>
              Rolle im Film
              <input value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} placeholder="z.B. Hauptcharakter, Wiederkehrendes Fahrzeug" />
            </label>
            <label>
              Injektion
              <select value={draft.injectAlways ? "always" : "keyword"} onChange={e => setDraft({ ...draft, injectAlways: e.target.value === "always" })}>
                <option value="always">⚡ Immer in alle Szenen</option>
                <option value="keyword">🔑 Nur bei Keyword-Treffer</option>
              </select>
            </label>
          </div>

          {!draft.injectAlways && (
            <label>
              Keywords (kommagetrennt)
              <input
                value={(draft.injectKeywords || []).join(", ")}
                onChange={e => setDraft({ ...draft, injectKeywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) })}
                placeholder="z.B. train, locomotive, dampflok"
              />
            </label>
          )}

          <label>
            Beschreibung (manuell)
            <textarea rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="Visuelle Beschreibung: Aussehen, Merkmale, Kleidung..." />
          </label>

          <label>
            Stil-Notizen
            <textarea rows={2} value={draft.styleNotes} onChange={e => setDraft({ ...draft, styleNotes: e.target.value })}
              placeholder="Verhalten, Instrument, Tanzstil, typische Pose..." />
          </label>

          <div className="cast-ai-desc-wrap">
            <label>
              KI-Beschreibung (Prompt-optimiert)
              <textarea rows={3} value={draft.aiDescription} onChange={e => setDraft({ ...draft, aiDescription: e.target.value })}
                placeholder="Wird automatisch generiert oder manuell eingegeben..." />
            </label>
            <button className="btn-secondary btn-small" onClick={handleGenerateDescription} disabled={busy}>
              ✨ KI-Beschreibung generieren
            </button>
            <p className="hint-text small">Braucht ein Modell mit Vision-Fähigkeit (z.B. Claude, GPT-4o)</p>
          </div>

          <div className="cast-photos-section">
            <div className="cast-photos-header">
              <span className="cast-section-title">Referenzfotos</span>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
              <button className="btn-secondary btn-small" onClick={() => fileRef.current?.click()} disabled={busy}>
                📷 Foto hochladen
              </button>
            </div>
            {(entry.photos || []).length > 0 && (
              <div className="cast-photos-grid">
                {entry.photos.map((p, i) => {
                  const isRef = entry.referenceImagePath && entry.referenceImagePath.includes(p.replace("photos/", "").split("_").slice(1).join("_").split(".")[0]);
                  const isDirectRef = entry.referenceImagePath === p;
                  return (
                    <div key={i} className={`cast-photo-item ${isDirectRef ? "cast-photo-is-ref" : ""}`}>
                      <img src={assetUrl(p)} alt={`Foto ${i + 1}`} className="cast-photo-thumb" />
                      <div className="cast-photo-actions">
                        <button
                          className="cast-photo-pin"
                          onClick={() => handleSetReferencePhoto(p)}
                          disabled={busy}
                          title="Als Referenzbild verwenden"
                        >📌</button>
                        <button className="cast-photo-delete" onClick={() => handleDeletePhoto(p)} disabled={busy} title="Löschen">×</button>
                      </div>
                      {isDirectRef && <span className="cast-photo-ref-badge">Referenz</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="hint-text small">📌 = direkt als Referenzbild setzen (kein KI-Schritt nötig). Auch ohne Referenzbild wird das erste Foto automatisch als visuelle Vorlage genutzt.</p>
          </div>

          <div className="cast-reference-section">
            <span className="cast-section-title">Referenzbild (KI-generiert)</span>
            {entry.referenceImagePath && (
              <img src={assetUrl(entry.referenceImagePath)} alt="Referenz" className="cast-ref-image" />
            )}
            <button className="btn-secondary btn-small" onClick={handleGenerateReference} disabled={busy}>
              🖼️ Referenzbild generieren
            </button>
            <p className="hint-text small">Nutzt Fotos + Beschreibung als Basis. Dieses Bild wird als visueller Anker in Storyboards verwendet.</p>
          </div>

          <div className="cast-card-actions">
            <button className="btn-secondary" onClick={() => { setExpanded(false); setDraft(entry); }} disabled={busy}>Abbrechen</button>
            <button className="btn-primary" onClick={handleSave} disabled={busy}>Speichern</button>
            <button className="btn-danger btn-small" onClick={handleDelete} disabled={busy}>🗑 Löschen</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CastPanel({ workspaceRoot, folder, project }) {
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

  if (loading) return <p className="hint-text">Lade Cast...</p>;

  const alreadyImportedIds = new Set(projectCast.map(e => e.sourceGlobalId).filter(Boolean));

  return (
    <div className="cast-panel">
      {error && <div className="error-banner">{error}</div>}

      <div className="cast-actions-bar">
        <button className="btn-primary" onClick={() => handleCreate("character")}>+ Charakter</button>
        <button className="btn-secondary" onClick={() => handleCreate("entity")}>+ Entität</button>
        <button className="btn-tertiary" onClick={() => setShowGlobal(v => !v)}>
          ⭐ Globale Bibliothek {showGlobal ? "▲" : "▼"}
        </button>
      </div>

      <div className="cast-section">
        <h4 className="cast-section-heading">Projekt-Cast ({projectCast.length})</h4>
        {projectCast.length === 0 && (
          <p className="hint-text">Noch keine Einträge. Erstelle Charaktere oder Entitäten die in allen Szenen konsistent bleiben sollen.</p>
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
          <h4 className="cast-section-heading">⭐ Globale Bibliothek ({globalCast.length})</h4>
          <p className="hint-text small">Chars/Entitäten die du in mehreren Projekten nutzt. Klick "Importieren" um sie ins aktuelle Projekt zu kopieren.</p>
          {globalCast.length === 0 && (
            <p className="hint-text">Noch leer. Schiebe einen Projekt-Eintrag mit ⭐ in die globale Bibliothek.</p>
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
                  ↓ Ins Projekt importieren
                </button>
              ) : (
                <span className="hint-text small">✓ Bereits importiert</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
