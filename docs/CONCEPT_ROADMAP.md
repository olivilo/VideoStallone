# VideoStallone — Konzept: Mehrsprachigkeit, GUI & Roadmap

> Stand: 2026-06-24 · Status: **Vorschlag/Entwurf** — offene Entscheidungen siehe Abschnitt 7.

## 1. Ausgangslage

- **Frontend:** React 19 + Vite 8, aktuell **null** Laufzeit-Dependencies außer React.
- **Strings:** durchgehend hart auf Deutsch in ~10 Komponenten (`App.jsx`, `SettingsPanel.jsx`, `ProjectEditor.jsx`, `SceneCard.jsx`, `CastPanel.jsx` …).
- **Optik:** warmes „Cinema"-Dark-Theme (Sepia/Bernstein), Display-Font *Fraunces*, Body *Inter*. Bereits solide — Basis zum Verfeinern, nicht zum Wegwerfen.
- **Backend:** Node/Express, OpenRouter (Text/Bild/Video-Modelle) bereits integriert.

## 2. Ziele & Prinzipien

1. **Nativ bedienbar** — selbsterklärend, ohne Handbuch. Hilfe ist *dort*, wo man sie braucht (Tooltips, kontextuelle „?"-Punkte).
2. **8 Sprachen, gleichwertig** — kein „Deutsch zuerst, Rest halbfertig". Jede Sprache inkl. FAQ vollständig.
3. **Leichtgewichtig bleiben** — der No-Dependency-Charakter des Projekts ist ein Feature. i18n soll das nicht sprengen.
4. **Eat your own dogfood** — das Tool *ist* ein KI-Tool. Übersetzungen dürfen KI-gestützt erzeugt und dann handgeprüft werden.
5. **Inkrementell** — jede Phase ist für sich nutzbar und auslieferbar (GitHub + Docker zusammen, siehe `make release`).

## 3. Mehrsprachigkeit (i18n)

### 3.1 Sprachen

| Code | Sprache | Schrift | Anmerkung |
|------|---------|---------|-----------|
| `de` | Deutsch | Latein | aktuelle Quellsprache |
| `en` | English | Latein | empfohlene **Pivot-Sprache** für KI-Übersetzung |
| `sr` | Srpski (latinica) | Latein | bewusst Latinica, nicht Kyrillisch |
| `fr` | Français | Latein | |
| `es` | Español | Latein | |
| `pt` | Português | Latein | |
| `ru` | Русский | **Kyrillisch** | Font-Fallback nötig (s. 3.5) |
| `zh` | 中文 (简体) | **CJK** | Font-Fallback nötig (s. 3.5) |

### 3.2 Architektur — **react-i18next** (entschieden)

```
client/src/i18n/
  config.js             # i18next.init(): Sprachen, Detection, Fallback
  locales/
    en.json  de.json  sr.json  fr.json
    es.json  pt.json  ru.json  zh.json
```

- Dependencies: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- **Semantische Keys** statt deutscher Strings als Key: `settings.apiKey.title`, `scene.generateStoryboard`, `cost.estimateLabel`.
- **Hook:** `const { t } = useTranslation(); t("scene.duration", { seconds: 6 })`.
- **Plural:** echte i18next-Pluralregeln (`scene.count_one` / `scene.count_other` / für RU/ZH passende Formen) — kommt out of the box.
- **Detection-Reihenfolge:** `localStorage` → `navigator.language` → Fallback `en`.
- **Umschalter:** Globus-Dropdown im Header, Auswahl persistiert via Language-Detector in `localStorage`.

### 3.3 Übersetzungs-Pipeline (KI-gestützt)

- Quelle der Wahrheit: **`en.json`** (entschieden) + handgepflegtes `de.json` als zweiter Anker.
- Node-Skript `scripts/translate.mjs`:
  1. liest `en.json`,
  2. erkennt fehlende/veraltete Keys je Zielsprache,
  3. lässt sie per OpenRouter-LLM übersetzen (mit Kontext-Hinweis „UI eines Video-Tools, knapp, kein förmliches Sie/Du-Wirrwarr"),
  4. schreibt die Ziel-JSONs, markiert KI-generierte Werte zur Nachprüfung (`"_machine": true`).
- **FAQ-Texte werden grundsätzlich handgeprüft** — dort zählt Qualität mehr als Tempo.
- Vorteil: neue UI-Strings später = ein Skriptlauf statt 7× Handarbeit.

### 3.4 FAQ-System (nativ + pro Sprache)

- Eigener `faq`-Namespace je Sprache: Liste aus `{ q, a, category }`.
- Zugriff über **„?"-Icon im Header** → durchsuchbares Modal, gruppiert nach Kategorie:
  - *Erste Schritte* · *API-Key & Kosten* · *Modelle wählen* · *Charaktere & Konsistenz* · *Export & Film* · *Fehler beheben*
- Zusätzlich **kontextuelle Hilfe**: kleine „?"-Punkte an kniffligen Stellen (z. B. Dauer-Snapping, Seed, Negative-Prompt) öffnen den passenden FAQ-Eintrag.
- FAQ ist durchsuchbar und in der aktuell gewählten Sprache.

### 3.5 Schrift-/Script-Themen (wichtig, leicht übersehen)

- **Chinesisch (zh):** weder *Fraunces* noch *Inter* haben CJK-Glyphen → **Noto Sans SC** (oder System-`-apple-system`/`PingFang`/`Microsoft YaHei`) als Fallback laden, nur wenn `zh` aktiv.
- **Russisch (ru):** *Inter* deckt Kyrillisch ab, **Fraunces (Überschriften) jedoch nur eingeschränkt** → Display-Font für `ru` auf einen kyrillisch-fähigen Serif (z. B. *Noto Serif*) umschalten.
- Latein-Sprachen (de/en/sr/fr/es/pt) laufen unverändert.
- Keine RTL-Sprache dabei → kein RTL-Aufwand nötig.

## 4. GUI-Verbesserungen — **Größerer Umbau** (entschieden)

Cinema-Identität als Basis, aber strukturell modernisiert:

- **Seitenleisten-Navigation** statt Top-Tabs: links schmale Leiste (Projekte · Szenen · Cast & Entities · Einstellungen), rechts der Arbeitsbereich. Skaliert besser bei großen Projekten.
- **Light/Dark-Toggle:** zweites helles Palettenset über CSS-Variablen, umschaltbar im Header, Wahl persistiert in `localStorage`. Dark bleibt Default.
- **Header:** Logo · Workspace-Pfad · **Sprachumschalter** 🌐 · **Theme-Toggle** ☀️/🌙 · **Hilfe/FAQ** ❓ · Einstellungen ⚙️.
- **Sauberere Pipeline-Visualisierung:** Storyboard → Video als klarer Stepper mit Status-Punkten statt zweier Badge-Blöcke.
- **Toasts statt Inline-Banner** für Erfolg/Fehler (weniger Layout-Springen).
- **Bessere Empty-States & Onboarding:** erster Start führt durch API-Key → Workspace → erstes Projekt.
- **Konsistenz & A11y:** einheitliche Card-Radien/Abstände, dezente Motion, durchgängige Fokus-Ringe.
- **Responsiv:** brauchbar bis Tablet-Breite; Sidebar kollabiert zu Icons, Modell-Bar & Szenen-Grid brechen sauber um.

### 4.1 Theme-Token-System

Alle Farben laufen bereits über CSS-Variablen in `index.css`. Der Umbau führt zwei Paletten ein:

```css
:root[data-theme="dark"]  { --bg-base: #15130f; ... }   /* heutige Werte */
:root[data-theme="light"] { --bg-base: #faf6ee; ... }   /* neues helles Set */
```

Ein `data-theme`-Attribut am `<html>` schaltet um — Komponenten bleiben unverändert, da sie nur Variablen referenzieren.

## 5. Roadmap — neue Funktionen

Geordnet in Phasen. Phase 1 ist der aktuelle Auftrag; 2–5 sind Vorschläge zum Priorisieren.

### Phase 1 — Fundament (jetzt)
- react-i18next + 8 Sprachen (EN-Pivot) + KI-Übersetzungs-Skript
- Mehrsprachige FAQ + kontextuelle Hilfe
- GUI-Umbau: Seitenleiste, Light/Dark-Toggle, Header-Controls, Stepper, Toasts, Onboarding, Fonts/CJK/Cyrillic

### Phase 2 — Story & Vorlagen 📝 *(als Erstes gewählt)*
- **Templates:** Musikvideo · Werbung/Ad · Trailer · Erklärvideo · Kurzfilm — vorgefüllte Szenenstruktur & Pacing.
- **Skript-/Beat-Modus:** Drehbuch schreiben → automatisch in Szenen zerlegen.
- **Orte- & Requisiten-Bibliothek** (analog zur bestehenden Cast/Entities-Logik).
- **„Story fortsetzen"** / Sequels aus bestehendem Projekt.

### Phase 3 — Audio & Vertonung 🎙️
- **Sprecher/Narration (TTS)** pro Szene — *direkt mit der Mehrsprachigkeit gekoppelt*: Erzählstimme in jeder der 8 Sprachen.
- **Musik:** KI-generierter Score oder kuratierte lizenzfreie Bibliothek, Stimmung pro Film.
- **Sound-Effekte** pro Szene.
- **Mix beim Export:** Musik-Ducking unter Sprache, Lautstärke-Balance.
- (später) **Lip-Sync** für sprechende Charaktere.

### Phase 4 — Timeline & Schnitt ✂️
- **Visuelle Timeline:** Szenen als Thumbnails ziehen, trimmen, umsortieren.
- **Echte Übergänge** beim ffmpeg-Export (Crossfade, Schnitt, Wipe) — aktuell nur stumpfes Aneinanderhängen.
- **Trim In/Out** pro Clip.
- **Format-Presets:** 9:16 (TikTok/Reels), 16:9 (YouTube), 1:1 (Insta), 21:9 (Cinematic) — inkl. korrektem Modell-Hinweis.
- **Text-Overlays / Titel / Untertitel** — Untertitel automatisch aus der Narration, in jeder Sprache, einbrennbar.

### Phase 5 — Politur & Skalierung 🚀
- **Budget-Deckel & Ausgaben-Tracker** mit Warnung vor teuren Läufen (baut auf der CostBar auf).
- **Generierungs-Queue** mit Pause/Resume, Retry-Strategie, Parallelitäts-Limit.
- **Varianten-Batch:** pro Szene 3 Versionen erzeugen, beste auswählen.
- **Projekt-Bundle Export/Import** (.zip) zum Teilen/Sichern.
- **Lokale Modelle** (wenn verfügbar) als Alternative zu OpenRouter — passend zum erklärten Zukunftsplan.
- **Prompt-Enhancer / Director's Notes:** KI verbessert Beschreibungen & schlägt Kamera/Pacing vor.

## 6. Aufwand (grob)

| Block | Aufwand | Risiko |
|-------|---------|--------|
| i18n-Runtime + Keys extrahieren | mittel (viele Strings, aber mechanisch) | niedrig |
| KI-Übersetzungs-Skript + 8 Locales | klein–mittel | niedrig |
| FAQ-Inhalte (handgeprüft, 8 Sprachen) | mittel | niedrig |
| GUI-Politur | mittel | niedrig |
| Font/CJK/Cyrillic-Fallbacks | klein | mittel (Testen je Sprache) |

## 7. Entscheidungen (festgezurrt 2026-06-24)

1. **i18n-Technik:** ✅ **react-i18next** (+ `i18next`, `i18next-browser-languagedetector`).
2. **GUI-Umfang:** ✅ **Größerer Umbau** — Seitenleisten-Navigation + Light/Dark-Toggle.
3. **Erster Funktionsbereich nach dem Fundament:** ✅ **Story & Vorlagen** (Phase 2).
4. **Quell-/Pivot-Sprache:** ✅ **Englisch** (`en.json` Quelle, `de.json` Handanker, KI für die übrigen 6).

## 8. Phase-1-Umsetzungsplan (konkrete Schritte)

1. **Deps installieren:** `i18next react-i18next i18next-browser-languagedetector`.
2. **i18n-Gerüst:** `src/i18n/config.js`, `locales/en.json` + `de.json` (semantische Keys), Init in `main.jsx`.
3. **Theme-System:** `index.css` auf `[data-theme]` umstellen (Dark + Light), `ThemeProvider`/Toggle, Persistenz.
4. **App-Shell-Umbau:** neue Seitenleiste + Header (🌐 Sprache, ☀️/🌙 Theme, ❓ Hilfe, ⚙️).
5. **Strings extrahieren:** Komponente für Komponente von Deutsch auf `t("…")` umstellen, Keys nach `en.json`/`de.json`.
6. **FAQ-System:** `faq`-Namespace + durchsuchbares Hilfe-Modal + kontextuelle „?"-Punkte.
7. **KI-Übersetzungs-Skript:** `scripts/translate.mjs` füllt `sr/fr/es/pt/ru/zh` aus `en.json`.
8. **Fonts:** CJK-Fallback (zh) + kyrillischer Display-Font (ru) bedingt laden.
9. **Release:** `make release` (GitHub + Docker zusammen).

Schritte 1–4 = Fundament (zuerst, reviewbar), 5–8 = Durchzug, 9 = Auslieferung.

---

# Erweiterung (2026-06-24): Übergänge, Audio, Director-Settings, 11 Sprachen

## 9. Überarbeiteter Workflow

Der durchdachte Ablauf, der Übergänge zur Erstklasse macht:

1. **Gesamttext definieren** — Idee + Szenenanzahl + Inhalte (vorhanden: „Plan").
2. **Pro Szene definieren** — *was passiert*, Kamera, Dauer, **Übergang zur nächsten Szene**, Director-Format. Storyboard-Bild generieren & freigeben.
3. **Videos erzeugen** — pro Szene; bei `morph` in kausaler Reihenfolge (s. 11).
4. **Zusammenführen** — Export mit echten Übergängen + Audio-Crossfade (s. 12).

## 10. Übergänge — Datenmodell & Verankerung

**Entscheidung: Übergang ist „ausgehend" (outgoing).** Jede Szene besitzt, *wie sie in die nächste übergeht*:

```js
scene.transitionOut = {
  type: "cut" | "dissolve" | "fadeblack" | "fadewhite"
       | "wipeleft" | "wiperight" | "wipeup" | "wipedown"
       | "slideleft" | "slideright" | "morph",
  durationMs: 500   // Überlappung/Blenddauer; bei cut/morph = 0
}
```

Begründung (Frage „Anfang oder Ende?"): Ein Übergang liegt immer zwischen einem Paar N → N+1. Hängt er am **Ende** von N, entscheidet man beim Entwerfen von N, wie übergeben wird — und beim `morph` treibt N's Endframe direkt die Generierung von N+1 (dessen Startframe = N's Endframe). Das hält die Kette **vorwärtsgerichtet und kausal**. Die letzte Szene hat keinen `transitionOut`.

Das bestehende Freitext-Feld `transition` (Beschreibung) bleibt als Prompt-Kontext erhalten; neu ist das **strukturierte** `transitionOut` für den tatsächlichen Schnitt.

**Dropdown:** Ein Selektor pro Szene (am unteren Rand der Szene, „→ nächste Szene"). Bei Auswahl ≠ `cut` erscheint ein Dauer-Feld.

## 11. Morphing-Kette (das anspruchsvolle Stück)

Wunsch: „das letzte Bild der vorherigen Szene = das erste der nächsten".

- Ist `scene[N].transitionOut.type === "morph"`:
  1. Nach Generierung/Freigabe von Video N wird dessen **letzter Frame** extrahiert (`ffmpeg -sseof -0.05 -i N.mp4 -frames:v 1 endframe.png`).
  2. Dieser Frame wird **Startframe** (`frame_images` → `first_frame`) der Video-Generierung von N+1 → N+1 beginnt exakt dort, wo N endete.
- **Reihenfolge erzwungen:** Eine Szene mit eingehendem Morph (Vorgänger = morph) darf erst generieren, wenn der Vorgänger ein Video hat. Der Batch-Generator respektiert diese Abhängigkeitskette.
- **Stale-Handling:** Wird N neu generiert, werden nachgelagerte Morph-Szenen als „Startframe veraltet" markiert und zur Neugenerierung vorgeschlagen.
- **Export:** Da die Grenzframes identisch sind, ist ein harter Schnitt unsichtbar (optional 1–2 Frame-Dissolve zum Kaschieren von Kompressionsunterschieden).

## 12. Export mit Übergängen + Audio (kein Abschneiden)

- **Schneller Pfad:** Sind alle Übergänge `cut`/`morph` → bisheriger `-f concat` Demuxer (verlustarm, schnell).
- **Übergangs-Pfad:** Sobald ein `xfade`-Typ (dissolve/fade*/wipe*/slide*) vorkommt → `filter_complex` mit:
  - **Video:** `xfade=transition=<typ>:duration=<d>:offset=<kumulativ>` zwischen aufeinanderfolgenden Clips.
  - **Audio:** `acrossfade=d=<d>` über dieselbe Überlappung — **so wird Audio in Übergängen nicht abgeschnitten**, sondern sauber überblendet.
  - Clips ohne Tonspur erhalten eine Stille-Spur (`anullsrc`), damit `acrossfade` nicht bricht.
  - Gesamtlänge = Σ Cliplängen − Σ Überlappungen (korrekte Offset-Berechnung).

## 13. Audio-Schalter filtert Video-Modelle (on the fly)

- Globaler **„Mit Audio"-Schalter an der Modell-Leiste** (oben). Ist er an, zeigt das Video-Modell-Dropdown **nur audio-fähige Modelle**.
- Quelle der Audio-Fähigkeit: API-Feld falls vorhanden, sonst gepflegtes `AUDIO_CAPABLE`-Set (z. B. Veo 3.1 nativ, Kling mit Audio, Sora 2).
- Ist das aktuell gewählte Modell nicht audio-fähig und Audio wird aktiviert → Hinweis + Auswahl zurücksetzen.

## 14. Director-/Format-Einstellungen

- **Projekt-Filmformat:** Seitenverhältnis (16:9 · 9:16 · 1:1 · 21:9 · 4:5) — bestimmt die Export-Leinwand.
- **Export-Einstellungen (Projekt):** Auflösung (480p/720p/1080p), fps (24/25/30), Container/Codec (mp4·H.264 Standard, optional mov/ProRes, webm/VP9).
- **Pro Szene (Override):** Auflösung/fps, sichtbar in den Szenen-Einstellungen. Speist sowohl Video-Generierung (`aspect_ratio`, `resolution`) als auch den ffmpeg-Export (`scale`/`pad`/`fps`).
- Unterschiedliche Seitenverhältnisse je Szene werden beim Export auf die Projekt-Leinwand normalisiert (Letterbox/Pad).

## 15. Sprachen — jetzt 11

`en · de · sr (latinica) · fr · es · pt · ru · zh (简体) · zh-Hant (繁體) · hi (Devanagari) · ar (RTL)`

- **Arabisch:** Rechts-nach-links → `dir="rtl"` am `<html>`, Layout-Spiegelung via logischer CSS-Eigenschaften.
- **Script-Fonts:** Devanagari (hi), Arabisch (ar), Traditional CJK (zh-Hant) als bedingte Fallbacks.
- **Übersetzung:** lokal via **LM Studio** (`scripts/translate.mjs`, Modell z. B. `aya-expanse-8b-mlx`) aus `en.json`; FAQ handgeprüft.

## 16. Empfohlene Bau-Reihenfolge

1. **11 Sprachen + RTL + Fonts + LM-Studio-Übersetzung** (in Arbeit).
2. **Strings restlicher Komponenten → t()** (Voraussetzung, dass Übersetzung alle Seiten erreicht).
3. **Übergänge: Dropdown + Modell** (sichtbar, ohne Backend-Risiko).
4. **Director-/Format-Einstellungen** + **Audio-Modell-Filter**.
5. **Export mit xfade/acrossfade** (Übergänge wirken).
6. **Morphing-Kette** (anspruchsvollstes Stück zuletzt).
