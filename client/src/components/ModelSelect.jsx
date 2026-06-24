import { useEffect, useRef, useState } from "react";

export default function ModelSelect({ value, onChange, models, loading, error, placeholder = "Modell suchen..." }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef();

  // Sync display text when value changes externally
  const selectedModel = models.find(m => m.id === value);
  const displayText = selectedModel ? `${selectedModel.name}${selectedModel.priceLabel ? ` — ${selectedModel.priceLabel}` : ""}` : value || "";

  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query.trim()
    ? models.filter(m =>
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.id.toLowerCase().includes(query.toLowerCase())
      )
    : models;

  function handleSelect(id) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  // Group by provider prefix (e.g. "anthropic", "openai")
  const groups = {};
  for (const m of filtered) {
    const provider = m.id.split("/")[0] || "other";
    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(m);
  }
  const sortedProviders = Object.keys(groups).sort();

  return (
    <div className="model-select" ref={containerRef}>
      <div
        className={`model-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen(v => !v)}
        title={value}
      >
        <span className="model-select-value">
          {loading ? "Lade Modelle..." : displayText || <span className="model-select-placeholder">{placeholder}</span>}
        </span>
        <span className="model-select-arrow">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="model-select-dropdown">
          <input
            className="model-select-search"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suchen..."
            onClick={e => e.stopPropagation()}
          />
          {error && <div className="model-select-error">{error}</div>}

          <div className="model-select-list">
            {/* Always show custom entry option */}
            {query && !models.find(m => m.id === query) && (
              <div className="model-select-item model-select-custom" onMouseDown={() => handleSelect(query)}>
                <span className="model-select-id">"{query}"</span>
                <span className="model-select-badge">Eigene Eingabe</span>
              </div>
            )}

            {sortedProviders.map(provider => (
              <div key={provider} className="model-select-group">
                <div className="model-select-group-label">{provider}</div>
                {groups[provider].map(m => (
                  <div
                    key={m.id}
                    className={`model-select-item ${m.id === value ? "selected" : ""}`}
                    onMouseDown={() => handleSelect(m.id)}
                  >
                    <div className="model-select-item-main">
                      <span className="model-select-name">{m.name}</span>
                      {m.contextK && <span className="model-select-ctx">{m.contextK}K</span>}
                    </div>
                    <div className="model-select-item-sub">
                      <span className="model-select-id">{m.id}</span>
                      {m.priceLabel && <span className="model-select-price">{m.priceLabel}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {filtered.length === 0 && !query && (
              <div className="model-select-empty">Keine Modelle verfügbar</div>
            )}
            {filtered.length === 0 && query && (
              <div className="model-select-empty">Kein Treffer — drücke Enter für eigene Eingabe</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
