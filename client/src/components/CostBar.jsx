export default function CostBar({ project, videoModels }) {
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
  const estimatedCost = pricePerSec
    ? pendingScenes.reduce((sum, s) => sum + (s.durationSeconds || 6) * pricePerSec, 0)
    : null;

  const totalDuration = project.scenes.reduce((sum, s) => sum + (s.durationSeconds || 6), 0);
  const pendingDuration = pendingScenes.reduce((sum, s) => sum + (s.durationSeconds || 6), 0);

  return (
    <div className="cost-bar">
      <div className="cost-item">
        <span className="cost-label">Bisherige Video-Kosten</span>
        <span className="cost-value">{pastVideoCost > 0 ? fmt(pastVideoCost) : "—"}</span>
        <span className="cost-sub">
          {project.scenes.filter(s => s.videoCost).length} von {project.scenes.length} Videos abgerechnet
        </span>
      </div>

      <div className="cost-divider" />

      <div className="cost-item">
        <span className="cost-label">
          Geschätzte Kosten "Alle generieren"
          {pendingScenes.length > 0 && <span className="cost-pending-badge">{pendingScenes.length} offen</span>}
        </span>
        <span className="cost-value cost-value-estimate">
          {estimatedCost != null
            ? estimatedCost > 0 ? fmt(estimatedCost) : "—"
            : <span className="cost-unknown">kein Preis bekannt</span>}
        </span>
        <span className="cost-sub">
          {pendingDuration}s · {pendingScenes.length} Szene{pendingScenes.length !== 1 ? "n" : ""}
          {pricePerSec > 0 && ` · ${selectedModel?.name || project.settings.videoModel} @ $${pricePerSec}/s`}
        </span>
      </div>

      <div className="cost-divider" />

      <div className="cost-item cost-item-total">
        <span className="cost-label">Gesamt Film</span>
        <span className="cost-value">
          {totalDuration}s · {project.scenes.length} Szenen
        </span>
        <span className="cost-sub">
          {estimatedCost != null && pastVideoCost + estimatedCost > 0
            ? `Est. Gesamt: ${fmt(pastVideoCost + estimatedCost)}`
            : ""}
        </span>
      </div>
    </div>
  );
}
