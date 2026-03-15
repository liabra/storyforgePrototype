import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Story, Scene, Character, CharacterInput } from "./api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function displayName(c: Character) {
  return c.name || c.nickname || "Sans nom";
}

/** Gradient déterministe depuis le titre (couleur unique par scène) */
function sceneGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h);
  const h1 = Math.abs(h) % 360;
  const h2 = (h1 + 50) % 360;
  return `linear-gradient(135deg, hsl(${h1},55%,10%) 0%, hsl(${h2},65%,18%) 70%, hsl(${(h2 + 30) % 360},75%,13%) 100%)`;
}

const IS_PLACEHOLDER = (url?: string | null) =>
  !!url && url.startsWith("https://placehold.co");

// ─── Component ──────────────────────────────────────────────────────────────

export default function App() {
  // Stories
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyDesc, setStoryDesc] = useState("");
  const [showStoryForm, setShowStoryForm] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<"scenes" | "characters">("scenes");

  // Scenes
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneContents, setSceneContents] = useState<Record<string, string>>({});
  const [savingScene, setSavingScene] = useState<string | null>(null);
  const [savedScenes, setSavedScenes] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [suggestingScene, setSuggestingScene] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [visibilityEdits, setVisibilityEdits] = useState<Record<string, { mode: string; lines: number }>>({});
  const [savingVisibility, setSavingVisibility] = useState<string | null>(null);
  const [spectatorView, setSpectatorView] = useState<Record<string, boolean>>({});

  // New scene form
  const [newScene, setNewScene] = useState({ title: "", content: "" });
  const [creatingScene, setCreatingScene] = useState(false);
  const [showNewSceneForm, setShowNewSceneForm] = useState(false);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newChar, setNewChar] = useState<CharacterInput>({ name: "", nickname: "" });
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [charEdits, setCharEdits] = useState<Record<string, CharacterInput>>({});
  const [savingChar, setSavingChar] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // ── Load stories
  useEffect(() => {
    api.stories.list().then(setStories).catch(() => setError("Impossible de charger les histoires."));
  }, []);

  // ── Select story
  const handleSelectStory = async (story: Story) => {
    setSelectedStory(story);
    setActiveTab("scenes");
    setSuggestions({});
    setShowNewSceneForm(false);
    const [sceneData, charData] = await Promise.all([
      api.scenes.list(story.id),
      api.characters.list(story.id),
    ]);
    setScenes(sceneData);
    setSceneContents(Object.fromEntries(sceneData.map((s) => [s.id, s.content ?? ""])));
    setVisibilityEdits(Object.fromEntries(sceneData.map((s) => [s.id, { mode: s.visibilityMode, lines: s.visibleLines }])));
    setSpectatorView({});
    setCharacters(charData);
    setExpandedCharId(null);
    setTimeout(() => mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // ── Create story
  const handleCreateStory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storyTitle.trim()) return;
    const story = await api.stories.create({ title: storyTitle.trim(), description: storyDesc.trim() || undefined });
    setStories((prev) => [story, ...prev]);
    setStoryTitle(""); setStoryDesc("");
    setShowStoryForm(false);
    handleSelectStory(story);
  };

  // ── Create scene
  const handleCreateScene = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStory || !newScene.title.trim()) return;
    setCreatingScene(true);
    try {
      const created = await api.scenes.create(selectedStory.id, {
        title: newScene.title.trim(),
        content: newScene.content.trim() || undefined,
        order: scenes.length + 1,
      });
      setScenes((prev) => [...prev, created]);
      setSceneContents((prev) => ({ ...prev, [created.id]: created.content ?? "" }));
      setVisibilityEdits((prev) => ({ ...prev, [created.id]: { mode: created.visibilityMode, lines: created.visibleLines } }));
      setNewScene({ title: "", content: "" });
      setShowNewSceneForm(false);
    } finally {
      setCreatingScene(false);
    }
  };

  // ── Save scene content
  const handleSaveScene = async (scene: Scene) => {
    setSavingScene(scene.id);
    try {
      const updated = await api.scenes.update(scene.id, { content: sceneContents[scene.id] ?? "" });
      setScenes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSavedScenes((prev) => ({ ...prev, [scene.id]: true }));
      setTimeout(() => setSavedScenes((prev) => ({ ...prev, [scene.id]: false })), 2200);
    } finally {
      setSavingScene(null);
    }
  };

  // ── Suggest idea
  const handleSuggestIdea = async (scene: Scene) => {
    if (!selectedStory) return;
    setSuggestingScene(scene.id);
    try {
      const { idea } = await api.scenes.suggestIdea(selectedStory.id, scene.title);
      setSuggestions((prev) => ({ ...prev, [scene.id]: idea }));
    } finally {
      setSuggestingScene(null);
    }
  };

  // ── Generate image
  const handleGenerateImage = async (scene: Scene) => {
    setGeneratingImage(scene.id);
    try {
      const updated = await api.scenes.generateImage(scene.id);
      setScenes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } finally {
      setGeneratingImage(null);
    }
  };

  // ── Save visibility
  const handleSaveVisibility = async (scene: Scene) => {
    const edit = visibilityEdits[scene.id];
    if (!edit) return;
    setSavingVisibility(scene.id);
    try {
      const updated = await api.scenes.update(scene.id, { visibilityMode: edit.mode, visibleLines: edit.lines });
      setScenes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } finally {
      setSavingVisibility(null);
    }
  };

  // ── Characters
  const handleCreateChar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStory || (!newChar.name?.trim() && !newChar.nickname?.trim())) return;
    const created = await api.characters.create(selectedStory.id, {
      name: newChar.name?.trim() || undefined,
      nickname: newChar.nickname?.trim() || undefined,
    });
    setCharacters((prev) => [...prev, created]);
    setNewChar({ name: "", nickname: "" });
  };

  const handleExpandChar = (char: Character) => {
    if (expandedCharId === char.id) { setExpandedCharId(null); return; }
    setExpandedCharId(char.id);
    setCharEdits((prev) => ({ ...prev, [char.id]: { ...char } }));
  };

  const handleSaveChar = async (char: Character) => {
    setSavingChar(char.id);
    try {
      const updated = await api.characters.update(char.id, charEdits[char.id] ?? {});
      setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setExpandedCharId(null);
    } finally {
      setSavingChar(null);
    }
  };

  const handleDeleteChar = async (id: string) => {
    await api.characters.delete(id);
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    if (expandedCharId === id) setExpandedCharId(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* ══ Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <span style={s.logo}>✦ StoryForge</span>
            <span style={s.logoSub}>prototype narratif</span>
          </div>
          <button style={s.btnAccent} onClick={() => setShowStoryForm((v) => !v)}>
            {showStoryForm ? "Annuler" : "+ Nouvelle histoire"}
          </button>
        </div>
      </header>

      {error && <div style={s.errorBanner}>{error}</div>}

      <div style={s.layout}>

        {/* ══ Sidebar — liste des histoires */}
        <aside style={s.sidebar}>
          <p style={s.sidebarLabel}>Vos histoires</p>

          {/* Formulaire création */}
          {showStoryForm && (
            <form onSubmit={handleCreateStory} style={s.storyForm}>
              <input style={s.inputDark} placeholder="Titre de l'histoire" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} required autoFocus />
              <input style={s.inputDark} placeholder="Description (optionnelle)" value={storyDesc} onChange={(e) => setStoryDesc(e.target.value)} />
              <button style={s.btnAccent} type="submit">Créer →</button>
            </form>
          )}

          {stories.length === 0 && !showStoryForm && (
            <p style={s.mutedSide}>Aucune histoire pour l'instant.</p>
          )}

          <ul style={s.storyList}>
            {stories.map((story) => {
              const active = selectedStory?.id === story.id;
              return (
                <li key={story.id} style={{ ...s.storyItem, ...(active ? s.storyItemActive : {}) }} onClick={() => handleSelectStory(story)}>
                  {active && <span style={s.storyItemDot}>▶</span>}
                  <div>
                    <div style={s.storyItemTitle}>{story.title}</div>
                    {story.description && <div style={s.storyItemDesc}>{story.description}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ══ Main */}
        <main style={s.main} ref={mainRef}>
          {!selectedStory ? (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>✦</div>
              <p style={s.emptyText}>Sélectionne une histoire pour commencer.</p>
            </div>
          ) : (
            <>
              {/* Story header */}
              <div style={s.storyHeader}>
                <h2 style={s.storyTitle}>{selectedStory.title}</h2>
                {selectedStory.description && <p style={s.storyDesc}>{selectedStory.description}</p>}
              </div>

              {/* Tabs */}
              <div style={s.tabs}>
                {(["scenes", "characters"] as const).map((tab) => (
                  <button key={tab} style={{ ...s.tab, ...(activeTab === tab ? s.tabActive : {}) }} onClick={() => setActiveTab(tab)}>
                    {tab === "scenes" ? `Scènes (${scenes.length})` : `Personnages (${characters.length})`}
                  </button>
                ))}
              </div>

              {/* ══ Scènes */}
              {activeTab === "scenes" && (
                <div>
                  {/* Bouton + Ajouter une scène */}
                  {!showNewSceneForm ? (
                    <button style={s.addSceneBtn} onClick={() => setShowNewSceneForm(true)}>
                      + Ajouter une scène
                    </button>
                  ) : (
                    <form onSubmit={handleCreateScene} style={s.newSceneForm}>
                      <p style={s.newSceneFormTitle}>Nouvelle scène</p>
                      <input
                        style={s.inputDark}
                        placeholder="Titre de la scène"
                        value={newScene.title}
                        onChange={(e) => setNewScene((p) => ({ ...p, title: e.target.value }))}
                        required
                        autoFocus
                      />
                      <textarea
                        style={{ ...s.textareaDark, minHeight: 80 }}
                        placeholder="Commence à écrire… (optionnel)"
                        value={newScene.content}
                        onChange={(e) => setNewScene((p) => ({ ...p, content: e.target.value }))}
                      />
                      <div style={s.row}>
                        <button style={s.btnAccent} type="submit" disabled={creatingScene}>
                          {creatingScene ? "Création…" : "Créer la scène →"}
                        </button>
                        <button style={s.btnGhost} type="button" onClick={() => setShowNewSceneForm(false)}>Annuler</button>
                      </div>
                    </form>
                  )}

                  {scenes.length === 0 && <p style={s.mutedCenter}>Aucune scène. Ajoutes-en une pour commencer.</p>}

                  <div style={s.sceneGrid}>
                    {scenes.map((scene) => {
                      const isSpectator = spectatorView[scene.id] ?? false;
                      const vis = visibilityEdits[scene.id] ?? { mode: scene.visibilityMode, lines: scene.visibleLines };
                      const justSaved = savedScenes[scene.id];

                      return (
                        <div key={scene.id} style={s.sceneCard}>

                          {/* ── Card header */}
                          <div style={s.sceneCardHeader}>
                            <div style={s.sceneOrderBadge}>{scene.order}</div>
                            <h3 style={s.sceneCardTitle}>{scene.title}</h3>
                            <button
                              style={isSpectator ? s.viewBtnActive : s.viewBtn}
                              onClick={() => setSpectatorView((p) => ({ ...p, [scene.id]: !isSpectator }))}
                            >
                              {isSpectator ? "✏️ Auteur" : "👁 Spectateurs"}
                            </button>
                          </div>

                          {/* ── Image placeholder élégante ou vraie image */}
                          {scene.imageUrl && IS_PLACEHOLDER(scene.imageUrl) && (
                            <div style={{ ...s.imagePlaceholder, background: sceneGradient(scene.title) }}>
                              <div style={s.imagePlaceholderGrid} />
                              <div style={s.imagePlaceholderBadge}>✦ Illustration générée</div>
                              <div style={s.imagePlaceholderTitle}>{scene.title}</div>
                              <div style={s.imagePlaceholderSub}>En attente de l'API image</div>
                            </div>
                          )}
                          {scene.imageUrl && !IS_PLACEHOLDER(scene.imageUrl) && (
                            <img src={scene.imageUrl} alt={scene.title} style={s.sceneImage} />
                          )}

                          {/* ── Suggestion IA */}
                          {suggestions[scene.id] && (
                            <div style={s.suggestion}>
                              <span style={s.suggestionIcon}>💡</span>
                              <em>{suggestions[scene.id]}</em>
                            </div>
                          )}

                          {/* ── Vue spectateurs */}
                          {isSpectator && (
                            <div style={s.spectatorBox}>
                              <div style={s.spectatorHeader}>
                                <span style={s.spectatorLabel}>
                                  👁 Vue spectateurs —{" "}
                                  {vis.mode === "full" ? "texte complet" : `${vis.lines} dernières lignes`}
                                </span>
                              </div>
                              {scene.visibleContent ? (
                                <pre style={s.spectatorText}>{scene.visibleContent}</pre>
                              ) : (
                                <p style={s.spectatorEmpty}>Aucun texte visible pour les spectateurs.</p>
                              )}
                            </div>
                          )}

                          {/* ── Vue auteur */}
                          {!isSpectator && (
                            <>
                              <textarea
                                style={s.textareaDark}
                                placeholder="Écris ta scène ici…"
                                value={sceneContents[scene.id] ?? ""}
                                onChange={(e) => setSceneContents((p) => ({ ...p, [scene.id]: e.target.value }))}
                              />

                              {/* Actions */}
                              <div style={s.sceneActions}>
                                <button
                                  style={justSaved ? s.btnSaved : s.btnAccent}
                                  onClick={() => handleSaveScene(scene)}
                                  disabled={savingScene === scene.id}
                                >
                                  {savingScene === scene.id ? "Sauvegarde…" : justSaved ? "✓ Sauvegardé" : "Sauvegarder"}
                                </button>
                                <button style={s.btnGhost} onClick={() => handleSuggestIdea(scene)} disabled={suggestingScene === scene.id}>
                                  {suggestingScene === scene.id ? "…" : "💡 Idée"}
                                </button>
                                <button style={s.btnGhost} onClick={() => handleGenerateImage(scene)} disabled={generatingImage === scene.id}>
                                  {generatingImage === scene.id ? "…" : "🎨 Illustrer"}
                                </button>
                              </div>

                              {/* Config visibilité */}
                              <div style={s.visBar}>
                                <span style={s.visLabel}>Visible :</span>
                                <select style={s.selectDark} value={vis.mode} onChange={(e) => setVisibilityEdits((p) => ({ ...p, [scene.id]: { ...vis, mode: e.target.value } }))}>
                                  <option value="last_lines">Dernières lignes</option>
                                  <option value="full">Texte complet</option>
                                </select>
                                {vis.mode === "last_lines" && (
                                  <input
                                    type="number" min={1} max={20}
                                    style={{ ...s.inputDark, maxWidth: 56, textAlign: "center", flex: "none" }}
                                    value={vis.lines}
                                    onChange={(e) => setVisibilityEdits((p) => ({ ...p, [scene.id]: { ...vis, lines: Number(e.target.value) || 1 } }))}
                                  />
                                )}
                                <button style={s.btnMicro} onClick={() => handleSaveVisibility(scene)} disabled={savingVisibility === scene.id}>
                                  {savingVisibility === scene.id ? "…" : "Appliquer"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ══ Personnages */}
              {activeTab === "characters" && (
                <div>
                  <form onSubmit={handleCreateChar} style={s.newCharForm}>
                    <div style={s.row}>
                      <input style={s.inputDark} placeholder="Nom" value={newChar.name ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))} />
                      <input style={s.inputDark} placeholder="Pseudo" value={newChar.nickname ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, nickname: e.target.value }))} />
                      <button style={s.btnAccent} type="submit">+ Ajouter</button>
                    </div>
                    <p style={s.visLabel}>Un nom ou un pseudo suffit pour commencer.</p>
                  </form>

                  {characters.length === 0 && <p style={s.mutedCenter}>Aucun personnage dans cette histoire.</p>}

                  <div style={s.charGrid}>
                    {characters.map((char) => (
                      <div key={char.id} style={s.charCard}>
                        <div style={s.charCardHeader}>
                          <div>
                            <span style={s.charName}>{displayName(char)}</span>
                            {char.role && <span style={s.roleBadge}>{char.role}</span>}
                            {char.faction && <span style={s.factionBadge}>{char.faction}</span>}
                          </div>
                          <div style={s.row}>
                            <button style={s.btnMicro} onClick={() => handleExpandChar(char)}>
                              {expandedCharId === char.id ? "Fermer" : "Fiche"}
                            </button>
                            <button style={s.btnDanger} onClick={() => handleDeleteChar(char.id)}>✕</button>
                          </div>
                        </div>
                        {char.shortDescription && <p style={s.charDesc}>{char.shortDescription}</p>}

                        {/* Fiche complète */}
                        {expandedCharId === char.id && (
                          <div style={s.charSheet}>
                            {(
                              [
                                ["name", "Nom"], ["nickname", "Pseudo"],
                                ["role", "Rôle"], ["faction", "Faction"],
                                ["shortDescription", "Description courte"],
                                ["appearance", "Apparence physique"], ["outfit", "Tenue"],
                                ["accessories", "Accessoires"], ["personality", "Personnalité"],
                                ["traits", "Traits distinctifs"], ["visualNotes", "Notes visuelles (IA)"],
                              ] as [keyof CharacterInput, string][]
                            ).map(([field, label]) => (
                              <div key={field} style={s.fieldGroup}>
                                <label style={s.fieldLabel}>{label}</label>
                                <input
                                  style={s.inputDark}
                                  value={(charEdits[char.id]?.[field] as string) ?? ""}
                                  onChange={(e) => setCharEdits((p) => ({ ...p, [char.id]: { ...p[char.id], [field]: e.target.value } }))}
                                />
                              </div>
                            ))}
                            <div style={{ gridColumn: "1 / -1" }}>
                              <button style={s.btnAccent} onClick={() => handleSaveChar(char)} disabled={savingChar === char.id}>
                                {savingChar === char.id ? "Sauvegarde…" : "Sauvegarder la fiche →"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Design system ──────────────────────────────────────────────────────────

const C = {
  bg: "#07070d",
  surface: "#0e0e1a",
  surfaceHover: "#13132080",
  elevated: "#16162a",
  border: "rgba(255,255,255,0.07)",
  borderActive: "#7c3aed",
  accent: "#7c3aed",
  accentHover: "#6d28d9",
  accentGlow: "0 0 0 3px rgba(124,58,237,0.25)",
  success: "#10b981",
  text: "#f0eeff",
  textSub: "#8b88b0",
  textMuted: "#5c5880",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.15)",
};

const s: Record<string, React.CSSProperties> = {
  // Layout
  page: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" },
  layout: { display: "flex", gap: 0, maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1.5rem 4rem" },

  // Header
  header: { borderBottom: `1px solid ${C.border}`, padding: "0 1.5rem", position: "sticky", top: 0, background: "#07070ddd", backdropFilter: "blur(12px)", zIndex: 10 },
  headerInner: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 },
  logo: { fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.05em", color: "#c4b5fd" },
  logoSub: { fontSize: "0.75rem", color: C.textMuted, marginLeft: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" },

  // Error
  errorBanner: { background: C.dangerBg, color: C.danger, padding: "0.75rem 1.5rem", fontSize: "0.9rem", borderBottom: `1px solid ${C.danger}` },

  // Sidebar
  sidebar: { width: 260, flexShrink: 0, paddingRight: "1.5rem", borderRight: `1px solid ${C.border}` },
  sidebarLabel: { fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted, marginBottom: "0.75rem", marginTop: "1.5rem" },
  mutedSide: { color: C.textMuted, fontSize: "0.85rem", lineHeight: 1.5 },
  storyList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 },
  storyItem: { padding: "0.65rem 0.75rem", borderRadius: 6, cursor: "pointer", display: "flex", gap: "0.5rem", alignItems: "flex-start", transition: "background 0.15s", border: "1px solid transparent" },
  storyItemActive: { background: "rgba(124,58,237,0.12)", borderColor: C.borderActive },
  storyItemDot: { color: C.accent, fontSize: "0.7rem", marginTop: 3, flexShrink: 0 },
  storyItemTitle: { fontSize: "0.9rem", fontWeight: 500, color: C.text, lineHeight: 1.4 },
  storyItemDesc: { fontSize: "0.78rem", color: C.textMuted, marginTop: 2, lineHeight: 1.3 },
  storyForm: { display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", padding: "0.75rem", background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` },

  // Main
  main: { flex: 1, paddingLeft: "1.75rem", minWidth: 0 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: "1rem", opacity: 0.4 },
  emptyIcon: { fontSize: "2.5rem", color: C.accent },
  emptyText: { fontSize: "1rem", color: C.textSub },

  // Story header
  storyHeader: { marginTop: "1.5rem", marginBottom: "1.25rem", paddingBottom: "1.25rem", borderBottom: `1px solid ${C.border}` },
  storyTitle: { fontSize: "1.5rem", fontWeight: 700, margin: 0, color: C.text, letterSpacing: "-0.01em" },
  storyDesc: { fontSize: "0.9rem", color: C.textSub, marginTop: "0.4rem" },

  // Tabs
  tabs: { display: "flex", gap: "0.25rem", marginBottom: "1.5rem" },
  tab: { padding: "0.45rem 1.1rem", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", background: "transparent", color: C.textSub, fontSize: "0.9rem" },
  tabActive: { borderColor: C.borderActive, background: "rgba(124,58,237,0.12)", color: "#c4b5fd", fontWeight: 600 },

  // New scene form
  addSceneBtn: { width: "100%", padding: "0.7rem", border: `1px dashed ${C.border}`, borderRadius: 8, background: "transparent", color: C.textSub, fontSize: "0.9rem", cursor: "pointer", marginBottom: "1.25rem", transition: "all 0.15s" },
  newSceneForm: { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  newSceneFormTitle: { fontSize: "0.8rem", fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 },
  mutedCenter: { color: C.textMuted, fontSize: "0.9rem", textAlign: "center", padding: "2rem 0" },

  // Scene grid + card
  sceneGrid: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  sceneCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" },
  sceneCardHeader: { display: "flex", alignItems: "center", gap: "0.75rem" },
  sceneOrderBadge: { width: 28, height: 28, borderRadius: "50%", background: "rgba(124,58,237,0.2)", border: `1px solid ${C.borderActive}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "#c4b5fd", flexShrink: 0 },
  sceneCardTitle: { flex: 1, fontSize: "1rem", fontWeight: 600, margin: 0, color: C.text },
  viewBtn: { padding: "0.3rem 0.7rem", fontSize: "0.8rem", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", background: "transparent", color: C.textSub, whiteSpace: "nowrap" as const },
  viewBtnActive: { padding: "0.3rem 0.7rem", fontSize: "0.8rem", border: `1px solid ${C.borderActive}`, borderRadius: 5, cursor: "pointer", background: "rgba(124,58,237,0.15)", color: "#c4b5fd", whiteSpace: "nowrap" as const },

  // Image placeholder cinématique
  imagePlaceholder: { position: "relative", borderRadius: 8, height: 180, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem" },
  imagePlaceholderGrid: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" },
  imagePlaceholderBadge: { position: "relative", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.07)", padding: "0.25rem 0.7rem", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" },
  imagePlaceholderTitle: { position: "relative", fontSize: "1.15rem", fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center" as const, padding: "0 1rem", textShadow: "0 2px 12px rgba(0,0,0,0.8)" },
  imagePlaceholderSub: { position: "relative", fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" },
  sceneImage: { width: "100%", borderRadius: 8, display: "block" },

  // Suggestion
  suggestion: { background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "0.65rem 1rem", fontSize: "0.9rem", color: "#fde68a", display: "flex", gap: "0.5rem", alignItems: "flex-start" },
  suggestionIcon: { flexShrink: 0 },

  // Spectator box
  spectatorBox: { background: "#030308", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, overflow: "hidden" },
  spectatorHeader: { padding: "0.5rem 0.9rem", borderBottom: "1px solid rgba(124,58,237,0.2)", background: "rgba(124,58,237,0.08)" },
  spectatorLabel: { fontSize: "0.75rem", fontWeight: 600, color: "#a78bfa", letterSpacing: "0.06em", textTransform: "uppercase" as const },
  spectatorText: { padding: "1rem", margin: 0, color: "#d4d0f5", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "0.95rem", lineHeight: 1.8, whiteSpace: "pre-wrap" as const },
  spectatorEmpty: { padding: "1.25rem", color: C.textMuted, fontSize: "0.85rem", fontStyle: "italic", margin: 0 },

  // Textarea (auteur)
  textareaDark: { width: "100%", minHeight: 140, padding: "0.75rem", fontSize: "0.95rem", background: "#0a0a14", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, resize: "vertical", boxSizing: "border-box", lineHeight: 1.7, fontFamily: "inherit", outline: "none" },

  // Scene actions
  sceneActions: { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const },

  // Visibility bar
  visBar: { display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "0.75rem", borderTop: `1px dashed ${C.border}`, flexWrap: "wrap" as const },
  visLabel: { fontSize: "0.78rem", color: C.textMuted, whiteSpace: "nowrap" as const },

  // Characters
  newCharForm: { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1rem", marginBottom: "1.5rem" },
  charGrid: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  charCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" },
  charCardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" as const },
  charName: { fontSize: "1rem", fontWeight: 600, color: C.text },
  charDesc: { fontSize: "0.85rem", color: C.textSub, margin: 0 },
  roleBadge: { marginLeft: "0.5rem", background: "rgba(124,58,237,0.2)", color: "#c4b5fd", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.75rem", border: "1px solid rgba(124,58,237,0.3)" },
  factionBadge: { marginLeft: "0.35rem", background: "rgba(16,185,129,0.12)", color: "#6ee7b7", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.75rem", border: "1px solid rgba(16,185,129,0.25)" },
  charSheet: { marginTop: "0.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem", paddingTop: "0.75rem", borderTop: `1px solid ${C.border}` },
  fieldGroup: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  fieldLabel: { fontSize: "0.75rem", color: C.textMuted, fontWeight: 500 },

  // Buttons
  row: { display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" as const },
  btnAccent: { padding: "0.5rem 1.1rem", fontSize: "0.9rem", cursor: "pointer", background: C.accent, color: "#fff", border: "none", borderRadius: 6, fontWeight: 500, whiteSpace: "nowrap" as const },
  btnSaved: { padding: "0.5rem 1.1rem", fontSize: "0.9rem", cursor: "default", background: C.success, color: "#fff", border: "none", borderRadius: 6, fontWeight: 500, whiteSpace: "nowrap" as const },
  btnGhost: { padding: "0.5rem 0.9rem", fontSize: "0.88rem", cursor: "pointer", background: "transparent", color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 6, whiteSpace: "nowrap" as const },
  btnMicro: { padding: "0.3rem 0.65rem", fontSize: "0.8rem", cursor: "pointer", background: C.elevated, color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 5 },
  btnDanger: { padding: "0.3rem 0.6rem", fontSize: "0.82rem", cursor: "pointer", background: C.dangerBg, color: C.danger, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 5 },

  // Inputs
  inputDark: { padding: "0.5rem 0.75rem", fontSize: "0.9rem", background: "#0a0a14", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, flex: 1, outline: "none" },
  selectDark: { padding: "0.4rem 0.6rem", fontSize: "0.85rem", background: "#0a0a14", border: `1px solid ${C.border}`, borderRadius: 5, color: C.textSub },
};
