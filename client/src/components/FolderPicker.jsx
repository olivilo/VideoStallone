import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export default function FolderPicker({ initialPath, onSelect, onCancel }) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPath || "");
  const [folders, setFolders] = useState([]);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  async function load(path) {
    setLoading(true);
    setError("");
    try {
      const result = await api.browse(path);
      setCurrentPath(result.path);
      setFolders(result.folders);
      setParent(result.parent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(initialPath || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(currentPath, newFolderName.trim());
      setNewFolderName("");
      setShowNewFolder(false);
      load(currentPath);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal folder-picker">
        <h3>{t("folderPicker.title")}</h3>

        <div className="folder-path-bar">
          <input
            type="text"
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(currentPath)}
            placeholder={t("folderPicker.pathPlaceholder")}
          />
          <button onClick={() => load(currentPath)} className="btn-secondary">{t("folderPicker.go")}</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="folder-list">
          {parent && (
            <div className="folder-item folder-item-up" onClick={() => load(parent)}>
              {t("folderPicker.up")}
            </div>
          )}
          {loading ? (
            <div className="folder-item-loading">{t("folderPicker.loading")}</div>
          ) : folders.length === 0 ? (
            <div className="folder-item-empty">{t("folderPicker.empty")}</div>
          ) : (
            folders.map((f) => (
              <div key={f} className="folder-item" onClick={() => load(`${currentPath}/${f}`)}>
                📁 {f}
              </div>
            ))
          )}
        </div>

        <div className="folder-picker-actions">
          {showNewFolder ? (
            <div className="new-folder-row">
              <input
                type="text"
                placeholder={t("folderPicker.newNamePlaceholder")}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                autoFocus
              />
              <button className="btn-secondary" onClick={handleCreateFolder}>{t("folderPicker.create")}</button>
              <button className="btn-tertiary" onClick={() => setShowNewFolder(false)}>{t("common.cancel")}</button>
            </div>
          ) : (
            <button className="btn-tertiary" onClick={() => setShowNewFolder(true)}>{t("folderPicker.newFolder")}</button>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-tertiary" onClick={onCancel}>{t("common.cancel")}</button>
          <button className="btn-primary" onClick={() => onSelect(currentPath)}>
            {t("folderPicker.use")}
          </button>
        </div>
      </div>
    </div>
  );
}
