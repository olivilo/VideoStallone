# Changelog

## v0.2.1 — 2026-06-24

### Bug fixes
- Fixed new-seed flow: generating a new storyboard image while a video is already approved no longer blocks video re-generation. Video generation now also works when the storyboard is in "ready" state (image exists but not yet re-approved).
- Added "🎲 Neues Storyboard-Bild" button on approved storyboards so users can regenerate the image without resetting the scene to pending.
- Fixed cost estimation showing "kein Preis bekannt" for most models: `VIDEO_PRICING_MAP` now includes numeric `pricePerSec` values used as fallback when the API returns no pricing. Estimates now also use the snapped (model-valid) duration instead of the raw stored value.
- Fixed `push-global` cast route crashing when the global `references/` directory did not yet exist.
- Cast import now copies photos in addition to the reference image, so imported characters have their visual data in the new project.
- Fixed `imageModel` with `~` prefix (e.g. `~google/gemini-flash-latest`) causing all storyboard generations to fail silently. Both the per-scene and batch routes now strip invalid leading characters.
- Storyboard error messages are now saved to `scene.storyboardError` and displayed in the scene card so the root cause is visible instead of just a red badge.
- Added `predev` npm script that automatically kills any leftover process on port 4123 before starting — `npm run dev` no longer fails with `EADDRINUSE` after a background process was left running.

## v0.2.0 — 2026-06-24

### Model selection overhaul
- **Video model now first** in the model bar with a pulsing "Select first!" badge until chosen — durations are model-specific so this must be picked before scenes are configured
- **All three model dropdowns** (video, image, text) replaced with a searchable combobox (`ModelSelect`) showing model name, provider, context size, and live pricing — supports free-text entry for any OpenRouter model ID
- **Live model lists** fetched directly from OpenRouter API at startup — text and image models now populated from `/api/v1/models` filtered by modality, no more hardcoded lists
- Image model filter widened to catch multimodal models (e.g. Gemini Flash) that output images

### Duration capabilities — corrected and dynamic
- **Fixed wrong capabilities map**: Wan 2.6/2.7 corrected to `[5, 10]` (was `[4, 6, 8]`), Veo 3.1 corrected to `[4, 6, 8]` (was `[5, 6, 7, 8]`), new models added (`alibaba/happyhorse`, `x-ai/grok-imagine-video`, `kwaivgi/kling`)
- **Range-type models** (Kling, HappyHorse, Grok) now use `{ min, max }` clamping instead of a fixed list
- **Live capabilities** from OpenRouter `/api/v1/videos/models` override the fallback map — `supported_durations` per model cached in-memory on first load
- Client loads live capabilities on startup via `/api/video-models/capabilities` — `setLiveCapabilities()` updates the client-side snap/display logic
- **"Snap durations" button** now shows exactly which scenes changed: `✓ 3 Szenen: S1 6s→5s, S3 6s→5s`; returns a clear error if the model has no known capabilities

### Cost tracking
- **CostBar** at the bottom of each project showing:
  - *Bisherige Video-Kosten*: sum of `scene.videoCost` for all generated videos
  - *Geschätzte Batch-Kosten*: pending scenes × price/s × duration for the selected model
  - *Gesamt Film*: total duration and estimated combined cost
- Video cost stored per scene at job submission time (`pricePerSec × snappedDuration`)
- Live pricing cached from `/api/v1/videos/models` response (`pricing.video` / `pricing.per_second`)

### Bug fixes
- Fixed Cast description generation wiping unsaved draft fields — draft is now merged server-side before the LLM call and saved atomically
- Fixed photo reference workflow — uploaded photos now used automatically as visual anchors even without a generated reference image; `📌` button sets any photo as explicit reference
- Added 45s timeout on video job submission, 20s on status polling, 120s on download
- Server restart recovery: open video jobs (status `queued`/`generating`) automatically resume polling when the project is next loaded
- "Wird gesendet..." badge appears immediately on video submit before server responds

## v0.1.0 — Initial Release (2026-06-24)

First public release of VideoStallone. The full feature set built from scratch:

### Core pipeline
- **Scene planner** — paste an idea, LLM breaks it into scenes with descriptions, camera angles, transitions, and durations
- **Storyboard generator** — generates a cinematic still image per scene using an image model
- **Video generator** — submits async video jobs via OpenRouter, polls for completion, downloads and saves clips
- **Film export** — assembles approved clips into a single film via ffmpeg

### Visual consistency
- **Cast & Entities system** — create characters and physical entities (vehicles, objects, locations) with photos, manual descriptions, and AI-generated prompt-optimized descriptions
- **Reference image generation** — uses uploaded photos + description to generate a visual anchor image; injected into every scene's prompt
- **Global library** — save cast entries globally and import them into any project
- **Two-tier storage** — `~/.videostallone/cast/` (global) + `project/cast/` (project copy)
- **Keyword injection** — entries can be set to inject always, or only when their keywords appear in the scene text
- **Negative prompts** — per-project character consistency settings to prevent unwanted morphing

### Style system
- Per-film and per-scene style override: Cinematic, Comic, Anime, Oil Painting, Watercolor, 3D Render
- Style prefix automatically prepended to image and video prompts

### Seed management
- Every generation stores its seed
- Re-using the same seed reproduces the same result (no wasted API tokens)
- New seed = new variant
- Variant history per scene (up to 5 storyboard variants, 3 video variants)
- Restore any previous variant with one click

### Model support
- Pre-populated dropdowns for text, image, and video models
- Video model capabilities map — each model's allowed durations are known client-side
- Smart duration snapping — auto-corrects to nearest valid duration before submitting

### UX
- Spinner + progress bar for video generation (indeterminate or % fill when available)
- Batch generation with live polling every 5s
- Retry button for failed scenes after a batch run
- Tab-based project view: Scenes / Cast & Entities
- Workspace folder picker, API key stored locally with `0600` permissions

### Infrastructure
- React 19 + Vite 8 frontend
- Node.js 22 + Express backend (ESM modules)
- Multi-stage Docker build (Alpine base, ~130MB image)
- Published to Docker Hub: `olivilo23/videostallone:latest`
- Source code on GitHub: `olivilo/VideoStallone`
- API key never written to project files or logs

### Bug fixes during development
- Fixed video job `frame_images` API format (`frame_type` + `type` + `image_url` all required)
- Fixed duration mismatch error for models with restricted allowed values
- Fixed batch generation UI not showing progress after immediate server response
- Fixed retry button not appearing when batch completed with errors
