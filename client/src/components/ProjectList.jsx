import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function ProjectList({ workspaceRoot, onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!workspaceRoot) return;
    setLoading(true);
    setError("");
    try {
      const { projects } = await api.listProjects(workspaceRoot);
      setProjects(projects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { folder } = await api.createProject(workspaceRoot, newName.trim());
      setNewName("");
      await load();
      onOpenProject(folder);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (!workspaceRoot) {
    return (
      <div className="empty-state">
        <p>Bitte wähle zuerst einen Arbeitsordner in den Einstellungen.</p>
      </div>
    );
  }

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h2>Projekte</h2>
        <p className="hint-text">Workspace: <code>{workspaceRoot}</code></p>
      </div>

      <div className="new-project-row">
        <input
          type="text"
          placeholder="Name des neuen Filmprojekts..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn-primary" onClick={handleCreate} disabled={creating}>
          + Neues Projekt
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <p>Lade Projekte...</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">Noch keine Projekte. Lege oben dein erstes Projekt an.</div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.folder} className="project-card" onClick={() => onOpenProject(p.folder)}>
              <h3>{p.name}</h3>
              <p className="hint-text">{p.sceneCount} Szene{p.sceneCount === 1 ? "" : "n"}</p>
              <p className="hint-text small">Zuletzt geändert: {new Date(p.updatedAt).toLocaleString("de-DE")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
