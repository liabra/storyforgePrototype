import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Date d'entrée dans le monde, en français. Null si la date est inexploitable. */
function formatEntryDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Genre normalisé : un genre inconnu retombe sur le territoire MIXED. */
function regionGenre(genre: string): string {
  return GENRE_REGION[genre] ? genre : "MIXED";
}

// ── Vue (viewBox piloté) : de la carte entière (100) au zoom ×4 (25)
const MIN_VIEW = 25;
const MAX_VIEW = 100;
const DEFAULT_VIEW: View = { x: 0, y: 0, w: 100, h: 100 };
const DRAG_THRESHOLD = 4; // px avant de considérer que c'est un déplacement

interface View { x: number; y: number; w: number; h: number }

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Borne la vue : jamais plus large que la carte, jamais hors de ses limites. */
function clampView(v: View): View {
  const w = clamp(v.w, MIN_VIEW, MAX_VIEW);
  const h = clamp(v.h, MIN_VIEW, MAX_VIEW);
  return { w, h, x: clamp(v.x, 0, 100 - w), y: clamp(v.y, 0, 100 - h) };
}

function zoomBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(233,220,194,0.10)",
    border: `1px solid ${GOLD}`,
    borderRadius: 5,
    color: PARCHMENT, fontSize: "1rem", lineHeight: 1,
    fontFamily: "inherit",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    padding: 0,
  };
}

interface Props {
  onClose: () => void;
}

