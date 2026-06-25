import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import FolderPicker from "./FolderPicker";
import ModelSelect from "./ModelSelect";

export default function SettingsPanel({ settings, onSettingsChanged, onClose }) {
  const { t } = useTranslation();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [textModel, setTextModel] = useState(settings.defaultModels.text);
  const [imageModel, setImageModel] = useState(settings.defaultModels.image);
  const [videoModel, setVideoModel] = useState(settings.defaultModels.video);
  const [message, setMessage] = useState("");

  const [imageProvider, setImageProvider] = useState(settings.imageProvider || "openrouter");
  const [comfy, setComfy] = useState(settings.comfyui || {});
  const [comfyModels, setComfyModels] = useState([]);
  const [comfyLoading, setComfyLoading] = useState(false);

  // Model lists for the dropdowns (with pricing).
  const [textModels, setTextModels] = useState([]);
  const [imageModels, setImageModels] = useState([]);
  const [videoModels, setVideoModels] = useState([]);

  useEffect(() => {
    if (!settings.hasApiKey) return;
    api.listTextModels().then(d => setTextModels(d?.models || [])).catch(() => {});
    api.listImageModels().then(d => setImageModels(d?.models || [])).catch(() => {});
    api.listVideoModels().then(d => setVideoModels((d?.data || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      priceLabel: m.pricing?.video ? `$${m.pricing.video}/s` : (m.pricing?.per_second ? `$${m.pricing.per_second}/s` : null)
    })))).catch(() => {});
  }, [settings.hasApiKey]);

  // Auto-load ComfyUI checkpoints when the local provider is active.
  useEffect(() => {
    if (imageProvider === "comfyui" && comfyModels.length === 0) handleRefreshComfyModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageProvider]);

  async function handleRefreshComfyModels() {
    setComfyLoading(true);
    try {
      const { checkpoints } = await api.listComfyModels();
      setComfyModels(checkpoints || []);
      if (!checkpoints?.length) setMessage(t("settings.imageProvider.notRunning"));
    } catch (err) {
      setMessage(`${t("common.error")}: ${err.message}`);
    } finally {
      setComfyLoading(false);
    }
  }

  async function handleSaveImageProvider() {
    try {
      await api.setImageProvider(imageProvider, comfy);
      setMessage(t("settings.imageProvider.saved"));
      onSettingsChanged();
    } catch (err) {
      setMessage(`${t("common.error")}: ${err.message}`);
    }
  }

  function comfyField(key, value) {
    setComfy((c) => ({ ...c, [key]: value }));
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await api.setApiKey(apiKeyInput.trim());
      setApiKeyInput("");
      setMessage(t("settings.apiKey.saved"));
      onSettingsChanged();
    } catch (err) {
      setMessage(`${t("common.error")}: ${err.message}`);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveModels() {
    try {
      await api.setDefaultModels({ text: textModel, image: imageModel, video: videoModel });
      setMessage(t("settings.models.saved"));
      onSettingsChanged();
    } catch (err) {
      setMessage(`${t("common.error")}: ${err.message}`);
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
          <h3>{t("settings.title")}</h3>
          <button className="btn-icon" onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        {message && <div className="info-banner">{message}</div>}

        <section className="settings-section">
          <h4>{t("settings.apiKey.title")}</h4>
          <p className="hint-text">
            {settings.hasApiKey ? t("settings.apiKey.isSet") : t("settings.apiKey.notSet")}
          </p>
          <div className="input-row">
            <input
              type="password"
              placeholder={t("settings.apiKey.placeholder")}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button className="btn-primary" onClick={handleSaveApiKey} disabled={savingKey}>
              {t("common.save")}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h4>{t("settings.workspace.title")}</h4>
          <p className="hint-text">{t("settings.workspace.hint")}</p>
          <p className="current-value">
            {t("settings.workspace.current")}{" "}
            <code>{settings.workspaceRoot || t("settings.workspace.notSet")}</code>
          </p>

          {settings.recentWorkspaces.length > 0 && (
            <div className="input-row">
              <select
                defaultValue=""
                onChange={(e) => handleWorkspaceFromDropdown(e.target.value)}
              >
                <option value="" disabled>{t("settings.workspace.recentPlaceholder")}</option>
                {settings.recentWorkspaces.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn-secondary" onClick={() => setShowFolderPicker(true)}>
            {t("settings.workspace.browse")}
          </button>
        </section>

        <section className="settings-section">
          <h4>{t("settings.models.title")}</h4>
          <p className="hint-text">{t("settings.models.hint")}</p>

          <label>{t("settings.models.text")}</label>
          <ModelSelect value={textModel} onChange={setTextModel} models={textModels}
            loading={settings.hasApiKey && textModels.length === 0}
            placeholder={t("settings.models.textPlaceholder")} />

          <label>{t("settings.models.image")}</label>
          {imageProvider === "comfyui" ? (
            <div className="input-row">
              {comfyModels.length > 0 ? (
                <select value={comfy.checkpoint || ""} onChange={(e) => comfyField("checkpoint", e.target.value)}>
                  {comfyModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input type="text" value={comfy.checkpoint || ""} onChange={(e) => comfyField("checkpoint", e.target.value)}
                  placeholder="model.safetensors" />
              )}
              <button className="btn-secondary" onClick={handleRefreshComfyModels} disabled={comfyLoading}>
                {comfyLoading ? "…" : t("settings.imageProvider.refresh")}
              </button>
            </div>
          ) : (
            <ModelSelect value={imageModel} onChange={setImageModel} models={imageModels}
              loading={settings.hasApiKey && imageModels.length === 0}
              placeholder={t("settings.models.imagePlaceholder")} />
          )}

          <label>{t("settings.models.video")}</label>
          <ModelSelect value={videoModel} onChange={setVideoModel} models={videoModels}
            loading={settings.hasApiKey && videoModels.length === 0}
            placeholder={t("settings.models.videoPlaceholder")} />

          <button className="btn-secondary" onClick={() => { handleSaveModels(); if (imageProvider === "comfyui") handleSaveImageProvider(); }} style={{ marginTop: 8 }}>
            {t("settings.models.save")}
          </button>
        </section>

        <section className="settings-section">
          <h4>{t("settings.imageProvider.title")}</h4>
          <p className="hint-text">{t("settings.imageProvider.hint")}</p>

          <div className="provider-toggle">
            <label className={`provider-option ${imageProvider === "openrouter" ? "provider-option-active" : ""}`}>
              <input type="radio" name="imageProvider" checked={imageProvider === "openrouter"}
                onChange={() => setImageProvider("openrouter")} />
              ☁️ {t("settings.imageProvider.openrouter")}
            </label>
            <label className={`provider-option ${imageProvider === "comfyui" ? "provider-option-active" : ""}`}>
              <input type="radio" name="imageProvider" checked={imageProvider === "comfyui"}
                onChange={() => { setImageProvider("comfyui"); if (!comfyModels.length) handleRefreshComfyModels(); }} />
              🖥️ {t("settings.imageProvider.comfyui")}
            </label>
          </div>

          {imageProvider === "comfyui" && (
            <div className="comfy-settings">
              <label>{t("settings.imageProvider.url")}</label>
              <input type="text" value={comfy.url || ""} onChange={(e) => comfyField("url", e.target.value)}
                placeholder="http://localhost:8188" />
              <p className="hint-text small">{t("settings.imageProvider.checkpoint")}: {comfy.checkpoint || "—"}</p>

              <div className="comfy-grid">
                <div>
                  <label>{t("settings.imageProvider.steps")}</label>
                  <input type="number" min="1" max="50" value={comfy.steps ?? 6}
                    onChange={(e) => comfyField("steps", Number(e.target.value))} />
                </div>
                <div>
                  <label>{t("settings.imageProvider.cfg")}</label>
                  <input type="number" min="1" max="20" step="0.5" value={comfy.cfg ?? 2}
                    onChange={(e) => comfyField("cfg", Number(e.target.value))} />
                </div>
                <div>
                  <label>{t("settings.imageProvider.width")}</label>
                  <input type="number" min="256" max="2048" step="64" value={comfy.width ?? 768}
                    onChange={(e) => comfyField("width", Number(e.target.value))} />
                </div>
                <div>
                  <label>{t("settings.imageProvider.height")}</label>
                  <input type="number" min="256" max="2048" step="64" value={comfy.height ?? 432}
                    onChange={(e) => comfyField("height", Number(e.target.value))} />
                </div>
              </div>
              <p className="hint-text small">{t("settings.imageProvider.comfyHint")}</p>
            </div>
          )}

          <button className="btn-secondary" onClick={handleSaveImageProvider} style={{ marginTop: 8 }}>
            {t("settings.imageProvider.save")}
          </button>
        </section>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>{t("common.done")}</button>
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
