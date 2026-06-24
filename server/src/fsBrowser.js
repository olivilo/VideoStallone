import fs from "fs";
import path from "path";
import os from "os";

/**
 * Listet Unterordner eines Pfads auf, damit das Frontend einen
 * Ordner-Browser (Dropdown/Baum) anzeigen kann.
 */
export function listDirectory(targetPath) {
  const resolved = resolveSafePath(targetPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Pfad existiert nicht: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Pfad ist kein Ordner: ${resolved}`);
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  return {
    path: resolved,
    parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
    folders
  };
}

export function resolveSafePath(inputPath) {
  if (!inputPath || inputPath.trim() === "") {
    return os.homedir();
  }
  // ~ Expansion für Komfort, falls jemand das von Hand eintippt
  let p = inputPath.trim();
  if (p.startsWith("~")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function pathExists(p) {
  return fs.existsSync(p);
}

export function createFolder(parentPath, name) {
  const resolvedParent = resolveSafePath(parentPath);
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!safeName) throw new Error("Ungültiger Ordnername");
  const newPath = path.join(resolvedParent, safeName);
  if (fs.existsSync(newPath)) {
    throw new Error("Ordner existiert bereits");
  }
  fs.mkdirSync(newPath, { recursive: true });
  return newPath;
}
