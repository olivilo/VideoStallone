import { useEffect, useState } from "react";
import { api } from "./api/client";
import SettingsPanel from "./components/SettingsPanel";
import ProjectList from "./components/ProjectList";
import ProjectEditor from "./components/ProjectEditor";
import "./App.css";

export default function App() {
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openFolder, setOpenFolder] = useState(null);
  const [error, setError] = useState("");

  async function loadSettings() {
    try {
      const data = await api.getSettings();
      setSettings(data);
      if (!data.workspaceRoot) {
        setShowSettings(true);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  if (!settings) {
    return <div className="app-loading">Lade VideoStallone...</div>;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>🎬 VideoStallone</h1>
        <div className="app-header-right">
          {settings.workspaceRoot && (
            <span className="hint-text small workspace-indicator">
              📁 {settings.workspaceRoot}
            </span>
          )}
          <button className="btn-tertiary" onClick={() => setShowSettings(true)}>⚙️ Einstellungen</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!settings.hasApiKey && (
        <div className="warning-banner">
          ⚠️ Kein OpenRouter API-Key hinterlegt. Öffne die Einstellungen, um einen einzutragen.
        </div>
      )}

      <main className="app-main">
        {openFolder ? (
          <ProjectEditor
            workspaceRoot={settings.workspaceRoot}
            folder={openFolder}
            onBack={() => setOpenFolder(null)}
            defaultModels={settings.defaultModels}
            hasApiKey={settings.hasApiKey}
          />
        ) : (
          <ProjectList
            workspaceRoot={settings.workspaceRoot}
            onOpenProject={(folder) => setOpenFolder(folder)}
          />
        )}
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChanged={loadSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
