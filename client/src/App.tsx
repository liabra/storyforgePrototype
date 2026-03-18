import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type {
  Story,
  Chapter,
  Scene,
  Contribution,
  Character,
  CharacterInput,
} from "./api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(c: { name?: string; nickname?: string } | null | undefined) {
  if (!c) return "Anonyme";
  return c.name || c.nickname || "Sans nom";
}

function initial(c: { name?: string; nickname?: string } | null | undefined) {
  const n = displayName(c);
  return n.charAt(0).toUpperCase();
}

function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function sceneGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h);
  const h1 = Math.abs(h) % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1},50%,8%) 0%, hsl(${h2},60%,14%) 100%)`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function applyVisibility(contributions: Contribution[], mode: string, count: number): Contribution[] {
  if (mode === "all") return contributions;
  if (mode === "none") return [];
  return contributions.slice(-count);
}

const IS_PLACEHOLDER = (url?: string | null) => !!url && url.startsWith("https://placehold.co");

function statusLabel(status: string): string {
  if (status === "DRAFT") return "Brouillon";
  if (status === "DONE") return "Terminée";
  return "Active";
}

function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === "DRAFT") return { background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" };
  if (status === "DONE") return { background: "rgba(255,255,255,0.05)", color: "#4e4a6e", border: "1px solid rgba(255,255,255,0.08)" };
  return { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  // Navigation
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [activeTab, setActiveTab] = useState<"chapters" | "characters">("chapters");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Stories
  const [stories, setStories] = useState<Story[]>([]);
  const [showStoryForm, setShowStoryForm] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyDesc, setStoryDesc] = useState("");

  // Chapters
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [showChapterForm, setShowChapterForm] = useState(false);
  const [newChapter, setNewChapter] = useState({ title: "", description: "" });
  const [creatingChapter, setCreatingChapter] = useState(false);

  // Scenes
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [newScene, setNewScene] = useState({ title: "", description: "" });
  const [creatingScene, setCreatingScene] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [spectatorView, setSpectatorView] = useState(false);

  // Scene settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsEdit, setSettingsEdit] = useState({ visibilityMode: "last", visibleCount: 3, status: "ACTIVE" as string });
  const [savingSettings, setSavingSettings] = useState(false);

  // Scene characters
  const [sceneCharEdits, setSceneCharEdits] = useState<string[]>([]);
  const [savingChars, setSavingChars] = useState(false);
  const [showCharSelect, setShowCharSelect] = useState(false);

  // Contributions
  const [contribContent, setContribContent] = useState("");
  const [contribCharId, setContribCharId] = useState<string>("");
  const [submittingContrib, setSubmittingContrib] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestingIdea, setSuggestingIdea] = useState(false);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newChar, setNewChar] = useState<CharacterInput>({ name: "", nickname: "" });
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [charEdits, setCharEdits] = useState<Record<string, CharacterInput>>({});
  const [savingChar, setSavingChar] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const contribEndRef = useRef<HTMLDivElement>(null);

  // ── Load stories
  useEffect(() => {
    api.stories.list().then(setStories).catch(() => setError("Impossible de charger les histoires."));
  }, []);

  // ── Scroll to latest contribution
  useEffect(() => {
    if (selectedScene && !spectatorView) {
      contribEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedScene?.contributions?.length]);

  // ── Select story
  const handleSelectStory = async (story: Story) => {
    setSelectedStory(story);
    setSelectedChapter(null);
    setSelectedScene(null);
    setActiveTab("chapters");
    setSidebarOpen(false);
    const [chapterData, charData] = await Promise.all([
      api.chapters.list(story.id),
      api.characters.list(story.id),
    ]);
    setChapters(chapterData);
    setCharacters(charData);
  };

  // ── Select chapter → show scene list
  const handleSelectChapter = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setSelectedScene(null);
    setShowSceneForm(false);
  };

  // ── Select scene → load full scene with contributions
  const handleSelectScene = async (sceneId: string) => {
    const scene = await api.scenes.get(sceneId);
    setSelectedScene(scene);
    setSettingsEdit({
      visibilityMode: scene.visibilityMode,
      visibleCount: scene.visibleCount,
      status: scene.status,
    });
    setSceneCharEdits(scene.characters.map((c) => c.id));
    setSpectatorView(false);
    setShowSettings(false);
    setShowCharSelect(false);
    setSuggestion(null);
    setContribContent("");
    setContribCharId(characters[0]?.id ?? "");
  };

  // ── Create story
  const handleCreateStory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storyTitle.trim()) return;
    const story = await api.stories.create({ title: storyTitle.trim(), description: storyDesc.trim() || undefined });
    setStories((p) => [story, ...p]);
    setStoryTitle(""); setStoryDesc("");
    setShowStoryForm(false);
    handleSelectStory(story);
  };

  // ── Create chapter
  const handleCreateChapter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStory || !newChapter.title.trim()) return;
    setCreatingChapter(true);
    try {
      const created = await api.chapters.create(selectedStory.id, {
        title: newChapter.title.trim(),
        description: newChapter.description.trim() || undefined,
        order: chapters.length + 1,
      });
      setChapters((p) => [...p, created]);
      setNewChapter({ title: "", description: "" });
      setShowChapterForm(false);
    } finally {
      setCreatingChapter(false);
    }
  };

  // ── Create scene
  const handleCreateScene = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedChapter || !newScene.title.trim()) return;
    setCreatingScene(true);
    try {
      const created = await api.scenes.create(selectedChapter.id, {
        title: newScene.title.trim(),
        description: newScene.description.trim() || undefined,
        order: (selectedChapter.scenes?.length ?? 0) + 1,
      });
      // Update chapter scenes list
      setChapters((p) =>
        p.map((ch) =>
          ch.id === selectedChapter.id
            ? { ...ch, scenes: [...ch.scenes, { id: created.id, title: created.title, order: created.order, status: created.status, _count: { contributions: 0 }, characters: [] }] }
            : ch
        )
      );
      setSelectedChapter((ch) =>
        ch ? { ...ch, scenes: [...ch.scenes, { id: created.id, title: created.title, order: created.order, status: created.status, _count: { contributions: 0 }, characters: [] }] } : ch
      );
      setNewScene({ title: "", description: "" });
      setShowSceneForm(false);
    } finally {
      setCreatingScene(false);
    }
  };

  // ── Submit contribution
  const handleSubmitContrib = async () => {
    if (!selectedScene || !contribContent.trim()) return;
    setSubmittingContrib(true);
    try {
      const contrib = await api.contributions.create(selectedScene.id, {
        content: contribContent.trim(),
        characterId: contribCharId || undefined,
      });
      setSelectedScene((s) =>
        s ? { ...s, contributions: [...(s.contributions ?? []), contrib], _count: { contributions: (s._count?.contributions ?? 0) + 1 } } : s
      );
      // Update chapter contribution count
      setChapters((p) =>
        p.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === selectedScene.id ? { ...sc, _count: { contributions: sc._count.contributions + 1 } } : sc
          ),
        }))
      );
      setContribContent("");
    } finally {
      setSubmittingContrib(false);
    }
  };

  // ── Delete contribution
  const handleDeleteContrib = async (id: string) => {
    if (!selectedScene) return;
    await api.contributions.delete(id);
    setSelectedScene((s) =>
      s ? { ...s, contributions: (s.contributions ?? []).filter((c) => c.id !== id) } : s
    );
  };

  // ── Suggest idea
  const handleSuggestIdea = async () => {
    if (!selectedStory || !selectedScene) return;
    setSuggestingIdea(true);
    try {
      const { idea } = await api.scenes.suggestIdea(selectedStory.id, selectedScene.title);
      setSuggestion(idea);
    } finally {
      setSuggestingIdea(false);
    }
  };

  // ── Generate image
  const handleGenerateImage = async () => {
    if (!selectedScene) return;
    setGeneratingImage(true);
    try {
      const updated = await api.scenes.generateImage(selectedScene.id);
      setSelectedScene((s) => s ? { ...s, imageUrl: updated.imageUrl } : s);
    } finally {
      setGeneratingImage(false);
    }
  };

  // ── Save scene settings
  const handleSaveSettings = async () => {
    if (!selectedScene) return;
    setSavingSettings(true);
    try {
      const updated = await api.scenes.update(selectedScene.id, settingsEdit);
      setSelectedScene((s) => s ? { ...s, ...settingsEdit, characters: s.characters, contributions: s.contributions } : s);
      // Sync status in chapter list
      setChapters((p) =>
        p.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === selectedScene.id ? { ...sc, status: settingsEdit.status } : sc
          ),
        }))
      );
      setShowSettings(false);
      void updated;
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Save scene characters
  const handleSaveSceneCharacters = async () => {
    if (!selectedScene) return;
    setSavingChars(true);
    try {
      const updated = await api.scenes.updateCharacters(selectedScene.id, sceneCharEdits);
      setSelectedScene((s) => s ? { ...s, characters: updated.characters } : s);
      setShowCharSelect(false);
    } finally {
      setSavingChars(false);
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
    setCharacters((p) => [...p, created]);
    setNewChar({ name: "", nickname: "" });
  };

  const handleSaveChar = async (char: Character) => {
    setSavingChar(char.id);
    try {
      const updated = await api.characters.update(char.id, charEdits[char.id] ?? {});
      setCharacters((p) => p.map((c) => (c.id === updated.id ? { ...updated, scenes: c.scenes } : c)));
      setExpandedCharId(null);
    } finally {
      setSavingChar(null);
    }
  };

  const handleDeleteChar = async (id: string) => {
    await api.characters.delete(id);
    setCharacters((p) => p.filter((c) => c.id !== id));
    if (expandedCharId === id) setExpandedCharId(null);
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const totalContribs = (ch: Chapter) =>
    (ch.scenes ?? []).reduce((sum, sc) => sum + sc._count.contributions, 0);

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Breadcrumb context
  const crumbStory = selectedStory?.title ?? null;
  const crumbChapter = selectedChapter?.title ?? null;
  const crumbScene = selectedScene?.title ?? null;

  return (
    <div style={s.root}>

      {/* ══ Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.headerLeft}>
            <button style={s.menuBtn} onClick={() => setSidebarOpen((v) => !v)} aria-label="Menu">
              ☰
            </button>
            <div style={s.breadcrumb}>
              <span style={s.logoMark} onClick={() => { setSelectedStory(null); setSelectedChapter(null); setSelectedScene(null); }}>
                ✦ StoryForge
              </span>
              {crumbStory && (
                <>
                  <span style={s.crumbSep}>/</span>
                  <span style={s.crumbItem} onClick={() => { setSelectedChapter(null); setSelectedScene(null); }}>
                    {crumbStory}
                  </span>
                </>
              )}
              {crumbChapter && (
                <>
                  <span style={s.crumbSep}>/</span>
                  <span style={s.crumbItem} onClick={() => setSelectedScene(null)}>
                    {crumbChapter}
                  </span>
                </>
              )}
              {crumbScene && (
                <>
                  <span style={s.crumbSep}>/</span>
                  <span style={s.crumbCurrent}>{crumbScene}</span>
                </>
              )}
            </div>
          </div>
          <button style={s.btnAccent} onClick={() => setShowStoryForm((v) => !v)}>
            {showStoryForm ? "Annuler" : "+ Nouvelle histoire"}
          </button>
        </div>
      </header>

      {error && <div style={s.errorBanner}>{error}<button style={s.errorClose} onClick={() => setError(null)}>✕</button></div>}

      <div style={s.layout}>

        {/* ══ Sidebar */}
        <aside className={`app-sidebar${sidebarOpen ? " is-open" : ""}`} style={{ ...s.sidebar, ...(sidebarOpen ? s.sidebarOpen : {}) }}>
          <div style={s.sidebarHead}>
            <p style={s.sidebarLabel}>Histoires</p>
            <button style={s.sidebarClose} onClick={() => setSidebarOpen(false)}>✕</button>
          </div>

          {showStoryForm && (
            <form onSubmit={handleCreateStory} style={s.storyForm}>
              <input style={s.inputDark} placeholder="Titre" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} required autoFocus />
              <input style={s.inputDark} placeholder="Description (optionnelle)" value={storyDesc} onChange={(e) => setStoryDesc(e.target.value)} />
              <button style={s.btnAccent} type="submit">Créer →</button>
            </form>
          )}

          <ul style={s.storyList}>
            {stories.map((story) => {
              const active = selectedStory?.id === story.id;
              return (
                <li key={story.id} style={{ ...s.storyItem, ...(active ? s.storyItemActive : {}) }} onClick={() => handleSelectStory(story)}>
                  <div style={s.storyItemDot}>{active ? "▶" : "○"}</div>
                  <div>
                    <div style={s.storyItemTitle}>{story.title}</div>
                    {story.description && <div style={s.storyItemDesc}>{story.description}</div>}
                  </div>
                </li>
              );
            })}
            {stories.length === 0 && <p style={s.mutedSmall}>Aucune histoire pour l'instant.</p>}
          </ul>
        </aside>

        {sidebarOpen && <div style={s.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

        {/* ══ Main */}
        <main style={s.main}>

          {/* ── Aucune histoire sélectionnée */}
          {!selectedStory && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>✦</div>
              <p style={s.emptyTitle}>Bienvenue dans StoryForge</p>
              <p style={s.emptyText}>Sélectionne une histoire dans le menu ou crée-en une nouvelle.</p>
            </div>
          )}

          {/* ── Histoire sélectionnée, pas de chapitre */}
          {selectedStory && !selectedChapter && !selectedScene && (
            <div>
              <div style={s.pageHeader}>
                <h1 style={s.pageTitle}>{selectedStory.title}</h1>
                {selectedStory.description && <p style={s.pageDesc}>{selectedStory.description}</p>}
              </div>

              {/* Tabs */}
              <div style={s.tabs}>
                {(["chapters", "characters"] as const).map((tab) => (
                  <button key={tab} style={{ ...s.tab, ...(activeTab === tab ? s.tabActive : {}) }} onClick={() => setActiveTab(tab)}>
                    {tab === "chapters" ? `Chapitres (${chapters.length})` : `Personnages (${characters.length})`}
                  </button>
                ))}
              </div>

              {/* ── Tab Chapitres */}
              {activeTab === "chapters" && (
                <div>
                  {!showChapterForm ? (
                    <button style={s.addBtn} onClick={() => setShowChapterForm(true)}>+ Ajouter un chapitre</button>
                  ) : (
                    <form onSubmit={handleCreateChapter} style={s.inlineForm}>
                      <p style={s.formTitle}>Nouveau chapitre</p>
                      <input style={s.inputDark} placeholder="Titre du chapitre" value={newChapter.title} onChange={(e) => setNewChapter((p) => ({ ...p, title: e.target.value }))} required autoFocus />
                      <input style={s.inputDark} placeholder="Contexte / description (optionnel)" value={newChapter.description} onChange={(e) => setNewChapter((p) => ({ ...p, description: e.target.value }))} />
                      <div style={s.row}>
                        <button style={s.btnAccent} type="submit" disabled={creatingChapter}>{creatingChapter ? "Création…" : "Créer →"}</button>
                        <button style={s.btnGhost} type="button" onClick={() => setShowChapterForm(false)}>Annuler</button>
                      </div>
                    </form>
                  )}

                  {chapters.length === 0 && <p style={s.mutedCenter}>Aucun chapitre. Commence par en créer un.</p>}

                  <div style={s.chapterList}>
                    {chapters.map((ch) => (
                      <div key={ch.id} style={s.chapterCard} onClick={() => handleSelectChapter(ch)}>
                        <div style={s.chapterCardHeader}>
                          <div style={s.chapterOrder}>{ch.order}</div>
                          <div style={s.chapterCardBody}>
                            <div style={s.chapterTitle}>{ch.title}</div>
                            {ch.description && <div style={s.chapterDesc}>{ch.description}</div>}
                            <div style={s.chapterMeta}>
                              <span>{(ch.scenes ?? []).length} scène{(ch.scenes ?? []).length !== 1 ? "s" : ""}</span>
                              <span style={s.metaDot}>·</span>
                              <span>{totalContribs(ch)} contribution{totalContribs(ch) !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          <span style={s.chapterArrow}>→</span>
                        </div>
                        {(ch.scenes ?? []).length > 0 && (
                          <div style={s.chapterSceneTags}>
                            {(ch.scenes ?? []).slice(0, 4).map((sc) => (
                              <span key={sc.id} style={{ ...s.sceneTag, ...(sc.status === "DONE" ? s.sceneTagClosed : sc.status === "DRAFT" ? s.sceneTagDraft : {}) }}>
                                {sc.order}. {sc.title}
                              </span>
                            ))}
                            {(ch.scenes ?? []).length > 4 && <span style={s.sceneTagMore}>+{(ch.scenes ?? []).length - 4}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tab Personnages */}
              {activeTab === "characters" && (
                <div>
                  <form onSubmit={handleCreateChar} style={s.inlineForm}>
                    <div style={s.row}>
                      <input style={s.inputDark} placeholder="Nom" value={newChar.name ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))} />
                      <input style={s.inputDark} placeholder="Pseudo / surnom" value={newChar.nickname ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, nickname: e.target.value }))} />
                      <button style={s.btnAccent} type="submit">+ Ajouter</button>
                    </div>
                    <p style={s.hint}>Un nom ou un pseudo suffit pour commencer.</p>
                  </form>

                  {characters.length === 0 && <p style={s.mutedCenter}>Aucun personnage dans cette histoire.</p>}

                  <div style={s.charGrid}>
                    {characters.map((char) => {
                      const hue = avatarHue(displayName(char));
                      const isExpanded = expandedCharId === char.id;
                      return (
                        <div key={char.id} style={s.charCard}>
                          <div style={s.charCardTop}>
                            <div style={{ ...s.avatar, background: `hsl(${hue},50%,30%)`, border: `2px solid hsl(${hue},60%,45%)` }}>
                              {initial(char)}
                            </div>
                            <div style={s.charInfo}>
                              <div style={s.charName}>{displayName(char)}</div>
                              <div style={s.charBadges}>
                                {char.role && <span style={s.badge}>{char.role}</span>}
                                {char.faction && <span style={{ ...s.badge, ...s.badgeGreen }}>{char.faction}</span>}
                                {char.scenes && char.scenes.length > 0 && (
                                  <span style={{ ...s.badge, ...s.badgeGold }}>{char.scenes.length} scène{char.scenes.length !== 1 ? "s" : ""}</span>
                                )}
                              </div>
                              {char.shortDescription && <p style={s.charDesc}>{char.shortDescription}</p>}
                            </div>
                            <div style={s.charActions}>
                              <button style={s.btnMicro} onClick={() => {
                                if (isExpanded) { setExpandedCharId(null); return; }
                                setExpandedCharId(char.id);
                                setCharEdits((p) => ({ ...p, [char.id]: { ...char } }));
                              }}>
                                {isExpanded ? "Fermer" : "Fiche"}
                              </button>
                              <button style={s.btnDanger} onClick={() => handleDeleteChar(char.id)}>✕</button>
                            </div>
                          </div>

                          {char.scenes && char.scenes.length > 0 && (
                            <div style={s.charScenes}>
                              <span style={s.charScenesLabel}>Apparaît dans :</span>
                              {char.scenes.map((sc) => (
                                <span key={sc.id} style={{ ...s.sceneTag, ...(sc.status === "DONE" ? s.sceneTagClosed : sc.status === "DRAFT" ? s.sceneTagDraft : {}) }}>
                                  {sc.order}. {sc.title}
                                </span>
                              ))}
                            </div>
                          )}

                          {isExpanded && (
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
                                  {savingChar === char.id ? "Sauvegarde…" : "Sauvegarder →"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Chapitre sélectionné → liste des scènes */}
          {selectedStory && selectedChapter && !selectedScene && (
            <div>
              <div style={s.pageHeader}>
                <button style={s.backBtn} onClick={() => setSelectedChapter(null)}>← Chapitres</button>
                <h2 style={s.pageTitle}>{selectedChapter.title}</h2>
                {selectedChapter.description && <p style={s.pageDesc}>{selectedChapter.description}</p>}
              </div>

              {!showSceneForm ? (
                <button style={s.addBtn} onClick={() => setShowSceneForm(true)}>+ Ajouter une scène</button>
              ) : (
                <form onSubmit={handleCreateScene} style={s.inlineForm}>
                  <p style={s.formTitle}>Nouvelle scène</p>
                  <input style={s.inputDark} placeholder="Titre de la scène" value={newScene.title} onChange={(e) => setNewScene((p) => ({ ...p, title: e.target.value }))} required autoFocus />
                  <textarea style={s.textareaDark} placeholder="Description / contexte de la scène (optionnel)" value={newScene.description} onChange={(e) => setNewScene((p) => ({ ...p, description: e.target.value }))} rows={3} />
                  <div style={s.row}>
                    <button style={s.btnAccent} type="submit" disabled={creatingScene}>{creatingScene ? "Création…" : "Créer la scène →"}</button>
                    <button style={s.btnGhost} type="button" onClick={() => setShowSceneForm(false)}>Annuler</button>
                  </div>
                </form>
              )}

              {selectedChapter.scenes.length === 0 && <p style={s.mutedCenter}>Aucune scène dans ce chapitre.</p>}

              <div style={s.sceneList}>
                {selectedChapter.scenes.map((sc) => (
                  <div key={sc.id} style={s.sceneListItem} onClick={() => handleSelectScene(sc.id)}>
                    <div style={s.sceneListOrder}>{sc.order}</div>
                    <div style={s.sceneListBody}>
                      <div style={s.sceneListTitle}>
                        {sc.title}
                        <span style={{ ...s.statusBadge, ...statusBadgeStyle(sc.status) }}>
                          {statusLabel(sc.status)}
                        </span>
                      </div>
                      <div style={s.sceneListMeta}>
                        {sc._count.contributions} contribution{sc._count.contributions !== 1 ? "s" : ""}
                        {sc.characters.length > 0 && (
                          <span style={s.sceneListChars}>
                            {sc.characters.map((c) => displayName(c)).join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={s.chapterArrow}>→</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Scène sélectionnée → vue complète */}
          {selectedStory && selectedChapter && selectedScene && (
            <div style={s.sceneView}>

              {/* Header scène */}
              <div style={s.sceneViewHeader}>
                <button style={s.backBtn} onClick={() => setSelectedScene(null)}>← Scènes</button>
                <div style={s.sceneViewTitleRow}>
                  <h2 style={s.sceneViewTitle}>{selectedScene.title}</h2>
                  <span style={{ ...s.statusBadge, ...statusBadgeStyle(selectedScene.status) }}>
                    {statusLabel(selectedScene.status)}
                  </span>
                </div>
                {selectedScene.description && <p style={s.sceneViewDesc}>{selectedScene.description}</p>}

                {/* Personnages présents */}
                {selectedScene.characters.length > 0 && (
                  <div style={s.sceneChars}>
                    {selectedScene.characters.map((c) => {
                      const hue = avatarHue(displayName(c));
                      return (
                        <div key={c.id} style={s.sceneCharChip}>
                          <div style={{ ...s.avatarXs, background: `hsl(${hue},50%,30%)` }}>{initial(c)}</div>
                          <span>{displayName(c)}</span>
                        </div>
                      );
                    })}
                    <button style={s.btnMicro} onClick={() => setShowCharSelect((v) => !v)}>
                      {showCharSelect ? "Fermer" : "✏️ Modifier"}
                    </button>
                  </div>
                )}
                {selectedScene.characters.length === 0 && (
                  <button style={s.addPersonnageBtn} onClick={() => setShowCharSelect((v) => !v)}>
                    + Ajouter des personnages à cette scène
                  </button>
                )}

                {/* Sélection personnages */}
                {showCharSelect && (
                  <div style={s.charSelectBox}>
                    <p style={s.charSelectTitle}>Personnages présents dans cette scène</p>
                    <div style={s.charCheckList}>
                      {characters.map((char) => {
                        const checked = sceneCharEdits.includes(char.id);
                        return (
                          <label key={char.id} style={{ ...s.charCheckItem, ...(checked ? s.charCheckItemOn : {}) }}>
                            <input type="checkbox" checked={checked} onChange={() => {
                              setSceneCharEdits((p) => checked ? p.filter((id) => id !== char.id) : [...p, char.id]);
                            }} style={s.checkbox} />
                            <span>{displayName(char)}</span>
                            {char.role && <span style={s.charCheckRole}>{char.role}</span>}
                          </label>
                        );
                      })}
                    </div>
                    <button style={s.btnAccent} onClick={handleSaveSceneCharacters} disabled={savingChars}>
                      {savingChars ? "Sauvegarde…" : "Enregistrer"}
                    </button>
                  </div>
                )}
              </div>

              {/* Image */}
              {selectedScene.imageUrl && IS_PLACEHOLDER(selectedScene.imageUrl) && (
                <div style={{ ...s.imageBanner, background: sceneGradient(selectedScene.title) }}>
                  <div style={s.imageBannerGrid} />
                  <div style={s.imageBannerTitle}>{selectedScene.title}</div>
                  {selectedScene.characters.length > 0 && (
                    <div style={s.imageBannerChars}>
                      {selectedScene.characters.map((c) => displayName(c)).join(" · ")}
                    </div>
                  )}
                </div>
              )}
              {selectedScene.imageUrl && !IS_PLACEHOLDER(selectedScene.imageUrl) && (
                <img src={selectedScene.imageUrl} alt={selectedScene.title} style={s.sceneImg} />
              )}

              {/* Toggle vue */}
              <div style={s.viewToggleBar}>
                <button
                  style={spectatorView ? s.viewToggleBtnActive : s.viewToggleBtn}
                  onClick={() => setSpectatorView(false)}
                >
                  ✏️ Auteur
                </button>
                <button
                  style={!spectatorView ? s.viewToggleBtnActive : s.viewToggleBtn}
                  onClick={() => setSpectatorView(true)}
                >
                  👁 Spectateurs
                </button>
              </div>

              {/* ── Contributions */}
              <div style={s.contributionsList}>
                {(() => {
                  const contribs = selectedScene.contributions ?? [];
                  const visible = spectatorView
                    ? applyVisibility(contribs, selectedScene.visibilityMode, selectedScene.visibleCount)
                    : contribs;

                  if (visible.length === 0) {
                    return (
                      <div style={s.contribEmpty}>
                        {spectatorView
                          ? "Aucun texte visible pour les spectateurs selon les paramètres actuels."
                          : "Aucune contribution encore. Sois le premier à écrire !"}
                      </div>
                    );
                  }

                  return visible.map((contrib) => {
                    const hue = avatarHue(displayName(contrib.character));
                    return (
                      <div key={contrib.id} style={s.contribBubble}>
                        <div style={{ ...s.avatarSm, background: `hsl(${hue},50%,30%)`, border: `2px solid hsl(${hue},55%,42%)` }}>
                          {initial(contrib.character)}
                        </div>
                        <div style={s.contribBody}>
                          <div style={s.contribMeta}>
                            <span style={s.contribAuthor}>{displayName(contrib.character)}</span>
                            <span style={s.contribTime}>{formatTime(contrib.createdAt)}</span>
                            {!spectatorView && (
                              <button style={s.contribDelete} onClick={() => handleDeleteContrib(contrib.id)} title="Supprimer">✕</button>
                            )}
                          </div>
                          <p style={s.contribText}>{contrib.content}</p>
                        </div>
                      </div>
                    );
                  });
                })()}
                <div ref={contribEndRef} />
              </div>

              {/* ── Scène non-active */}
              {selectedScene.status === "DONE" && (
                <div style={s.closedBanner}>
                  ✅ Cette scène est terminée — les contributions ne sont plus acceptées.
                </div>
              )}
              {selectedScene.status === "DRAFT" && (
                <div style={{ ...s.closedBanner, ...s.draftBanner }}>
                  📝 Cette scène est en brouillon — elle n'est pas encore ouverte aux contributions.
                </div>
              )}

              {/* ── Zone d'écriture (auteur, scène ACTIVE seulement) */}
              {!spectatorView && selectedScene.status === "ACTIVE" && (
                <div style={s.writeArea}>
                  {suggestion && (
                    <div style={s.suggestion}>
                      <span style={s.suggestionIcon}>💡</span>
                      <em style={s.suggestionText}>{suggestion}</em>
                      <button style={s.suggestionClose} onClick={() => setSuggestion(null)}>✕</button>
                    </div>
                  )}

                  {characters.length > 0 && (
                    <select
                      style={s.charSelect}
                      value={contribCharId}
                      onChange={(e) => setContribCharId(e.target.value)}
                    >
                      <option value="">— Aucun personnage —</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>{displayName(c)}{c.role ? ` (${c.role})` : ""}</option>
                      ))}
                    </select>
                  )}

                  <textarea
                    style={s.writeTextarea}
                    placeholder="Écris ta contribution narrative ici…"
                    value={contribContent}
                    onChange={(e) => setContribContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitContrib();
                    }}
                    rows={4}
                  />

                  <div style={s.writeActions}>
                    <button style={s.btnAccent} onClick={handleSubmitContrib} disabled={submittingContrib || !contribContent.trim()}>
                      {submittingContrib ? "Envoi…" : "Contribuer"}
                    </button>
                    <button style={s.btnGhost} onClick={handleSuggestIdea} disabled={suggestingIdea}>
                      {suggestingIdea ? "…" : "💡 Idée"}
                    </button>
                    <button style={s.btnGhost} onClick={handleGenerateImage} disabled={generatingImage}>
                      {generatingImage ? "…" : "🎨 Illustrer"}
                    </button>
                    <button style={s.btnGhost} onClick={() => setShowSettings((v) => !v)}>
                      ⚙ Paramètres
                    </button>
                  </div>

                  <p style={s.writeHint}>⌘↵ ou Ctrl+↵ pour envoyer</p>

                  {/* Paramètres de visibilité */}
                  {showSettings && (
                    <div style={s.settingsBox}>
                      <p style={s.settingsTitle}>Paramètres de la scène</p>
                      <div style={s.settingsRow}>
                        <label style={s.settingsLabel}>Statut</label>
                        <select style={s.selectDark} value={settingsEdit.status} onChange={(e) => setSettingsEdit((p) => ({ ...p, status: e.target.value }))}>
                          <option value="DRAFT">Brouillon</option>
                          <option value="ACTIVE">Active</option>
                          <option value="DONE">Terminée</option>
                        </select>
                      </div>
                      <div style={s.settingsRow}>
                        <label style={s.settingsLabel}>Visible aux spectateurs</label>
                        <select style={s.selectDark} value={settingsEdit.visibilityMode} onChange={(e) => setSettingsEdit((p) => ({ ...p, visibilityMode: e.target.value }))}>
                          <option value="last">Dernières contributions</option>
                          <option value="all">Toutes les contributions</option>
                          <option value="none">Rien (masqué)</option>
                        </select>
                      </div>
                      {settingsEdit.visibilityMode === "last" && (
                        <div style={s.settingsRow}>
                          <label style={s.settingsLabel}>Nombre visible</label>
                          <input type="number" min={1} max={20} style={{ ...s.inputDark, maxWidth: 70 }} value={settingsEdit.visibleCount} onChange={(e) => setSettingsEdit((p) => ({ ...p, visibleCount: Number(e.target.value) || 1 }))} />
                        </div>
                      )}
                      <button style={s.btnAccent} onClick={handleSaveSettings} disabled={savingSettings}>
                        {savingSettings ? "Sauvegarde…" : "Appliquer"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Design system ────────────────────────────────────────────────────────────

const C = {
  bg: "#0d0d18",
  surface: "#131320",
  elevated: "#1a1a2c",
  overlay: "#20203a",
  border: "rgba(255,255,255,0.06)",
  borderMid: "rgba(255,255,255,0.10)",
  accent: "#7c3aed",
  accentLight: "#a78bfa",
  accentGlow: "rgba(124,58,237,0.15)",
  success: "#10b981",
  successBg: "rgba(16,185,129,0.12)",
  warning: "#f59e0b",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.12)",
  text: "#ece8ff",
  textSub: "#9490bb",
  textMuted: "#4e4a6e",
  gold: "#fbbf24",
  goldBg: "rgba(251,191,36,0.10)",
  sans: "'Inter', system-ui, sans-serif",
  serif: "Georgia, 'Palatino Linotype', serif",
};

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, fontSize: 15 },

  // Header
  header: { position: "sticky", top: 0, zIndex: 20, background: "rgba(13,13,24,0.9)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}` },
  headerInner: { maxWidth: 1160, margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 },
  headerLeft: { display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 },
  menuBtn: { background: "transparent", border: "none", color: C.textSub, fontSize: "1.2rem", cursor: "pointer", padding: "0.25rem 0.5rem", flexShrink: 0 },
  breadcrumb: { display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, overflow: "hidden" },
  logoMark: { fontSize: "0.95rem", fontWeight: 700, color: C.accentLight, cursor: "pointer", letterSpacing: "0.04em", flexShrink: 0 },
  crumbSep: { color: C.textMuted, fontSize: "0.85rem" },
  crumbItem: { fontSize: "0.85rem", color: C.textSub, cursor: "pointer", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 },
  crumbCurrent: { fontSize: "0.85rem", color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 },
  errorBanner: { background: C.dangerBg, color: C.danger, padding: "0.65rem 1.5rem", fontSize: "0.88rem", display: "flex", justifyContent: "space-between", alignItems: "center" },
  errorClose: { background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: "1rem" },

  // Layout
  layout: { display: "flex", maxWidth: 1160, margin: "0 auto", padding: "0 1rem 4rem", gap: 0, minHeight: "calc(100vh - 52px)" },

  // Sidebar
  sidebar: { width: 240, flexShrink: 0, paddingRight: "1.5rem", paddingTop: "1.5rem", borderRight: `1px solid ${C.border}` },
  sidebarOpen: { position: "fixed" as const, top: 52, left: 0, bottom: 0, zIndex: 30, background: C.bg, width: 260, padding: "1rem", borderRight: `1px solid ${C.borderMid}`, overflowY: "auto" as const },
  sidebarOverlay: { position: "fixed" as const, inset: 0, zIndex: 29, background: "rgba(0,0,0,0.5)" },
  sidebarHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" },
  sidebarLabel: { fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: C.textMuted, margin: 0 },
  sidebarClose: { background: "transparent", border: "none", color: C.textMuted, fontSize: "1rem", cursor: "pointer" },
  storyForm: { display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", padding: "0.75rem", background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` },
  storyList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 },
  storyItem: { display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.6rem 0.65rem", borderRadius: 7, cursor: "pointer", border: "1px solid transparent" },
  storyItemActive: { background: C.accentGlow, borderColor: C.accent },
  storyItemDot: { fontSize: "0.65rem", color: C.accent, marginTop: 3, flexShrink: 0 },
  storyItemTitle: { fontSize: "0.88rem", fontWeight: 500, color: C.text, lineHeight: 1.4 },
  storyItemDesc: { fontSize: "0.76rem", color: C.textMuted, marginTop: 2, lineHeight: 1.3 },
  mutedSmall: { fontSize: "0.82rem", color: C.textMuted, padding: "0.5rem 0" },

  // Main
  main: { flex: 1, paddingLeft: "1.75rem", paddingTop: "1.5rem", minWidth: 0 },

  // Empty state
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem", textAlign: "center" as const },
  emptyIcon: { fontSize: "3rem", color: C.accent, opacity: 0.4 },
  emptyTitle: { fontSize: "1.2rem", fontWeight: 600, color: C.textSub, margin: 0 },
  emptyText: { fontSize: "0.9rem", color: C.textMuted, margin: 0, maxWidth: 320 },

  // Page header
  pageHeader: { marginBottom: "1.5rem", paddingBottom: "1.25rem", borderBottom: `1px solid ${C.border}` },
  pageTitle: { fontSize: "1.6rem", fontWeight: 700, margin: "0 0 0.3rem", letterSpacing: "-0.02em", color: C.text },
  pageDesc: { fontSize: "0.9rem", color: C.textSub, margin: 0, lineHeight: 1.6 },
  backBtn: { display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "transparent", border: "none", color: C.textMuted, fontSize: "0.85rem", cursor: "pointer", padding: "0 0 0.75rem", letterSpacing: "0.01em" },

  // Tabs
  tabs: { display: "flex", gap: "0.25rem", marginBottom: "1.5rem" },
  tab: { padding: "0.45rem 1.1rem", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", background: "transparent", color: C.textSub, fontSize: "0.88rem" },
  tabActive: { borderColor: C.accent, background: C.accentGlow, color: C.accentLight, fontWeight: 600 },

  // Forms
  addBtn: { width: "100%", padding: "0.65rem", border: `1px dashed ${C.borderMid}`, borderRadius: 8, background: "transparent", color: C.textSub, fontSize: "0.88rem", cursor: "pointer", marginBottom: "1.25rem" },
  inlineForm: { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  formTitle: { fontSize: "0.75rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.1em", margin: 0 },
  mutedCenter: { color: C.textMuted, fontSize: "0.88rem", textAlign: "center" as const, padding: "2rem 0" },
  hint: { fontSize: "0.76rem", color: C.textMuted, margin: 0 },

  // Chapter cards
  chapterList: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  chapterCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.1rem 1.25rem", cursor: "pointer", transition: "border-color 0.15s" },
  chapterCardHeader: { display: "flex", alignItems: "flex-start", gap: "0.85rem" },
  chapterOrder: { width: 30, height: 30, borderRadius: "50%", background: C.accentGlow, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: C.accentLight, flexShrink: 0, marginTop: 2 },
  chapterCardBody: { flex: 1, minWidth: 0 },
  chapterTitle: { fontSize: "1rem", fontWeight: 600, color: C.text, lineHeight: 1.4 },
  chapterDesc: { fontSize: "0.84rem", color: C.textSub, marginTop: "0.2rem", lineHeight: 1.5 },
  chapterMeta: { display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.35rem", fontSize: "0.78rem", color: C.textMuted },
  metaDot: { opacity: 0.5 },
  chapterArrow: { color: C.textMuted, fontSize: "1rem", flexShrink: 0, marginTop: 4 },
  chapterSceneTags: { display: "flex", gap: "0.35rem", flexWrap: "wrap" as const, marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${C.border}` },
  sceneTag: { fontSize: "0.76rem", background: C.elevated, color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0.2rem 0.55rem" },
  sceneTagClosed: { color: C.textMuted, opacity: 0.6 },
  sceneTagMore: { fontSize: "0.76rem", color: C.textMuted, padding: "0.2rem 0.4rem" },

  // Scene list (in chapter)
  sceneList: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  sceneListItem: { display: "flex", alignItems: "center", gap: "0.85rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0.85rem 1rem", cursor: "pointer" },
  sceneListOrder: { width: 26, height: 26, borderRadius: "50%", background: C.elevated, border: `1px solid ${C.borderMid}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 600, color: C.textSub, flexShrink: 0 },
  sceneListBody: { flex: 1, minWidth: 0 },
  sceneListTitle: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem", fontWeight: 600, color: C.text },
  sceneListMeta: { display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.78rem", color: C.textMuted, marginTop: "0.2rem" },
  sceneListChars: { color: C.textSub },
  statusBadge: { fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "0.15rem 0.5rem", borderRadius: 20 },
  statusBadgeActive: { background: C.successBg, color: C.success, border: `1px solid rgba(16,185,129,0.3)` },
  statusBadgeClosed: { background: C.elevated, color: C.textMuted, border: `1px solid ${C.border}` },

  // Scene view
  sceneView: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  sceneViewHeader: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  sceneViewTitleRow: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" as const },
  sceneViewTitle: { fontSize: "1.45rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: C.text },
  sceneViewDesc: { fontSize: "0.9rem", color: C.textSub, margin: 0, fontStyle: "italic", lineHeight: 1.6 },
  sceneChars: { display: "flex", flexWrap: "wrap" as const, gap: "0.5rem", alignItems: "center", marginTop: "0.25rem" },
  sceneCharChip: { display: "flex", alignItems: "center", gap: "0.35rem", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 20, padding: "0.2rem 0.65rem 0.2rem 0.35rem", fontSize: "0.82rem", color: C.textSub },
  addPersonnageBtn: { background: "transparent", border: `1px dashed ${C.borderMid}`, borderRadius: 20, color: C.textMuted, fontSize: "0.82rem", cursor: "pointer", padding: "0.3rem 0.9rem", alignSelf: "flex-start" as const },

  // Character select box
  charSelectBox: { background: C.elevated, border: `1px solid ${C.borderMid}`, borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  charSelectTitle: { fontSize: "0.75rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.1em", margin: 0 },
  charCheckList: { display: "flex", flexWrap: "wrap" as const, gap: "0.4rem" },
  charCheckItem: { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.65rem", border: `1px solid ${C.border}`, borderRadius: 20, fontSize: "0.84rem", cursor: "pointer", color: C.textSub, userSelect: "none" as const },
  charCheckItemOn: { borderColor: C.accent, background: C.accentGlow, color: C.accentLight },
  checkbox: { width: 13, height: 13, accentColor: C.accent, cursor: "pointer" },
  charCheckRole: { fontSize: "0.72rem", color: C.textMuted },

  // Image banner
  imageBanner: { position: "relative", borderRadius: 10, height: 200, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "1.5rem" },
  imageBannerGrid: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" },
  imageBannerTitle: { position: "relative", fontSize: "1.2rem", fontWeight: 700, color: "rgba(255,255,255,0.9)", textShadow: "0 2px 16px rgba(0,0,0,0.8)", textAlign: "center" as const },
  imageBannerChars: { position: "relative", fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", marginTop: "0.3rem", letterSpacing: "0.04em" },
  sceneImg: { width: "100%", borderRadius: 10, display: "block" },

  // View toggle
  viewToggleBar: { display: "flex", background: C.elevated, borderRadius: 8, padding: "0.25rem", gap: "0.25rem", width: "fit-content" },
  viewToggleBtn: { padding: "0.35rem 0.85rem", border: "none", borderRadius: 6, background: "transparent", color: C.textMuted, fontSize: "0.84rem", cursor: "pointer" },
  viewToggleBtnActive: { padding: "0.35rem 0.85rem", border: "none", borderRadius: 6, background: C.surface, color: C.text, fontSize: "0.84rem", cursor: "pointer", fontWeight: 500 },

  // Contributions
  contributionsList: { display: "flex", flexDirection: "column", gap: "0" },
  contribBubble: { display: "flex", gap: "0.85rem", padding: "1rem 0", borderBottom: `1px solid ${C.border}` },
  contribBody: { flex: 1, minWidth: 0 },
  contribMeta: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" },
  contribAuthor: { fontSize: "0.85rem", fontWeight: 600, color: C.accentLight },
  contribTime: { fontSize: "0.75rem", color: C.textMuted },
  contribDelete: { marginLeft: "auto", background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.78rem", opacity: 0.5, padding: "0.1rem 0.3rem" },
  contribText: { margin: 0, color: C.text, lineHeight: 1.75, fontFamily: C.serif, fontSize: "0.96rem", whiteSpace: "pre-wrap" as const },
  contribEmpty: { padding: "2rem 0", color: C.textMuted, fontSize: "0.88rem", fontStyle: "italic", textAlign: "center" as const },

  // Avatars
  avatar: { width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "#fff", flexShrink: 0 },
  avatarSm: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700, color: "#fff", flexShrink: 0 },
  avatarXs: { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#fff", flexShrink: 0 },

  // Write area
  writeArea: { background: C.surface, border: `1px solid ${C.borderMid}`, borderRadius: 12, padding: "1.1rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  charSelect: { padding: "0.45rem 0.75rem", fontSize: "0.88rem", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 7, color: C.textSub, width: "100%", maxWidth: 280 },
  writeTextarea: { width: "100%", padding: "0.75rem", fontSize: "0.95rem", fontFamily: C.serif, background: "#0a0a15", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, resize: "vertical", boxSizing: "border-box", lineHeight: 1.75 },
  writeActions: { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const },
  writeHint: { fontSize: "0.74rem", color: C.textMuted, margin: 0 },

  // Suggestion
  suggestion: { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "0.65rem 0.85rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" },
  suggestionIcon: { flexShrink: 0 },
  suggestionText: { fontSize: "0.9rem", color: "#fde68a", flex: 1 },
  suggestionClose: { background: "transparent", border: "none", color: "rgba(253,230,138,0.5)", cursor: "pointer", fontSize: "0.85rem", flexShrink: 0 },

  // Settings box
  closedBanner: { background: C.elevated, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.88rem", color: C.textMuted, textAlign: "center" as const },
  draftBanner: { background: "rgba(245,158,11,0.07)", borderColor: "rgba(245,158,11,0.25)", color: "#f59e0b" },
  sceneTagDraft: { color: "#f59e0b", opacity: 0.8 },
  settingsBox: { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  settingsTitle: { fontSize: "0.75rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.1em", margin: 0 },
  settingsRow: { display: "flex", alignItems: "center", gap: "0.75rem" },
  settingsLabel: { fontSize: "0.84rem", color: C.textSub, minWidth: 160, flexShrink: 0 },

  // Characters tab
  charGrid: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  charCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.6rem" },
  charCardTop: { display: "flex", gap: "0.85rem", alignItems: "flex-start" },
  charInfo: { flex: 1, minWidth: 0 },
  charName: { fontSize: "1rem", fontWeight: 600, color: C.text },
  charBadges: { display: "flex", flexWrap: "wrap" as const, gap: "0.35rem", marginTop: "0.3rem" },
  badge: { fontSize: "0.72rem", fontWeight: 600, background: C.accentGlow, color: C.accentLight, border: `1px solid rgba(124,58,237,0.3)`, borderRadius: 4, padding: "0.15rem 0.5rem" },
  badgeGreen: { background: C.successBg, color: C.success, border: `1px solid rgba(16,185,129,0.3)` },
  badgeGold: { background: C.goldBg, color: C.gold, border: `1px solid rgba(251,191,36,0.3)` },
  charDesc: { fontSize: "0.84rem", color: C.textSub, margin: "0.35rem 0 0", lineHeight: 1.5 },
  charActions: { display: "flex", gap: "0.4rem", flexShrink: 0 },
  charScenes: { display: "flex", flexWrap: "wrap" as const, gap: "0.35rem", alignItems: "center", paddingTop: "0.5rem", borderTop: `1px solid ${C.border}` },
  charScenesLabel: { fontSize: "0.74rem", color: C.textMuted },
  charSheet: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem", paddingTop: "0.85rem", borderTop: `1px solid ${C.border}` },
  fieldGroup: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  fieldLabel: { fontSize: "0.74rem", color: C.textMuted, fontWeight: 500 },

  // Buttons
  row: { display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" as const },
  btnAccent: { padding: "0.5rem 1.1rem", fontSize: "0.88rem", cursor: "pointer", background: C.accent, color: "#fff", border: "none", borderRadius: 7, fontWeight: 500, whiteSpace: "nowrap" as const },
  btnGhost: { padding: "0.5rem 0.9rem", fontSize: "0.86rem", cursor: "pointer", background: "transparent", color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 7, whiteSpace: "nowrap" as const },
  btnMicro: { padding: "0.28rem 0.65rem", fontSize: "0.78rem", cursor: "pointer", background: C.elevated, color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 5, whiteSpace: "nowrap" as const },
  btnDanger: { padding: "0.28rem 0.6rem", fontSize: "0.8rem", cursor: "pointer", background: C.dangerBg, color: C.danger, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 5 },

  // Inputs
  inputDark: { padding: "0.5rem 0.75rem", fontSize: "0.88rem", background: "#0a0a15", border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, flex: 1, minWidth: 0 },
  textareaDark: { width: "100%", padding: "0.65rem 0.75rem", fontSize: "0.88rem", background: "#0a0a15", border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, fontFamily: C.sans },
  selectDark: { padding: "0.4rem 0.65rem", fontSize: "0.86rem", background: "#0a0a15", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSub },
};
