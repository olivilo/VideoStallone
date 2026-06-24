import { useState } from "react";

export default function RefinementBar({ onRefine, refining }) {
  const [instruction, setInstruction] = useState("");

  return (
    <div className="refinement-bar">
      <input
        type="text"
        placeholder='z.B. "Mach Szene 3 dramatischer" oder "Füge nach Szene 2 eine Verfolgungsjagd ein"'
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
        {refining ? "Wende an..." : "↻ Storyboard anpassen"}
      </button>
    </div>
  );
}
