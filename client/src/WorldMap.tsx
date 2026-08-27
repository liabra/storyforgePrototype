import { useEffect, useMemo, useState } from "react";
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

// ── Palette parchemin (scène illustrée : valeurs fixes, pas de thème clair/sombre)
const PARCHMENT = "#e9dcc2";
const GOLD = "#b3923f";
const GOLD_LIGHT = "#c8a95a";
const INK = "#2a3350";
const PARCHMENT_LIGHT = "#f3ead6";
const DESK = "#2f2a21";

interface GenreStyle { fill: string; stroke: string; marker: string }

const GENRE_STYLE: Record<string, GenreStyle> = {
  FANTASY:      { fill: "#c3b2df", stroke: "#7d68a8", marker: "#6b559b" },
  HORROR:       { fill: "#d3a99b", stroke: "#a86450", marker: "#98503c" },
  SF:           { fill: "#a9cbc4", stroke: "#4f8b81", marker: "#3d786e" },
  CONTEMPORARY: { fill: "#aec2da", stroke: "#5f7fa8", marker: "#4a6c96" },
  ROMANCE:      { fill: "#e0c2d0", stroke: "#b06a86", marker: "#9c4e6e" },
  MYSTERY:      { fill: "#e2cfa0", stroke: "#b58a2e", marker: "#916d1e" },
  MIXED:        { fill: "#d8cdb4", stroke: "#a89768", marker: "#7c6f4e" },
};

const GENRE_TERRITORY: Record<string, string> = {
  FANTASY:      "Terres de Fantasy",
  HORROR:       "Marches de l'Horreur",
  SF:           "Confins du SF",
  CONTEMPORARY: "Cité Contemporaine",
  ROMANCE:      "Jardins du Romance",
  MYSTERY:      "Brumes du Mystère",
  MIXED:        "Terres Mêlées",
};

interface Region { cx: number; cy: number; rx: number; ry: number }

// Territoires dans le viewBox "0 0 100 100" — légèrement ajustés pour qu'ils
// se côtoient sans se chevaucher.
const GENRE_REGION: Record<string, Region> = {
  MIXED:        { cx: 50, cy: 14, rx: 14, ry: 8.5 },
  FANTASY:      { cx: 27, cy: 31, rx: 19, ry: 15 },
  HORROR:       { cx: 73, cy: 29, rx: 18, ry: 14 },
  ROMANCE:      { cx: 50, cy: 50, rx: 15, ry: 11 },
  SF:           { cx: 24, cy: 70, rx: 18, ry: 14 },
  CONTEMPORARY: { cx: 71, cy: 68, rx: 19, ry: 14 },
  MYSTERY:      { cx: 50, cy: 84, rx: 16, ry: 11 },
};

// Ordre de dessin (du haut vers le bas) pour des recouvrements prévisibles
const GENRE_ORDER = ["MIXED", "FANTASY", "HORROR", "ROMANCE", "SF", "CONTEMPORARY", "MYSTERY"];

const TYPE_ORDER = ["OBJECT", "PLACE", "PHRASE", "CHARACTER"];

const TYPE_LABEL: Record<string, string> = {
  OBJECT:    "Objets",
  PLACE:     "Lieux",
  PHRASE:    "Phrases",
  CHARACTER: "Personnages",
};

// Le label de territoire occupe le bas de l'ellipse : on exclut ce secteur
// angulaire du placement des fragments pour qu'aucun marqueur ne le recouvre.
const ARC_START = 140;
const ARC_SPAN = 260;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (id.charCodeAt(i) + ((h << 5) - h)) | 0;
  return Math.abs(h);
}

/** Position déterministe DANS l'ellipse du genre du fragment. */
function positionInRegion(id: string, region: Region): { x: number; y: number } {
  const h = hashId(id);
  const angle = ((ARC_START + (h % ARC_SPAN)) * Math.PI) / 180;
  const radius = 0.35 + (((h >> 9) % 1000) / 1000) * 0.5; // 0.35 → 0.85
  return {
    x: region.cx + Math.cos(angle) * region.rx * radius,
    y: region.cy + Math.sin(angle) * region.ry * radius,
  };
}

