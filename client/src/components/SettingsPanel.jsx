import { useState } from "react";
import { api } from "../api/client";
import FolderPicker from "./FolderPicker";

export default function SettingsPanel({ settings, onSettingsChanged, onClose }) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [textModel, setTextModel] = useState(settings.defaultModels.text);
  const [imageModel, setImageModel] = useState(settings.defaultModels.image);
  const [videoModel, setVideoModel] = useState(settings.defaultModels.video);
  const [message, setMessage] = useState("");

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await api.setApiKey(apiKeyInput.trim());
      setApiKeyInput("");
      setMessage("API-Key gespeichert.");
      onSettingsChanged();
    } catch (err) {
      setMessage(`Fehler: ${err.message}`);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveModels() {
    try {
      await api.setDefaultModels({ text: textModel, image: imageModel, video: videoModel });
      setMessage("Standard-Modelle gespeichert.");
      onSettingsChanged();
    } catch (err) {
      setMessage(`Fehler: ${err.message}`);
    }
  }

  async function handleWorkspaceFromDropdown(path) {
    if (!path) return;
    await api.selectWorkspace(path);
    onSettingsChanged();
  }

  async function handleFolderPicked(path) {
    setShowFolderPicker(false);
    await api.selectWorkspace(path);
    onSettingsChanged();
  }

  return (
    <div className="modal-overlay">
      <div className="modal settings-panel">
        <div className="modal-header">
          <h3>Einstellungen</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {message && <div className="info-banner">{message}</div>}

        <section className="settings-section">
          <h4>OpenRouter API-Key</h4>
          <p className="hint-text">
            {settings.hasApiKey ? "✅ Ein API-Key ist hinterlegt." : "⚠️ Noch kein API-Key gesetzt."}
          </p>
          <div className="input-row">
            <input
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button className="btn-primary" onClick={handleSaveApiKey} disabled={savingKey}>
              Speichern
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h4>Arbeitsordner (Workspace)</h4>
          <p className="hint-text">Hier werden deine Projektordner angelegt und gespeichert.</p>
          <p className="current-value">Aktuell: <code>{settings.workspaceRoot || "(nicht gesetzt)"}</code></p>

          {settings.recentWorkspaces.length > 0 && (
            <div className="input-row">
              <select
                defaultValue=""
                onChange={(e) => handleWorkspaceFromDropdown(e.target.value)}
              >
                <option value="" disabled>Zuletzt verwendet wählen...</option>
                {settings.recentWorkspaces.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn-secondary" onClick={() => setShowFolderPicker(true)}>
            📁 Anderen Ordner durchsuchen / anlegen
          </button>
        </section>

        <section className="settings-section">
          <h4>Standard-Modelle</h4>
          <p className="hint-text">Werden für neue Projekte vorausgewählt (in jedem Projekt einzeln änderbar).</p>

          <label>Text-Modell (Szenenplanung)</label>
          <input type="text" value={textModel} onChange={(e) => setTextModel(e.target.value)}
            placeholder="z.B. anthropic/claude-sonnet-4.5" />

          <label>Bild-Modell (Storyboard)</label>
          <input type="text" value={imageModel} onChange={(e) => setImageModel(e.target.value)}
            placeholder="z.B. google/gemini-2.5-flash-image" />

          <label>Video-Modell (optional Standard)</label>
          <input type="text" value={videoModel} onChange={(e) => setVideoModel(e.target.value)}
            placeholder="z.B. google/veo-3.1 — kann auch pro Szene gewählt werden" />

          <button className="btn-secondary" onClick={handleSaveModels} style={{ marginTop: 8 }}>
            Modelle speichern
          </button>
        </section>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Fertig</button>
        </div>
      </div>

      {showFolderPicker && (
        <FolderPicker
          initialPath={settings.workspaceRoot}
          onSelect={handleFolderPicked}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}
