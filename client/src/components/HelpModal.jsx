import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function HelpModal({ onClose }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const items = t("faq.items", { returnObjects: true });
  const categories = t("faq.categories", { returnObjects: true });
  const list = Array.isArray(items) ? items : [];
  const cats = categories && typeof categories === "object" ? categories : {};

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((it) => `${it.q} ${it.a}`.toLowerCase().includes(q))
      : list;
    const groups = {};
    for (const it of filtered) {
      (groups[it.category] ||= []).push(it);
    }
    return groups;
  }, [query, list]);

  const totalShown = Object.values(grouped).reduce((n, g) => n + g.length, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("faq.title")}</h3>
          <button className="btn-icon" onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <input
          className="help-search"
          type="search"
          placeholder={t("faq.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="help-body">
          {totalShown === 0 && <p className="hint-text">{t("faq.noResults")}</p>}
          {Object.entries(grouped).map(([cat, entries]) => (
            <section key={cat} className="help-category">
              <h4 className="help-category-title">{cats[cat] || cat}</h4>
              {entries.map((it, i) => (
                <details key={i} className="help-item">
                  <summary>{it.q}</summary>
                  <p>{it.a}</p>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
