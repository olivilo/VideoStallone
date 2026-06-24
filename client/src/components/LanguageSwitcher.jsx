import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n/config";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const activeCode = i18n.resolvedLanguage || i18n.language || "en";
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === activeCode) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(code) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        className="btn-icon lang-trigger"
        onClick={() => setOpen((o) => !o)}
        title={t("language.select")}
        aria-label={t("language.select")}
      >
        🌐 <span className="lang-current">{current.native}</span>
      </button>
      {open && (
        <div className="lang-menu" role="listbox">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === current.code}
              className={`lang-option ${l.code === current.code ? "lang-option-active" : ""}`}
              onClick={() => pick(l.code)}
            >
              <span className="lang-native">{l.native}</span>
              <span className="lang-label">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
