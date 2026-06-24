const KEY = "vs-theme";

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore storage errors (private mode etc.) */
  }
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