export default function WorldMap({ onClose }: Props) {
  const [data, setData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredFragment, setHoveredFragment] = useState<Fragment | null>(null);
  const [selectedFragment, setSelectedFragment] = useState<Fragment | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Vue : zoom et déplacement pilotés par le viewBox
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; from: View; moved: boolean } | null>(null);
  // Vrai si le geste courant était un déplacement : sert à annuler le clic qui suit
  const didDragRef = useRef(false);

  const isDefaultView = view.x === 0 && view.y === 0 && view.w === MAX_VIEW && view.h === MAX_VIEW;

  /** Zoome d'un facteur donné, en gardant fixe le point sous le curseur (ou le centre). */
  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView((v) => {
      const w = clamp(v.w * factor, MIN_VIEW, MAX_VIEW);
      const h = clamp(v.h * factor, MIN_VIEW, MAX_VIEW);

      // Point d'ancrage en coordonnées viewBox : le curseur si on l'a, sinon le centre
      let ax = v.x + v.w / 2;
      let ay = v.y + v.h / 2;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && clientX !== undefined && clientY !== undefined) {
        // preserveAspectRatio="meet" + viewBox carré → la carte occupe un carré centré
        const side = Math.min(rect.width, rect.height);
        if (side > 0) {
          const scale = side / v.w;
          ax = v.x + (clientX - rect.left - (rect.width - side) / 2) / scale;
          ay = v.y + (clientY - rect.top - (rect.height - side) / 2) / scale;
        }
      }

      return clampView({
        w, h,
        x: ax - (ax - v.x) * (w / v.w),
        y: ay - (ay - v.y) * (h / v.h),
      });
    });
  }, []);

  // Molette : listener non passif (React attache onWheel en passif, preventDefault y échoue)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 0.88 : 1.14, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, from: view, moved: false };
    didDragRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    // Filet de sécurité si le pointerup s'est perdu hors de la fenêtre
    if (e.buttons === 0) { dragRef.current = null; setDragging(false); return; }

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      didDragRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    const rect = svgRef.current?.getBoundingClientRect();
    const side = rect ? Math.min(rect.width, rect.height) : 0;
    if (side <= 0) return;
    const scale = side / drag.from.w; // px par unité de viewBox

    // Position absolue depuis le début du geste : pas de dérive cumulée
    setView(clampView({ ...drag.from, x: drag.from.x - dx / scale, y: drag.from.y - dy / scale }));
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  /** Consomme le drapeau de déplacement : renvoie true si le clic doit être ignoré. */
  const swallowClickAfterDrag = (): boolean => {
    if (!didDragRef.current) return false;
    didDragRef.current = false;
    return true;
  };

  useEffect(() => {
    api.world.getMap()
      .then((d) => { setData(d as WorldData); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Échap ferme d'abord le détail ouvert, puis la carte
      if (selectedFragment) { setSelectedFragment(null); return; }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, selectedFragment]);

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

  const query = search.trim().toLowerCase();

  // Un fragment est « actif » s'il passe le filtre de genre ET la recherche.
  const isActive = (f: Fragment): boolean =>
    (filter === null || regionGenre(f.genre) === filter)
    && (query === "" || f.label.toLowerCase().includes(query));

  const matchCount = useMemo(
    () => fragments.filter((f) =>
      (filter === null || regionGenre(f.genre) === filter)
      && (query === "" || f.label.toLowerCase().includes(query))
    ).length,
    [fragments, filter, query],
  );

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
        <div
          ref={containerRef}
          style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onClick={() => { if (!swallowClickAfterDrag()) setSelectedFragment(null); }}
        >
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
              ref={svgRef}
              width="100%" height="100%"
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                position: "absolute", inset: 0,
                cursor: dragging ? "grabbing" : "grab",
                touchAction: "none",
              }}
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
                const genre = regionGenre(f.genre);
                const region = GENRE_REGION[genre];
                const style = GENRE_STYLE[genre];
                const pos = positionInRegion(f.id, region);
                const hovered = hoveredFragment?.id === f.id;
                const selected = selectedFragment?.id === f.id;
                const dimmed = !isActive(f);
                const size = (1.4 + Math.min(f.weight * 0.18, 0.7)) * (hovered || selected ? 1.35 : 1);

                return (
                  <g
                    key={f.id}
                    style={{ cursor: "pointer" }}
                    opacity={dimmed ? 0.25 : 1}
                    onMouseEnter={() => setHoveredFragment(f)}
                    onMouseLeave={() => setHoveredFragment(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!swallowClickAfterDrag()) setSelectedFragment(f);
                    }}
                  >
                    {selected && (
                      <circle
                        cx={pos.x} cy={pos.y} r={size + 2.4}
                        fill="none" stroke={style.marker} strokeWidth="0.35" opacity={0.7}
                      />
                    )}
                    {(hovered || selected) && (
                      <circle cx={pos.x} cy={pos.y} r={size + 1.6} fill={style.marker} opacity={0.18} />
                    )}
                    {/* Zone de survol confortable */}
                    <circle cx={pos.x} cy={pos.y} r={2.6} fill="transparent" />
                    <Marker
                      type={f.type}
                      x={pos.x} y={pos.y}
                      size={size}
                      fill={style.marker}
                      opacity={hovered || selected ? 1 : 0.9}
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

          {/* Détail du fragment cliqué — jamais d'information sur l'histoire source */}
          {selectedFragment && (() => {
            const genre = regionGenre(selectedFragment.genre);
            const style = GENRE_STYLE[genre];
            const entryDate = formatEntryDate(selectedFragment.createdAt);
            return (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: "1.25rem", right: "1.25rem",
                  width: 290, maxWidth: "calc(100% - 2.5rem)",
                  background: PARCHMENT_LIGHT,
                  border: `1px solid ${style.stroke}`,
                  borderTop: `3px solid ${style.marker}`,
                  boxShadow: "0 6px 22px rgba(0,0,0,0.4)",
                  borderRadius: 8, padding: "0.9rem 1rem 1rem",
                }}
              >
                <button
                  onClick={() => setSelectedFragment(null)}
                  aria-label="Fermer le détail"
                  style={{
                    position: "absolute", top: "0.45rem", right: "0.5rem",
                    background: "none", border: "none", cursor: "pointer",
                    color: `${INK}88`, fontSize: "1rem", lineHeight: 1,
                    padding: "0.2rem 0.3rem", fontFamily: "inherit",
                  }}
                >
                  ×
                </button>

                <div style={{
                  display: "flex", alignItems: "center", gap: "0.45rem",
                  fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase",
                  color: `${INK}99`, marginBottom: "0.15rem",
                }}>
                  <svg width="14" height="14" viewBox="0 0 10 10" aria-hidden="true">
                    <Marker type={selectedFragment.type} x={5} y={5} size={3.5} fill={style.marker} />
                  </svg>
                  <span>{TYPE_LABEL[selectedFragment.type] ?? selectedFragment.type}</span>
                </div>

                <p style={{
                  margin: "0 0 0.6rem", fontSize: "0.82rem",
                  color: style.marker, fontWeight: 600,
                }}>
                  {GENRE_TERRITORY[genre] ?? genre}
                </p>

                <p style={{
                  margin: "0 0 0.75rem", fontSize: "1rem", lineHeight: 1.55,
                  fontStyle: "italic", color: INK,
                }}>
                  « {selectedFragment.label} »
                </p>

                <div style={{
                  borderTop: `1px solid ${INK}22`, paddingTop: "0.6rem",
                  display: "flex", flexDirection: "column", gap: "0.25rem",
                  fontSize: "0.76rem", color: `${INK}99`,
                }}>
                  <span>
                    Évoqué {selectedFragment.weight} fois
                  </span>
                  {entryDate && <span>Entré dans le monde le {entryDate}</span>}
                </div>
              </div>
            );
          })()}

          {/* Fragment survolé — masqué pendant un déplacement */}
          {hoveredFragment && !dragging && (
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

          {/* Contrôles de vue */}
          {!loading && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", right: "1.25rem", bottom: "1.25rem",
                display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.4rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <button
                  onClick={() => zoomBy(0.8)}
                  disabled={view.w <= MIN_VIEW}
                  aria-label="Zoomer"
                  title="Zoomer"
                  style={zoomBtnStyle(view.w <= MIN_VIEW)}
                >
                  +
                </button>
                <button
                  onClick={() => zoomBy(1.25)}
                  disabled={view.w >= MAX_VIEW}
                  aria-label="Dézoomer"
                  title="Dézoomer"
                  style={zoomBtnStyle(view.w >= MAX_VIEW)}
                >
                  −
                </button>
              </div>
              <button
                onClick={() => setView(DEFAULT_VIEW)}
                disabled={isDefaultView}
                style={{
                  background: "rgba(233,220,194,0.10)",
                  border: `1px solid ${GOLD}`,
                  borderRadius: 5, padding: "0.28rem 0.6rem",
                  color: PARCHMENT, fontSize: "0.74rem",
                  fontFamily: "inherit",
                  cursor: isDefaultView ? "default" : "pointer",
                  opacity: isDefaultView ? 0.4 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                Réinitialiser la vue
              </button>
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
          {/* Recherche */}
          <div>
            <div style={{ position: "relative" }}>
              <svg
                width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"
                style={{ position: "absolute", left: "0.55rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              >
                <circle cx="6" cy="6" r="4.2" fill="none" stroke={`${INK}99`} strokeWidth="1.4" />
                <line x1="9.2" y1="9.2" x2="12.6" y2="12.6" stroke={`${INK}99`} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="chercher un fragment…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "0.38rem 0.5rem 0.38rem 1.75rem",
                  background: PARCHMENT,
                  border: `1px solid ${INK}30`,
                  borderRadius: 4,
                  color: INK, fontSize: "0.8rem",
                  fontFamily: "inherit", fontStyle: "italic",
                  outline: "none",
                }}
              />
            </div>
            {query !== "" && matchCount === 0 && (
              <p style={{
                margin: "0.5rem 0 0", fontSize: "0.76rem",
                color: `${INK}88`, fontStyle: "italic",
              }}>
                Aucun fragment trouvé.
              </p>
            )}
          </div>

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
