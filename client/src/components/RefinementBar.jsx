import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function RefinementBar({ onRefine, refining }) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");

  return (
    <div className="refinement-bar">
      <input
        type="text"
        placeholder={t("refine.placeholder")}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && instruction.trim() && onRefine(instruction.trim())}
      />
      <button
        className="btn-secondary"
        disabled={!instruction.trim() || refining}
        onClick={() => {
          onRefine(instruction.trim());
          setInstruction("");
        }}
      >
        {refining ? t("refine.applying") : t("refine.apply")}
      </button>
    </div>
  );
}
