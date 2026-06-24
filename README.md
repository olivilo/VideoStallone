# 🎬 VideoStallone

**AI-powered video storyboard and film production tool — runs entirely on your local machine.**

Turn a text idea into a full storyboard, generate images for each scene, produce video clips via AI, and assemble them into a film — all from a simple web UI. Currently built around [OpenRouter](https://openrouter.ai) because that's what works great for this use case, but the architecture is easy to adapt.

This is a fun personal project, open for anyone to use, fork, or build on.

---

## What it does

1. **Plan** — Paste a film idea or story. An LLM breaks it into scenes with descriptions, camera angles, transitions, and durations.
2. **Storyboard** — Generate a cinematic still image for each scene using an image model. Review, regenerate with a new seed, or restore previous versions.
3. **Video** — Submit each scene as a video job (runs async in the background). Watch the live progress indicator as clips come in.
4. **Export** — Assemble all approved clips into a single film via ffmpeg.

### Extra features

- **Cast & Entities** — Create persistent characters and entities (people, vehicles, objects) with reference photos and AI-generated descriptions. They are automatically injected into every scene's prompt for visual consistency.
- **Global Library** — Save characters/entities globally and import them into any project.
- **Style system** — Set a visual style (Cinematic, Comic, Anime, Oil Painting, Watercolor, 3D Render) per film or per individual scene.
- **Seed history** — Every generation stores its seed. Roll back to any previous image or video version.
- **Character consistency** — Configure character descriptions and negative prompts to prevent unwanted morphing between frames.
- **Smart duration picker** — Durations are automatically snapped to values supported by each video model.
- **Docker support** — Single-image build for self-hosting.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8 |
| Backend | Node.js 22, Express |
| AI APIs | [OpenRouter](https://openrouter.ai) (text, image, video) |
| Storage | Local filesystem (JSON project files + generated assets) |
| Export | ffmpeg (separate install) |

---

## Quick start (local dev)

**Requirements:** Node.js 20+, an [OpenRouter API key](https://openrouter.ai/keys)

```bash
# Clone
git clone https://github.com/olivilo/VideoStallone.git
cd VideoStallone

# Terminal 1 — Backend (port 4123)
cd server
npm install
npm run dev

# Terminal 2 — Frontend (port 5173, proxies /api to backend)
cd client
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

On first launch the app will ask for:
1. Your OpenRouter API key (stored locally in `~/.videostallone/.api_key`, never leaves your machine)
2. A workspace folder where your projects will be saved

---

## Docker (self-hosting)

```bash
docker compose up -d --build
```

Serves the full app (frontend + backend) at **http://localhost:4123**.

Edit `docker-compose.yml` to mount your workspace folder:

```yaml
volumes:
  - videostallone-config:/root/.videostallone   # persists API key & settings
  - /your/projects/folder:/your/projects/folder # your workspace
```

---

## Project structure

```
VideoStallone/
├── server/                 # Node/Express backend
│   └── src/
│       ├── index.js        # entry point
│       ├── routes.js       # main API routes
│       ├── castRoutes.js   # cast & entities API
│       ├── cast.js         # cast data module
│       ├── openrouter.js   # OpenRouter API client
│       ├── projects.js     # project file management
│       ├── videoJobManager.js  # async polling for video jobs
│       ├── scenePrompts.js # LLM prompt builders
│       ├── config.js       # local config / API key storage
│       └── fsBrowser.js    # filesystem browser helper
│
└── client/                 # React frontend
    └── src/
        ├── components/
        │   ├── ProjectEditor.jsx   # main project view (tabs: scenes / cast)
        │   ├── SceneCard.jsx       # per-scene UI with storyboard + video
        │   ├── CastPanel.jsx       # cast & entities management
        │   ├── IdeaInput.jsx       # initial idea entry
        │   ├── RefinementBar.jsx   # storyboard refinement
        │   ├── ProjectList.jsx     # project browser
        │   ├── SettingsPanel.jsx   # API key + model defaults
        │   └── FolderPicker.jsx    # workspace folder selector
        ├── api/client.js           # API client
        └── videoModelCapabilities.js  # per-model duration constraints
```

Each project on disk:
```
MyProject/
├── project.json        # scenes, status, settings
├── storyboards/        # generated still images (PNG)
├── clips/              # generated video clips (MP4)
└── cast/               # project-level cast data + photos
```

---

## Supported models (via OpenRouter)

VideoStallone works with any model available on OpenRouter. Some good defaults:

| Purpose | Models |
|---|---|
| Scene planning | `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`, `google/gemini-2.5-flash` |
| Storyboard images | `google/gemini-2.5-flash-image`, `black-forest-labs/flux-1.1-pro`, `openai/gpt-image-1` |
| Video | `google/veo-3.1-fast`, `kuaishou/kling-v3-standard`, `alibaba/wan-2.6` |

The video model list is fetched live from OpenRouter with current pricing displayed.

---

## API key security

Your OpenRouter API key is stored in `~/.videostallone/.api_key` with `0600` file permissions (owner-read-only). It is never written to any project file or log, and is only sent directly to `openrouter.ai` — never through any third-party service.

---

## Contributing

Pull requests welcome. This is a side project so response times may vary, but feel free to open issues, suggest features, or submit fixes.

---

## License

MIT
