import { useTranslation } from "react-i18next";
import { snapDuration } from "../videoModelCapabilities";

export default function CostBar({ project, videoModels }) {
  const { t } = useTranslation();
  if (!project?.scenes?.length) return null;

  const fmt = (n) => n < 0.01 ? `< $0.01` : `$${n.toFixed(2)}`;

  // Past costs: sum of all videoCost stored on scenes
  const pastVideoCost = project.scenes.reduce((sum, s) => sum + (s.videoCost || 0), 0);

  // Estimated batch cost: scenes without an approved/ready/queued/generating video
  const selectedModel = videoModels.find(m => m.id === project.settings.videoModel);
  const pricePerSec = selectedModel?.pricePerSec || 0;

  const pendingScenes = project.scenes.filter(
    s => !["approved", "ready", "queued", "generating"].includes(s.videoStatus)
  );
  const videoModelId = project.settings.videoModel;
  const estimatedCost = pricePerSec
    ? pendingScenes.reduce((sum, s) => {
        const d = snapDuration(s.durationSeconds || 6, videoModelId);
        return sum + d * pricePerSec;
      }, 0)
    : null;

  const totalDuration = project.scenes.reduce((sum, s) => sum + (s.durationSeconds || 6), 0);
  const pendingDuration = pendingScenes.reduce((sum, s) => {
    return sum + snapDuration(s.durationSeconds || 6, videoModelId);
  }, 0);

  return (
    <div className="cost-bar">
      <div className="cost-item">
        <span className="cost-label">{t("cost.pastTitle")}</span>
        <span className="cost-value">{pastVideoCost > 0 ? fmt(pastVideoCost) : "—"}</span>
        <span className="cost-sub">
          {t("cost.pastSub", { billed: project.scenes.filter(s => s.videoCost).length, total: project.scenes.length })}
        </span>
      </div>

      <div className="cost-divider" />

      <div className="cost-item">
        <span className="cost-label">
          {t("cost.estimateTitle")}
          {pendingScenes.length > 0 && <span className="cost-pending-badge">{t("cost.openBadge", { count: pendingScenes.length })}</span>}
        </span>
        <span className="cost-value cost-value-estimate">
          {estimatedCost != null
            ? estimatedCost > 0 ? fmt(estimatedCost) : "—"
            : <span className="cost-unknown">{t("cost.noPrice")}</span>}
        </span>
        <span className="cost-sub">
          {pendingDuration}s · {t("cost.scenes", { count: pendingScenes.length })}
          {pricePerSec > 0 && ` · ${selectedModel?.name || project.settings.videoModel} @ $${pricePerSec}/s`}
        </span>
      </div>

      <div className="cost-divider" />

      <div className="cost-item cost-item-total">
        <span className="cost-label">{t("cost.totalTitle")}</span>
        <span className="cost-value">
          {totalDuration}s · {t("cost.scenes", { count: project.scenes.length })}
        </span>
        <span className="cost-sub">
          {estimatedCost != null && pastVideoCost + estimatedCost > 0
            ? t("cost.estTotal", { amount: fmt(pastVideoCost + estimatedCost) })
            : ""}
        </span>
      </div>
    </div>
  );
}
