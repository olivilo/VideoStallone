export function buildScenePlanningMessages(idea, targetSceneCount) {
  const countHint = targetSceneCount
    ? `Erzeuge genau ${targetSceneCount} Szenen.`
    : "Wähle eine sinnvolle Anzahl an Szenen (meist 4-10), je nachdem wie viel Handlung die Geschichte trägt.";

  const system = `Du bist ein erfahrener Regisseur und Storyboard-Artist. Du zerlegst eine Filmidee oder Geschichte in einzelne, klar abgegrenzte Szenen, die später nacheinander als kurze Videoclips (3-15 Sekunden je Szene) generiert werden.

Für jede Szene brauchst du:
- title: Kurzer Szenentitel (3-6 Wörter)
- description: Detaillierte visuelle Beschreibung der Szene für ein Text-zu-Video-Modell. Sei sehr konkret: Setting, Lichtstimmung, was passiert, Stimmung, Stil. Schreibe das so, dass es direkt als Video-Prompt funktioniert (Englisch, da Videomodelle auf Englisch am besten reagieren).
- storyboardPrompt: Eine Variante der description, optimiert für ein STANDBILD (Storyboard-Frame) statt Video — beschreibt die eine Schlüsselkomposition dieser Szene.
- camera: Kamerabewegung/-einstellung (z.B. "slow dolly in", "static wide shot", "handheld tracking shot following the subject", "drone shot pulling up")
- transition: Wie diese Szene in die nächste übergeht (z.B. "hard cut", "cross dissolve", "whip pan", "match cut on action")
- durationSeconds: geschätzte Länge dieser Szene als Videoclip (zwischen 4 und 15)

${countHint}

Antworte AUSSCHLIESSLICH mit validem JSON in dieser Form, ohne Markdown-Codeblock, ohne Erklärtext:
{
  "scenes": [
    { "title": "...", "description": "...", "storyboardPrompt": "...", "camera": "...", "transition": "...", "durationSeconds": 6 }
  ]
}`;

  const user = `Hier ist die Idee / Geschichte:\n\n${idea}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

export function parseScenePlanningResponse(rawContent) {
  let cleaned = rawContent.trim();
  // Falls das Modell trotz Anweisung einen Codeblock liefert, robust entfernen
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.scenes)) {
    throw new Error("Antwort enthielt kein 'scenes'-Array");
  }
  return parsed.scenes;
}

export function buildSceneRefinementMessages(idea, existingScenes, instruction) {
  const system = `Du bist ein Regisseur, der ein bestehendes Storyboard überarbeitet. Du bekommst die ursprüngliche Idee, die aktuelle Szenenliste als JSON, und eine Änderungsanweisung. Wende NUR die angeforderte Änderung an und gib die VOLLSTÄNDIGE, aktualisierte Szenenliste im gleichen JSON-Format zurück. Ändere nichts an Szenen, die nicht von der Anweisung betroffen sind.

Format (kein Markdown, nur JSON):
{ "scenes": [ { "title": "...", "description": "...", "storyboardPrompt": "...", "camera": "...", "transition": "...", "durationSeconds": 6 } ] }`;

  const user = `Ursprüngliche Idee:\n${idea}\n\nAktuelle Szenen:\n${JSON.stringify(
    existingScenes.map((s) => ({
      title: s.title,
      description: s.description,
      storyboardPrompt: s.storyboardPrompt,
      camera: s.camera,
      transition: s.transition,
      durationSeconds: s.durationSeconds
    })),
    null,
    2
  )}\n\nÄnderungsanweisung:\n${instruction}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}
