import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function IdeaInput({ initialIdea, onPlan, planning }) {
  const { t } = useTranslation();
  const [idea, setIdea] = useState(initialIdea || "");
  const [targetSceneCount, setTargetSceneCount] = useState("");

  return (
    <div className="idea-input">
      <h2>{t("idea.title")}</h2>
      <p className="hint-text">{t("idea.hint")}</p>
      <textarea
        rows={8}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder={t("idea.placeholder")}
      />
      <div className="idea-input-row">
        <label>
          {t("idea.sceneCount")}
          <input
            type="number"
            min="1"
            max="30"
            placeholder={t("idea.auto")}
            value={targetSceneCount}
            onChange={(e) => setTargetSceneCount(e.target.value)}
            style={{ width: 80, marginLeft: 8 }}
          />
        </label>
        <button
          className="btn-primary"
          disabled={!idea.trim() || planning}
          onClick={() => onPlan(idea.trim(), targetSceneCount ? Number(targetSceneCount) : undefined)}
        >
          {planning ? t("idea.planning") : t("idea.plan")}
        </button>
      </div>
    </div>
  );
}
