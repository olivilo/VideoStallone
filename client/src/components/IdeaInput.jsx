import { useState } from "react";

export default function IdeaInput({ initialIdea, onPlan, planning }) {
  const [idea, setIdea] = useState(initialIdea || "");
  const [targetSceneCount, setTargetSceneCount] = useState("");

  return (
    <div className="idea-input">
      <h2>Deine Filmidee</h2>
      <p className="hint-text">
        Beschreibe deine Szene, Idee oder Geschichte. Daraus wird ein Storyboard mit Kameraführung
        und Schnitten geplant.
      </p>
      <textarea
        rows={8}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="z.B. Ein einsamer Astronaut entdeckt auf einem fremden Planeten Ruinen einer uralten Zivilisation..."
      />
      <div className="idea-input-row">
        <label>
          Anzahl Szenen (optional):
          <input
            type="number"
            min="1"
            max="30"
            placeholder="auto"
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
          {planning ? "Plane Storyboard..." : "🎬 Storyboard planen"}
        </button>
      </div>
    </div>
  );
}
