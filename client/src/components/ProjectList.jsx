import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export default function ProjectList({ workspaceRoot, onOpenProject }) {
  const { t, i18n } = useTranslation();
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
        <p>{t("projects.emptyNoWorkspace")}</p>
      </div>
    );
  }

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h2>{t("projects.title")}</h2>
        <p className="hint-text">{t("projects.workspaceLabel")} <code>{workspaceRoot}</code></p>
      </div>

      <div className="new-project-row">
        <input
          type="text"
          placeholder={t("projects.newPlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn-primary" onClick={handleCreate} disabled={creating}>
          {t("projects.create")}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <p>{t("projects.loading")}</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">{t("projects.empty")}</div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.folder} className="project-card" onClick={() => onOpenProject(p.folder)}>
              <h3>{p.name}</h3>
              <p className="hint-text">{t("projects.sceneCount", { count: p.sceneCount })}</p>
              <p className="hint-text small">
                {t("projects.updatedAt", { date: new Date(p.updatedAt).toLocaleString(i18n.language) })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
