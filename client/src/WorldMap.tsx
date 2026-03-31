import { useEffect, useState } from "react";
import { api } from "./api";

interface Fragment {
  id: string;
  type: "OBJECT" | "PLACE" | "PHRASE" | "CHARACTER";
  genre: string;
  label: string;
  weight: number;
  createdAt: string;
}

interface WorldData {
  fragments: Fragment[];
  stats: {
    total: number;
    byType: Record<string, number>;
    byGenre: Record<string, number>;
  };
}

const GENRE_COLOR: Record<string, string> = {
  FANTASY:      "#8b5cf6",
  HORROR:       "#ef4444",
  CONTEMPORARY: "#3b82f6",
  SF:           "#06b6d4",
  ROMANCE:      "#ec4899",
  MYSTERY:      "#f59e0b",
  MIXED:        "#6b7280",
};

const TYPE_ICON: Record<string, string> = {
  OBJECT:    "⚔️",
  PLACE:     "🗺️",
  PHRASE:    "✨",
  CHARACTER: "👤",
};

const TYPE_LABEL: Record<string, string> = {
  OBJECT:    "Objets",
  PLACE:     "Lieux",
  PHRASE:    "Phrases",
  CHARACTER: "Personnages",
};

// Génère une position stable basée sur l'id du fragment
function stablePosition(id: string, _index: number): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = 8 + (Math.abs(hash % 1000) / 1000) * 84;
  const y = 8 + (Math.abs((hash >> 8) % 1000) / 1000) * 84;
  return { x, y };
}

interface Props {
  onClose: () => void;
}

export default function WorldMap({ onClose }: Props) {
  const [data, setData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredFragment, setHoveredFragment] = useState<Fragment | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    api.world.getMap()
      .then((d) => { setData(d as WorldData); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const fragments = data?.fragments ?? [];
  const filtered = filter
    ? fragments.filter(f => f.genre === filter || f.type === filter)
    : fragments;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "#0a0812",
      color: "#e8e0d0",
      fontFamily: "'Georgia', serif",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, letterSpacing: "0.05em" }}>
            🌍 Carte du Monde
          </h1>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
            {data ? `${data.stats.total} fragment${data.stats.total > 1 ? "s" : ""} dans la mémoire du monde` : "Chargement…"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6, padding: "0.4rem 0.85rem",
            color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✕ Fermer
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Carte SVG */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {loading ? (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,0.3)", fontStyle: "italic",
            }}>
              La carte se dévoile…
            </div>
          ) : fragments.length === 0 ? (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "1rem",
              color: "rgba(255,255,255,0.25)",
            }}>
              <div style={{ fontSize: "3rem", opacity: 0.4 }}>🌫️</div>
              <p style={{ fontStyle: "italic", fontSize: "0.95rem", textAlign: "center", maxWidth: 300 }}>
                Le monde attend ses premières histoires.<br />
                Jouez — et la carte se construira.
              </p>
            </div>
          ) : (
            <svg
              width="100%" height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", inset: 0 }}
            >
              {/* Grille de fond */}
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.2"/>
                </pattern>
                <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
                  <stop offset="60%" stopColor="transparent"/>
                  <stop offset="100%" stopColor="#0a0812"/>
                </radialGradient>
              </defs>
              <rect width="100" height="100" fill="url(#grid)"/>
              <rect width="100" height="100" fill="url(#vignette)"/>

              {/* Points des fragments */}
              {filtered.map((f, i) => {
                const pos = stablePosition(f.id, i);
                const color = GENRE_COLOR[f.genre] ?? "#6b7280";
                const size = 0.8 + Math.min(f.weight * 0.3, 2);
                const isHovered = hoveredFragment?.id === f.id;

                return (
                  <g key={f.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredFragment(f)}
                    onMouseLeave={() => setHoveredFragment(null)}
                  >
                    {/* Halo */}
                    {isHovered && (
                      <circle
                        cx={pos.x} cy={pos.y}
                        r={size + 1.5}
                        fill={color}
                        opacity={0.15}
                      />
                    )}
                    {/* Point principal */}
                    <circle
                      cx={pos.x} cy={pos.y}
                      r={size}
                      fill={color}
                      opacity={isHovered ? 1 : 0.7}
                    />
                    {/* Pulse si poids élevé */}
                    {f.weight >= 3 && (
                      <circle
                        cx={pos.x} cy={pos.y}
                        r={size + 0.8}
                        fill="none"
                        stroke={color}
                        strokeWidth="0.2"
                        opacity={0.4}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* Tooltip fragment survolé */}
          {hoveredFragment && (
            <div style={{
              position: "absolute", bottom: "1.5rem", left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10,8,18,0.95)",
              border: `1px solid ${GENRE_COLOR[hoveredFragment.genre] ?? "#555"}`,
              borderRadius: 8, padding: "0.7rem 1.1rem",
              maxWidth: 320, textAlign: "center",
              pointerEvents: "none",
            }}>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginBottom: "0.3rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {TYPE_ICON[hoveredFragment.type]} {TYPE_LABEL[hoveredFragment.type]} · {hoveredFragment.genre}
              </div>
              <div style={{ fontSize: "0.95rem", fontStyle: "italic", color: "rgba(255,235,170,0.9)", lineHeight: 1.5 }}>
                "{hoveredFragment.label}"
              </div>
              {hoveredFragment.weight > 1 && (
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", marginTop: "0.4rem" }}>
                  Résonance : {hoveredFragment.weight}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panneau latéral — stats et filtres */}
        <div style={{
          width: 220, flexShrink: 0,
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          padding: "1.2rem 1rem",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "1.5rem",
        }}>
          {/* Filtres genre */}
          <div>
            <p style={{ fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: "0 0 0.7rem" }}>
              Genre
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <button
                onClick={() => setFilter(null)}
                style={{
                  background: filter === null ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4, padding: "0.3rem 0.6rem",
                  color: "rgba(255,255,255,0.6)", fontSize: "0.78rem",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                Tous ({data?.stats.total ?? 0})
              </button>
              {Object.entries(GENRE_COLOR).map(([genre, color]) => {
                const count = data?.stats.byGenre[genre] ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={genre}
                    onClick={() => setFilter(genre === filter ? null : genre)}
                    style={{
                      background: filter === genre ? `${color}22` : "transparent",
                      border: `1px solid ${filter === genre ? color : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 4, padding: "0.3rem 0.6rem",
                      color: filter === genre ? color : "rgba(255,255,255,0.5)",
                      fontSize: "0.78rem", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit",
                      display: "flex", justifyContent: "space-between",
                    }}
                  >
                    <span>{genre}</span>
                    <span style={{ opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats par type */}
          <div>
            <p style={{ fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: "0 0 0.7rem" }}>
              Types
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {Object.entries(TYPE_ICON).map(([type, icon]) => {
                const count = data?.stats.byType[type] ?? 0;
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>
                    <span>{icon}</span>
                    <span style={{ flex: 1 }}>{TYPE_LABEL[type]}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
