import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { router } from "./routes.js";
import { castRouter } from "./castRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4123;

app.use(cors());
app.use(express.json({ limit: "25mb" })); // großzügig wg. base64 Storyboard-Bilder

app.use("/api", router);
app.use("/api", castRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

// Im Produktions-/Docker-Build liegt das gebaute Frontend unter ../public
// (siehe Dockerfile). Lokal im Dev-Modus läuft das Frontend separat über Vite
// und dieser Block greift einfach nicht, weil der Ordner fehlt.
const staticDir = path.join(__dirname, "..", "public");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
  console.log("Liefere gebautes Frontend aus", staticDir);
}

app.listen(PORT, () => {
  console.log(`VideoStallone Server läuft auf http://localhost:${PORT}`);
});
