# Changelog

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