/** Forme du marqueur selon le type (losange, épingle, étoile ; cercle à part). */
function markerPath(type: string, x: number, y: number, s: number): string {
  if (type === "PLACE") {
    return `M ${x} ${y + s * 1.15}`
      + ` C ${x - s * 0.95} ${y + s * 0.1} ${x - s * 0.92} ${y - s * 0.95} ${x} ${y - s * 0.95}`
      + ` C ${x + s * 0.92} ${y - s * 0.95} ${x + s * 0.95} ${y + s * 0.1} ${x} ${y + s * 1.15} Z`;
  }
  if (type === "PHRASE") {
    return `M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y}`
      + ` L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3}`
      + ` L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z`;
  }
  // OBJECT → losange
  return `M ${x} ${y - s} L ${x + s * 0.78} ${y} L ${x} ${y + s} L ${x - s * 0.78} ${y} Z`;
}

function Marker({ type, x, y, size, fill, opacity }: {
  type: string; x: number; y: number; size: number; fill: string; opacity?: number;
}) {
  const common = {
    fill,
    opacity,
    stroke: PARCHMENT,
    strokeWidth: size * 0.16,
    strokeLinejoin: "round" as const,
  };
  if (type === "CHARACTER") return <circle cx={x} cy={y} r={size * 0.85} {...common} />;
  return <path d={markerPath(type, x, y, size)} {...common} />;
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

  const fragments = useMemo(() => data?.fragments ?? [], [data]);

  const countByGenre = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of fragments) {
      const genre = GENRE_REGION[f.genre] ? f.genre : "MIXED";
      counts[genre] = (counts[genre] ?? 0) + 1;
    }
    return counts;
  }, [fragments]);

  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of fragments) counts[f.type] = (counts[f.type] ?? 0) + 1;
    return counts;
  }, [fragments]);

  const isEmpty = fragments.length === 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: `radial-gradient(ellipse at 50% 40%, #3b342a 0%, ${DESK} 70%, #201c16 100%)`,
      color: PARCHMENT,
      fontFamily: "'Georgia', serif",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: `1px solid ${GOLD}55`,
        background: "rgba(0,0,0,0.18)",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, letterSpacing: "0.06em", color: PARCHMENT }}>
            Carte du Monde
          </h1>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: GOLD_LIGHT, fontStyle: "italic" }}>
            {data
              ? `${data.stats.total} fragment${data.stats.total > 1 ? "s" : ""} dans la mémoire du monde`
              : "Chargement…"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(233,220,194,0.08)", border: `1px solid ${GOLD}`,
            borderRadius: 6, padding: "0.4rem 0.85rem",
            color: PARCHMENT, fontSize: "0.82rem", cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✕ Fermer
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── La carte */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {loading ? (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: GOLD_LIGHT, fontStyle: "italic", fontSize: "0.95rem",
            }}>
              La carte se dévoile…
            </div>
          ) : (
            <svg
              width="100%" height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", inset: 0 }}
            >
              <defs>
                <clipPath id="wm-sheet">
                  <rect x="1.5" y="1.5" width="97" height="97" rx="3" ry="3" />
                </clipPath>
                <filter id="wm-grain" x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
                  <feColorMatrix type="saturate" values="0" />
                </filter>
                <radialGradient id="wm-aged" cx="50%" cy="45%" r="62%">
                  <stop offset="55%" stopColor="rgba(150,120,70,0)" />
                  <stop offset="100%" stopColor="rgba(126,98,52,0.30)" />
                </radialGradient>
              </defs>

              {/* Feuille de parchemin + double liseré doré */}
              <rect x="1.5" y="1.5" width="97" height="97" rx="3" ry="3" fill={PARCHMENT} />
              <g clipPath="url(#wm-sheet)">
                <rect
                  x="1.5" y="1.5" width="97" height="97"
                  filter="url(#wm-grain)" opacity="0.07"
                  style={{ mixBlendMode: "multiply" }}
                />
                <rect x="1.5" y="1.5" width="97" height="97" fill="url(#wm-aged)" />
              </g>
              <rect x="1.5" y="1.5" width="97" height="97" rx="3" ry="3"
                fill="none" stroke={GOLD} strokeWidth="1.1" />
              <rect x="4.2" y="4.2" width="91.6" height="91.6" rx="2" ry="2"
                fill="none" stroke={GOLD_LIGHT} strokeWidth="0.35" />

              {/* Boussole décorative */}
              <g opacity="0.75">
                <text
                  x="88" y="6.6" textAnchor="middle" fontSize="2.2"
                  fontFamily="'Georgia', serif" fontWeight="600" fill={GOLD}
                >
                  N
                </text>
                <path
                  d="M 88 8 L 88.9 11.1 L 92 12 L 88.9 12.9 L 88 16 L 87.1 12.9 L 84 12 L 87.1 11.1 Z"
                  fill={GOLD} opacity="0.85"
                />
                <circle cx="88" cy="12" r="4.6" fill="none" stroke={GOLD_LIGHT} strokeWidth="0.28" />
              </g>

              {/* Territoires */}
              {GENRE_ORDER.map((genre) => {
                const region = GENRE_REGION[genre];
                const style = GENRE_STYLE[genre];
                const explored = (countByGenre[genre] ?? 0) > 0;
                const dimmed = filter !== null && filter !== genre;
                const base = explored ? 1 : 0.45;
                const opacity = dimmed ? base * 0.35 : base;

                return (
                  <g key={genre} opacity={opacity}>
                    <ellipse
                      cx={region.cx} cy={region.cy} rx={region.rx} ry={region.ry}
                      fill={style.fill}
                      fillOpacity={explored ? 0.5 : 0.22}
                      stroke={style.stroke}
                      strokeWidth={explored ? 0.45 : 0.35}
                      strokeDasharray={explored ? undefined : "1.6 1.4"}
                    />
                    <text
                      x={region.cx}
                      y={region.cy + region.ry * 0.8}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="'Georgia', serif"
                      fontSize="2.3"
                      fontStyle={explored ? "normal" : "italic"}
                      fontWeight={explored ? 600 : 400}
                      letterSpacing="0.12"
                      fill={style.marker}
                      stroke={PARCHMENT}
                      strokeWidth="0.9"
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {GENRE_TERRITORY[genre]}
                    </text>
                  </g>
                );
              })}

              {/* Fragments */}
              {fragments.map((f) => {
                const genre = GENRE_REGION[f.genre] ? f.genre : "MIXED";
                const region = GENRE_REGION[genre];
                const style = GENRE_STYLE[genre];
                const pos = positionInRegion(f.id, region);
                const hovered = hoveredFragment?.id === f.id;
                const dimmed = filter !== null && filter !== genre;
                const size = (1.4 + Math.min(f.weight * 0.18, 0.7)) * (hovered ? 1.35 : 1);

                return (
                  <g
                    key={f.id}
                    style={{ cursor: "pointer" }}
                    opacity={dimmed ? 0.25 : 1}
                    onMouseEnter={() => setHoveredFragment(f)}
                    onMouseLeave={() => setHoveredFragment(null)}
                  >
                    {hovered && (
                      <circle cx={pos.x} cy={pos.y} r={size + 1.6} fill={style.marker} opacity={0.18} />
                    )}
                    {/* Zone de survol confortable */}
                    <circle cx={pos.x} cy={pos.y} r={2.6} fill="transparent" />
                    <Marker
                      type={f.type}
                      x={pos.x} y={pos.y}
                      size={size}
                      fill={style.marker}
                      opacity={hovered ? 1 : 0.9}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Aucun fragment : inscription sur parchemin */}
          {!loading && isEmpty && (
            <div style={{
              position: "absolute", bottom: "6%", left: "50%",
              transform: "translateX(-50%)",
              background: PARCHMENT_LIGHT,
              border: `1px solid ${GOLD}`,
              boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
              borderRadius: 8, padding: "0.9rem 1.4rem",
              maxWidth: 380, textAlign: "center",
              pointerEvents: "none",
            }}>
              <p style={{
                margin: 0, color: INK, fontSize: "0.95rem",
                fontStyle: "italic", lineHeight: 1.55,
              }}>
                Le monde est encore inexploré.<br />
                Terminez une histoire pour y déposer ses premiers fragments.
              </p>
            </div>
          )}

          {/* Fragment survolé */}
          {hoveredFragment && (
            <div style={{
              position: "absolute", bottom: "1.5rem", left: "50%",
              transform: "translateX(-50%)",
              background: PARCHMENT_LIGHT,
              border: `1px solid ${GENRE_STYLE[hoveredFragment.genre]?.stroke ?? GOLD}`,
              boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
              borderRadius: 8, padding: "0.7rem 1.1rem",
              maxWidth: 340, textAlign: "center",
              pointerEvents: "none",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                fontSize: "0.72rem", color: `${INK}99`, marginBottom: "0.35rem",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                <svg width="13" height="13" viewBox="0 0 10 10" aria-hidden="true">
                  <Marker
                    type={hoveredFragment.type}
                    x={5} y={5} size={3.4}
                    fill={GENRE_STYLE[hoveredFragment.genre]?.marker ?? INK}
                  />
                </svg>
                <span>
                  {TYPE_LABEL[hoveredFragment.type]} · {GENRE_TERRITORY[hoveredFragment.genre] ?? hoveredFragment.genre}
                </span>
              </div>
              <div style={{ fontSize: "0.95rem", fontStyle: "italic", color: INK, lineHeight: 1.5 }}>
                « {hoveredFragment.label} »
              </div>
              {hoveredFragment.weight > 1 && (
                <div style={{ fontSize: "0.72rem", color: `${INK}88`, marginTop: "0.4rem" }}>
                  Résonance : {hoveredFragment.weight}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Panneau latéral — filtre par genre et légende des formes */}
        <div style={{
          width: 232, flexShrink: 0,
          borderLeft: `1px solid ${GOLD}`,
          background: PARCHMENT_LIGHT,
          color: INK,
          padding: "1.2rem 1rem",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "1.5rem",
        }}>
          {/* Filtre par genre */}
          <div>
            <p style={{
              fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
              color: `${INK}88`, margin: "0 0 0.7rem",
            }}>
              Territoires
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <button
                onClick={() => setFilter(null)}
                style={{
                  background: filter === null ? `${GOLD}33` : "transparent",
                  border: `1px solid ${filter === null ? GOLD : `${INK}25`}`,
                  borderRadius: 4, padding: "0.32rem 0.6rem",
                  color: INK, fontSize: "0.8rem",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                Tout le monde ({fragments.length})
              </button>
              {GENRE_ORDER.map((genre) => {
                const count = countByGenre[genre] ?? 0;
                const style = GENRE_STYLE[genre];
                const active = filter === genre;
                const explored = count > 0;
                return (
                  <button
                    key={genre}
                    onClick={() => explored && setFilter(active ? null : genre)}
                    disabled={!explored}
                    title={explored ? undefined : "Territoire inexploré"}
                    style={{
                      background: active ? `${style.fill}88` : "transparent",
                      border: `1px solid ${active ? style.stroke : `${INK}20`}`,
                      borderRadius: 4, padding: "0.32rem 0.6rem",
                      color: explored ? style.marker : `${INK}55`,
                      fontSize: "0.8rem",
                      fontStyle: explored ? "normal" : "italic",
                      cursor: explored ? "pointer" : "default",
                      textAlign: "left", fontFamily: "inherit",
                      display: "flex", justifyContent: "space-between", gap: "0.5rem",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {GENRE_TERRITORY[genre]}
                    </span>
                    <span style={{ opacity: 0.7 }}>{explored ? count : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Légende des formes */}
          <div>
            <p style={{
              fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
              color: `${INK}88`, margin: "0 0 0.7rem",
            }}>
              Légende
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {TYPE_ORDER.map((type) => (
                <div key={type} style={{
                  display: "flex", alignItems: "center", gap: "0.55rem",
                  fontSize: "0.82rem", color: INK,
                }}>
                  <svg width="16" height="16" viewBox="0 0 10 10" aria-hidden="true">
                    <Marker type={type} x={5} y={5} size={3.6} fill={INK} />
                  </svg>
                  <span style={{ flex: 1 }}>{TYPE_LABEL[type]}</span>
                  <span style={{ color: `${INK}88` }}>{countByType[type] ?? 0}</span>
                </div>
              ))}
            </div>
            <p style={{
              margin: "0.9rem 0 0", fontSize: "0.74rem", lineHeight: 1.5,
              color: `${INK}88`, fontStyle: "italic",
            }}>
              Chaque fragment repose dans le territoire de son genre. Les zones en pointillés
              n'ont pas encore été explorées.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
