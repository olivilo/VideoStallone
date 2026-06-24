import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getTheme, toggleTheme } from "../theme";

export default function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setThemeState] = useState(getTheme());
  const isDark = theme === "dark";
  const label = isDark ? t("theme.toLight") : t("theme.toDark");

  return (
    <button
      className="btn-icon theme-toggle"
      onClick={() => setThemeState(toggleTheme())}
      title={label}
      aria-label={label}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
