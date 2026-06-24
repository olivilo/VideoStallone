import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api/client";
import SettingsPanel from "./components/SettingsPanel";
import ProjectList from "./components/ProjectList";
import ProjectEditor from "./components/ProjectEditor";
import LanguageSwitcher from "./components/LanguageSwitcher";
import ThemeToggle from "./components/ThemeToggle";
import HelpModal from "./components/HelpModal";
import "./App.css";

export default function App() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [openFolder, setOpenFolder] = useState(null);
  const [error, setError] = useState("");

  async function loadSettings() {
    try {
      const data = await api.getSettings();
      setSettings(data);
      if (!data.workspaceRoot) setShowSettings(true);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  if (!settings) {
    return <div className="app-loading">{t("app.loading")}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">🎬</span>
          <span className="sidebar-brand-name">{t("app.name")}</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${!openFolder ? "sidebar-item-active" : ""}`}
            onClick={() => setOpenFolder(null)}
          >
            <span className="sidebar-item-icon">📁</span>
            {t("nav.projects")}
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <button className="sidebar-item" onClick={() => setShowSettings(true)}>
            <span className="sidebar-item-icon">⚙️</span>
            {t("nav.settings")}
          </button>
          <button className="sidebar-item" onClick={() => setShowHelp(true)}>
            <span className="sidebar-item-icon">❓</span>
            {t("nav.help")}
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header">
          <div className="app-header-left">
            <h1 className="app-context-title">
              {openFolder ? openFolder : t("nav.projects")}
            </h1>
          </div>
          <div className="app-header-right">
            {settings.workspaceRoot && (
              <span className="hint-text small workspace-indicator" title={settings.workspaceRoot}>
                📁 {settings.workspaceRoot}
              </span>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {!settings.hasApiKey && (
          <div className="warning-banner">⚠️ {t("warnings.noApiKey")}</div>
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
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChanged={loadSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
