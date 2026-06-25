# VideoStallone — Projektstand & TODO

> Stand: 2026-06-25 · Version: **v0.4.0** (GitHub `olivilo/VideoStallone`, Docker `olivilo23/videostallone:latest`)
> Projekt vorerst pausiert. Diese Datei = Einstiegspunkt für später.

---

## ✅ Wie weit wir kamen (erledigt)

| Version | Inhalt |
|---|---|
| **v0.1.0** | Kern-Pipeline: Idee → Szenenplan (LLM) → Storyboard-Bild → Video-Clip → Film-Export (ffmpeg). Cast & Entities (Charaktere/Objekte mit Fotos + KI-Beschreibung), globale Bibliothek, Stil-System, Seed-Verlauf/Varianten. |
| **v0.2.x** | Modell-Auswahl (Text/Bild/Video) mit Preisen, Kostenleiste, Dauer-Capabilities + „Snap", diverse Bugfixes (Cast-Draft, Video-Timeout, Bildmodell-Filter). |
| **v0.3.0** | **i18n: 11 Sprachen** (inkl. Hindi, Arabisch/RTL, Traditional Chinese) + Script-Fonts, **Light/Dark-Theme**, **Seitenleisten-Layout**, durchsuchbare **FAQ**, **lokaler ComfyUI-Bild-Provider** (umschaltbar, OpenRouter-Fallback), LM-Studio-Übersetzungspipeline. |
| **v0.4.0** | **Film-Format-Dropdown** (steuert Bild/Video/Export einheitlich), **robuster Export** (Letterbox-Normalisierung statt Verzerrung), **Übergänge als eigene Clips** („Nahtlos" = separater Brücken-Clip mit eigener Sekunden-Länge), **Sound/Musik getrennt**, **Negative-Prompt gegen Rückwärtsbewegung**, „Alle Storyboards"-Knopf, Ansichts-Umschalter (Alles/Texte/Storyboards/Videos), Reorder-Pfeile. |

---

## ⬜ Was noch fehlt (Backlog, priorisiert)

### Übergänge
- [ ] **Soft-Übergänge rendern** (dissolve/wipe/fade) via ffmpeg `xfade`/`acrossfade` beim Export *(Task #9 — der eine offene Punkt)*. Aktuell werden sie gespeichert/angezeigt, aber als harter Schnitt exportiert.
- [ ] Übergangs-Brücken-Clips in den Batch („Alle generieren") integrieren (aktuell manuell pro Szene, nachdem das Szenen-Video fertig ist).

### Audio
- [ ] **KI-Musik am Ende generieren** statt nur Upload (z.B. ComfyUI-Audio-Nodes MusicGen/AudioLDM, oder externer Dienst).
- [ ] Lautstärke-Regler für Musik (aktuell fix: 35 % unter Sound, 90 % ohne).
- [ ] SFX getrennt von Sprache/Sound.

### Lokale Generierung (ComfyUI)
- [ ] **Cast-Referenzfotos im ComfyUI-Pfad** nutzen (IPAdapter/PhotoMaker/ReActor) → Charakter-Konsistenz lokal. Aktuell nur Text→Bild; Referenzbilder funktionieren nur über OpenRouter.
- [ ] Flux-GGUF-Workflow zusätzlich zum Checkpoint-Workflow.
- [ ] ComfyUI auch als lokaler **Video**-Provider (AnimateDiff/CogVideo — Nodes sind installiert).

### Director / Format
- [ ] Format-Override **pro Szene** (aktuell nur projektweit).
- [ ] fps/Codec/Container im Export-UI wählbar (Backend kann's bereits via `exportFormat`).

### Workflow / UX
- [ ] Budget-Deckel / Ausgaben-Warnung vor teuren Läufen.
- [ ] Generierungs-Queue mit Pause/Resume, Parallelitäts-Limit.
- [ ] Varianten-Batch (3 Versionen pro Szene, beste wählen).
- [ ] Projekt-Bundle Export/Import (.zip) zum Teilen/Sichern.
- [ ] Story-/Skript-Modus + Vorlagen (Musikvideo/Werbung/Trailer/Erklärvideo).
- [ ] Orte- & Requisiten-Bibliothek (analog zu Cast).

### i18n / Qualität
- [ ] Maschinen-Übersetzungen **menschlich prüfen** (FAQ + UI), Marker `"_machine": true`.
- [ ] Wenige Fallback-Strings nachübersetzen (ar: 4, sr/hi: je 1 → fallen auf Englisch zurück).
- [ ] JS-Bundle code-splitten (aktuell ~512 KB in einem Chunk).

---

## ⚠️ Bekannte Einschränkungen
- **Bild-/Video-Generierung braucht OpenRouter-Credits** (oder lokales ComfyUI für Bilder). Aktuell: Credits leer → nur nicht-generative Teile testbar.
- **Übergangs-Clips** brauchen ein Video-Modell mit **End-Bild-Support** (z.B. Kling).
- **Soft-Übergänge** (dissolve/wipe/fade) werden noch nicht gerendert (s. Backlog #9).
- ComfyUI-Desktop läuft auf **Port 8000** (nicht 8188) — in den Einstellungen hinterlegt.

---

## ▶️ Wie man weitermacht
```bash
# Backend (Port 4123)
cd server && npm run dev
# Frontend (Port 5173)
cd client && npm run dev
# Browser: http://localhost:5173

# Release (GitHub + Docker Hub zusammen)
make release VERSION=vX.Y.Z

# Übersetzungen neu generieren (lokal via LM Studio, gratis)
LMSTUDIO_TOKEN=... node scripts/translate.mjs
```

Architektur-Details & Designentscheidungen: siehe `docs/CONCEPT_ROADMAP.md`.
Änderungshistorie: siehe `CHANGELOG.md`.
