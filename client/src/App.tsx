import { useEffect, useRef, useState } from "react";
import { api, tokenStore } from "./api";
import { socket } from "./socket";
import type {
  Story,
  Chapter,
  Scene,
  Contribution,
  Character,
  CharacterFull,
  CharacterInput,
  SceneStatus,
  AuthUser,
  UserProfileInput,
  Participant,
  ParticipantRole,
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

type ContribOwner = { character?: CharacterFull | null; user?: { id: string; email: string; displayName?: string | null; color?: string | null } | null };

function contribAuthor(contrib: ContribOwner): string {
  if (contrib.character) return displayName(contrib.character);
  if (contrib.user?.displayName) return contrib.user.displayName;
  if (contrib.user?.email) return contrib.user.email.split("@")[0];
  return "Anonyme";
}

function contribInitial(contrib: ContribOwner): string {
  return contribAuthor(contrib).charAt(0).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(75,35,5,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolveInk(contrib: ContribOwner): { color: string; bg: string; border: string } {
  if (!contrib.character && contrib.user?.color) {
    const c = contrib.user.color;
    return { color: c, bg: hexToRgba(c, 0.07), border: hexToRgba(c, 0.42) };
  }
  return characterInk(avatarHue(contribAuthor(contrib)));
}

function sceneGradient(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 40 + 18;
  return `linear-gradient(135deg, hsl(${hue},65%,22%) 0%, hsl(${(hue + 25) % 360},55%,36%) 100%)`;
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
  if (status === "DRAFT") return { background: "rgba(122,76,8,0.10)", color: "#7a4c08", border: "1px solid rgba(122,76,8,0.3)" };
  if (status === "DONE")  return { background: "rgba(75,35,5,0.07)",  color: "rgba(75,35,5,0.45)", border: "1px solid rgba(75,35,5,0.18)" };
  return { background: "rgba(25,72,32,0.10)", color: "#194820", border: "1px solid rgba(45,115,55,0.32)" };
}

function sceneItemStyle(status: string): React.CSSProperties {
  if (status === "ACTIVE") return { boxShadow: "inset 3px 0 0 rgba(25,72,32,0.65),  0 1px 6px rgba(75,35,5,0.1)" };
  if (status === "DRAFT")  return { boxShadow: "inset 3px 0 0 rgba(122,76,8,0.6),   0 1px 6px rgba(75,35,5,0.1)" };
  return                           { boxShadow: "inset 3px 0 0 rgba(75,35,5,0.38),   0 1px 6px rgba(75,35,5,0.1)" };
}

function characterInk(hue: number): { color: string; bg: string; border: string } {
  const palette = [
    { color: "#3c1e6a", bg: "rgba(60,30,106,0.07)",  border: "rgba(95,65,155,0.42)"  },
    { color: "#194820", bg: "rgba(25,72,32,0.07)",   border: "rgba(45,115,55,0.42)"  },
    { color: "#662205", bg: "rgba(102,34,5,0.07)",   border: "rgba(155,75,18,0.44)"  },
    { color: "#1a3a5c", bg: "rgba(26,58,92,0.07)",   border: "rgba(45,100,155,0.42)" },
    { color: "#4a2800", bg: "rgba(74,40,0,0.07)",    border: "rgba(130,80,20,0.44)"  },
    { color: "#5a1e40", bg: "rgba(90,30,64,0.07)",   border: "rgba(140,65,100,0.42)" },
  ];
  return palette[Math.floor(hue / 60) % 6];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  // Navigation
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [activeTab, setActiveTab] = useState<"chapters" | "characters" | "participants">("chapters");
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
  const [settingsEdit, setSettingsEdit] = useState<{ visibilityMode: string; visibleCount: number; status: SceneStatus }>({ visibilityMode: "last", visibleCount: 3, status: "ACTIVE" });
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

  // Auth
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<"login" | "register" | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Profil
  const [showProfile, setShowProfile] = useState(false);
  const [profileEdits, setProfileEdits] = useState<UserProfileInput>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Responsive
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myRole, setMyRole] = useState<ParticipantRole | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // ── Responsive listener
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Socket : connexion liée à l'authentification
  useEffect(() => {
    if (!currentUser) return;
    socket.connect();
    return () => { socket.disconnect(); };
  }, [currentUser]);

  // ── Socket : rejoindre/quitter la room de la scène ouverte
  useEffect(() => {
    if (!selectedScene) return;

    socket.emit("scene:join", { sceneId: selectedScene.id });

    const onContribNew = (contrib: Contribution) => {
      setSelectedScene((s) => {
        if (!s || s.id !== contrib.sceneId) return s;
        // dédup : ignore si déjà présent (auteur local)
        if ((s.contributions ?? []).some((c) => c.id === contrib.id)) return s;
        return {
          ...s,
          contributions: [...(s.contributions ?? []), contrib],
          _count: { contributions: (s._count?.contributions ?? 0) + 1 },
        };
      });
      // Synchronise le compteur dans la liste des scènes du chapitre
      setChapters((p) =>
        p.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === contrib.sceneId
              ? { ...sc, _count: { contributions: sc._count.contributions + 1 } }
              : sc
          ),
        }))
      );
    };

    socket.on("contribution:new", onContribNew);

    return () => {
      socket.emit("scene:leave", { sceneId: selectedScene.id });
      socket.off("contribution:new", onContribNew);
    };
  }, [selectedScene?.id]);

  // ── Restore session
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) { setAuthLoading(false); return; }
    api.auth.me()
      .then(setCurrentUser)
      .catch(() => { tokenStore.clear(); setCurrentUser(null); })
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Load stories (uniquement si connecté)
  useEffect(() => {
    if (!currentUser) { setStories([]); return; }
    api.stories.list().then(setStories).catch(() => setError("Impossible de charger les histoires."));
  }, [currentUser]);

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
    setParticipants([]);
    setMyRole(null);
    const [chapterData, charData, participantData] = await Promise.all([
      api.chapters.list(story.id),
      api.characters.list(story.id),
      api.participants.list(story.id),
    ]);
    setChapters(chapterData);
    setCharacters(charData);
    setParticipants(participantData);
    if (currentUser) {
      const mine = participantData.find((p) => p.userId === currentUser.id);
      setMyRole(mine?.role ?? null);
    }
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
    if (!storyTitle.trim() || !currentUser) return;
    try {
      const story = await api.stories.create({
        title: storyTitle.trim(),
        description: storyDesc.trim() || undefined,
      });
      setStories((p) => [story, ...p]);
      setStoryTitle(""); setStoryDesc("");
      setShowStoryForm(false);
      handleSelectStory(story);
    } catch (err: unknown) {
      handleAuthError(err);
    }
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

  // ── Auth
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const { token, user } = await api.auth.login(authEmail, authPassword);
      tokenStore.set(token);
      setCurrentUser(user);
      setAuthView(null);
      setAuthEmail(""); setAuthPassword("");
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const { token, user } = await api.auth.register(authEmail, authPassword);
      tokenStore.set(token);
      setCurrentUser(user);
      setAuthView(null);
      setAuthEmail(""); setAuthPassword("");
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    tokenStore.clear();
    setCurrentUser(null);
    setAuthView(null);
    setShowProfile(false);
    setSelectedStory(null);
    setSelectedChapter(null);
    setSelectedScene(null);
  };

  const handleAuthError = (err: unknown) => {
    if ((err as Error).message.includes("401")) {
      tokenStore.clear();
      setCurrentUser(null);
      setSelectedStory(null);
      setSelectedChapter(null);
      setSelectedScene(null);
    }
    throw err;
  };

  const handleOpenProfile = () => {
    setProfileEdits({
      displayName: currentUser?.displayName ?? "",
      color: currentUser?.color ?? "",
      bio: currentUser?.bio ?? "",
    });
    setProfileError(null);
    setShowProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      const updated = await api.users.updateProfile({
        displayName: profileEdits.displayName || null,
        color: profileEdits.color || null,
        bio: profileEdits.bio || null,
      });
      setCurrentUser(updated);
      setShowProfile(false);
    } catch (err: unknown) {
      setProfileError((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Participants
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStory || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const participant = await api.participants.add(selectedStory.id, inviteEmail.trim(), inviteRole);
      setParticipants((p) => [...p, participant]);
      setInviteEmail("");
    } catch (err: unknown) {
      setInviteError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (userId: string, role: "EDITOR" | "VIEWER") => {
    if (!selectedStory) return;
    const updated = await api.participants.updateRole(selectedStory.id, userId, role);
    setParticipants((p) => p.map((x) => (x.userId === userId ? updated : x)));
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!selectedStory) return;
    await api.participants.remove(selectedStory.id, userId);
    setParticipants((p) => p.filter((x) => x.userId !== userId));
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
      <div style={s.sealTL} aria-hidden="true">✦</div>
      <div style={s.sealBR} aria-hidden="true">✦</div>

      {/* ══ Header */}
      <header style={s.header}>
        <div style={s.headerInner} className="app-header-inner">
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
          <div style={s.headerRight} className="app-header-right">
            {!authLoading && (
              currentUser ? (
                <div style={s.userChip}>
                  {currentUser.color && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser.color, flexShrink: 0 }} />
                  )}
                  <span style={s.userEmail} className="app-user-name">{currentUser.displayName || currentUser.email}</span>
                  <button style={s.btnMicro} onClick={handleOpenProfile}>Profil</button>
                  <button style={s.btnGhost} onClick={handleLogout}>{isMobile ? "✕" : "Déconnexion"}</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button style={s.btnGhost} onClick={() => setAuthView(authView === "login" ? null : "login")}>Connexion</button>
                  <button style={s.btnAccent} onClick={() => setAuthView(authView === "register" ? null : "register")}>S'inscrire</button>
                </div>
              )
            )}
            {currentUser && (
              <button style={s.btnAccent} onClick={() => {
                const next = !showStoryForm;
                setShowStoryForm(next);
                if (next && isMobile) setSidebarOpen(true);
              }}>
                {showStoryForm ? "Annuler" : "+ Histoire"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══ Auth panel */}
      {authView !== null && (
        <>
          <div style={s.authOverlay} onClick={() => setAuthView(null)} />
          <div style={s.authPanel} className="app-auth-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={s.authTitle}>{authView === "login" ? "Connexion" : "Créer un compte"}</p>
              <button style={s.authClose} onClick={() => setAuthView(null)}>✕</button>
            </div>
            <form onSubmit={authView === "login" ? handleLogin : handleRegister} style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              <input
                style={s.inputDark}
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                autoFocus
              />
              <input
                style={s.inputDark}
                type="password"
                placeholder="Mot de passe (8 caractères min.)"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                minLength={8}
              />
              {authError && <p style={s.authErrorMsg}>{authError}</p>}
              <button style={s.btnAccent} type="submit" disabled={authSubmitting}>
                {authSubmitting ? "…" : authView === "login" ? "Se connecter" : "Créer le compte"}
              </button>
            </form>
            <p style={s.authSwitch}>
              {authView === "login" ? (
                <>Pas encore de compte ?{" "}
                  <span style={s.authSwitchLink} onClick={() => { setAuthView("register"); setAuthError(null); }}>S'inscrire</span>
                </>
              ) : (
                <>Déjà un compte ?{" "}
                  <span style={s.authSwitchLink} onClick={() => { setAuthView("login"); setAuthError(null); }}>Se connecter</span>
                </>
              )}
            </p>
          </div>
        </>
      )}

      {/* ══ Profile panel */}
      {showProfile && currentUser && (
        <>
          <div style={s.authOverlay} onClick={() => setShowProfile(false)} />
          <div style={s.authPanel} className="app-auth-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={s.authTitle}>Mon profil</p>
              <button style={s.authClose} onClick={() => setShowProfile(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={s.profileField}>
                <label style={s.profileLabel}>Nom d'affichage</label>
                <input
                  style={s.inputDark}
                  placeholder={currentUser.email.split("@")[0]}
                  value={profileEdits.displayName ?? ""}
                  onChange={(e) => setProfileEdits((p) => ({ ...p, displayName: e.target.value }))}
                  maxLength={40}
                />
              </div>
              <div style={s.profileField}>
                <label style={s.profileLabel}>Couleur d'encre</label>
                <div style={s.colorPalette}>
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProfileEdits((p) => ({ ...p, color: p.color === c ? null : c }))}
                      style={{
                        width: 26, height: 26, borderRadius: "50%", background: c, border: "none",
                        cursor: "pointer", flexShrink: 0,
                        boxShadow: profileEdits.color === c
                          ? `0 0 0 2px rgba(255,240,185,0.6), 0 0 0 4px ${c}`
                          : "0 1px 4px rgba(0,0,0,0.2)",
                      }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
              <div style={s.profileField}>
                <label style={s.profileLabel}>Bio</label>
                <textarea
                  style={{ ...s.textareaDark, fontFamily: C.serif, fontStyle: "italic", lineHeight: 1.7 }}
                  placeholder="Quelques mots sur toi…"
                  value={profileEdits.bio ?? ""}
                  onChange={(e) => setProfileEdits((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  maxLength={200}
                />
              </div>
              {profileError && <p style={s.authErrorMsg}>{profileError}</p>}
              <button style={s.btnAccent} type="submit" disabled={savingProfile}>
                {savingProfile ? "Sauvegarde…" : "Enregistrer →"}
              </button>
            </form>
            <p style={{ ...s.authSwitch, textAlign: "left" as const, color: C.textMuted }}>
              {currentUser.email}
            </p>
          </div>
        </>
      )}

      {error && <div style={s.errorBanner}>{error}<button style={s.errorClose} onClick={() => setError(null)}>✕</button></div>}

      <div style={s.layout} className="app-layout">

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
                <li key={story.id} style={{ ...s.storyItem, ...(active ? s.storyItemActive : {}) }} className={`story-item${active ? " is-active" : ""}`} onClick={() => handleSelectStory(story)}>
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
        <main style={s.main} className="app-main">

          {/* ── Aucune histoire sélectionnée */}
          {!selectedStory && (
            <div style={s.emptyState}>
              <div style={s.emptyOrn} className="empty-orn">✦</div>
              <p style={s.emptyTitle}>StoryForge</p>
              <p style={s.emptyText}>
                Chaque grande histoire commence<br />par une ligne.<br /><br />
                Ouvre le menu pour choisir une histoire,<br />ou crée-en une nouvelle.
              </p>
            </div>
          )}

          {/* ── Histoire sélectionnée, pas de chapitre */}
          {selectedStory && !selectedChapter && !selectedScene && (
            <div>
              <div style={s.pageHeader}>
                <h1 style={s.pageTitle} className="app-page-title">{selectedStory.title}</h1>
                {selectedStory.description && <p style={s.pageDesc}>{selectedStory.description}</p>}
              </div>

              {/* Tabs */}
              <div style={s.tabs} className="app-tabs">
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "chapters" ? s.tabActive : {}) }} onClick={() => setActiveTab("chapters")}>
                  Chapitres ({chapters.length})
                </button>
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "characters" ? s.tabActive : {}) }} onClick={() => setActiveTab("characters")}>
                  Personnages ({characters.length})
                </button>
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "participants" ? s.tabActive : {}) }} onClick={() => setActiveTab("participants")}>
                  Participants ({participants.length})
                </button>
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
                      <div key={ch.id} style={s.chapterCard} className="chapter-card" onClick={() => handleSelectChapter(ch)}>
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
                      const ink = characterInk(hue);
                      const isExpanded = expandedCharId === char.id;
                      return (
                        <div key={char.id} style={s.charCard}>
                          <div style={s.charCardTop}>
                            <div style={{ ...s.avatar, background: ink.color, border: `2px solid ${ink.border}`, boxShadow: `0 0 0 2px rgba(255,235,170,0.3), 0 2px 8px rgba(0,0,0,0.15)` }}>
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
                            <div style={s.charSheet} className="app-char-sheet">
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

              {/* ── Tab Participants */}
              {activeTab === "participants" && (
                <div>
                  {myRole === "OWNER" && (
                    <form onSubmit={handleInvite} style={s.inlineForm}>
                      <p style={s.formTitle}>Inviter un participant</p>
                      <div style={s.row}>
                        <input
                          style={{ ...s.inputDark, flex: 1 }}
                          type="email"
                          placeholder="Email de l'utilisateur"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          required
                        />
                        <select
                          style={{ ...s.inputDark, width: "auto" }}
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value as "EDITOR" | "VIEWER")}
                        >
                          <option value="EDITOR">Éditeur</option>
                          <option value="VIEWER">Lecteur</option>
                        </select>
                        <button style={s.btnAccent} type="submit" disabled={inviting}>
                          {inviting ? "…" : "Inviter →"}
                        </button>
                      </div>
                      {inviteError && <p style={s.authErrorMsg}>{inviteError}</p>}
                    </form>
                  )}

                  {participants.length === 0 && <p style={s.mutedCenter}>Aucun participant chargé.</p>}

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                    {participants.map((pt) => {
                      const ink = pt.user.color
                        ? { color: pt.user.color, bg: hexToRgba(pt.user.color, 0.07), border: hexToRgba(pt.user.color, 0.35) }
                        : characterInk(avatarHue(pt.user.displayName || pt.user.email));
                      const name = pt.user.displayName || pt.user.email.split("@")[0];
                      const isMe = currentUser?.id === pt.userId;
                      return (
                        <div key={pt.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem", background: ink.bg, border: `1px solid ${ink.border}`, borderRadius: 6 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: ink.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: C.serif, fontSize: "0.92rem", color: C.text, fontWeight: 600 }}>{name}</div>
                            <div style={{ fontSize: "0.76rem", color: C.textMuted }}>{pt.user.email}</div>
                          </div>
                          {myRole === "OWNER" && pt.role !== "OWNER" ? (
                            <select
                              style={{ ...s.inputDark, width: "auto", padding: "0.2rem 0.4rem", fontSize: "0.78rem" }}
                              value={pt.role}
                              onChange={(e) => handleChangeRole(pt.userId, e.target.value as "EDITOR" | "VIEWER")}
                            >
                              <option value="EDITOR">Éditeur</option>
                              <option value="VIEWER">Lecteur</option>
                            </select>
                          ) : (
                            <span style={{ ...s.badge, ...(pt.role === "OWNER" ? s.badgeGold : pt.role === "EDITOR" ? s.badgeGreen : {}) }}>
                              {pt.role === "OWNER" ? "Propriétaire" : pt.role === "EDITOR" ? "Éditeur" : "Lecteur"}
                            </span>
                          )}
                          {myRole === "OWNER" && pt.role !== "OWNER" && (
                            <button style={s.btnDanger} onClick={() => handleRemoveParticipant(pt.userId)}>✕</button>
                          )}
                          {isMe && pt.role !== "OWNER" && myRole !== "OWNER" && (
                            <button style={s.btnGhost} onClick={() => handleRemoveParticipant(pt.userId)}>Quitter</button>
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
                  <div key={sc.id} style={{ ...s.sceneListItem, ...sceneItemStyle(sc.status) }} className="scene-item" onClick={() => handleSelectScene(sc.id)}>
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
                <div style={s.sceneChapterLabel}>
                  Chapitre {selectedChapter.order} — {selectedChapter.title}
                </div>
                <div style={s.sceneViewTitleRow}>
                  <h2 style={s.sceneViewTitle} className="app-scene-title">{selectedScene.title}</h2>
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
                      const ink = characterInk(hue);
                      return (
                        <div key={c.id} style={s.sceneCharChip}>
                          <div style={{ ...s.avatarXs, background: ink.color }}>{initial(c)}</div>
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
                    const ink = resolveInk(contrib);
                    return (
                      <div key={contrib.id} style={{ ...s.contribBubble, borderLeft: `3px solid ${ink.border}`, background: ink.bg }} className="contrib-bubble app-contrib-bubble">
                        <div style={{ ...s.avatarSm, background: ink.color, border: `2px solid ${ink.border}`, boxShadow: "0 0 0 2px rgba(255,235,170,0.3), 0 2px 8px rgba(0,0,0,0.15)" }}>
                          {contribInitial(contrib)}
                        </div>
                        <div style={s.contribBody}>
                          <div style={s.contribMeta}>
                            <span style={{ ...s.contribAuthor, color: ink.color }}>{contribAuthor(contrib)}</span>
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

              {/* ── Ornement séparateur */}
              {!spectatorView && selectedScene.status === "ACTIVE" && (selectedScene.contributions ?? []).length > 0 && (
                <div style={s.sceneDivider}>
                  <div style={s.sceneDividerLine} />
                  <span style={s.sceneDividerOrn}>✦</span>
                  <div style={s.sceneDividerLine} />
                </div>
              )}

              {/* ── Zone d'écriture (auteur, scène ACTIVE seulement) */}
              {!spectatorView && selectedScene.status === "ACTIVE" && (
                <div style={s.writeArea} className="write-area app-write-area">
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
                        <label style={s.settingsLabel} className="app-settings-label">Statut</label>
                        <select style={s.selectDark} value={settingsEdit.status} onChange={(e) =>
  setSettingsEdit((p) => ({
    ...p,
    status: e.target.value as SceneStatus,
  }))
}>
                          <option value="DRAFT">Brouillon</option>
                          <option value="ACTIVE">Active</option>
                          <option value="DONE">Terminée</option>
                        </select>
                      </div>
                      <div style={s.settingsRow}>
                        <label style={s.settingsLabel} className="app-settings-label">Visible aux spectateurs</label>
                        <select style={s.selectDark} value={settingsEdit.visibilityMode} onChange={(e) => setSettingsEdit((p) => ({ ...p, visibilityMode: e.target.value as any }))}>
                          <option value="last">Dernières contributions</option>
                          <option value="all">Toutes les contributions</option>
                          <option value="none">Rien (masqué)</option>
                        </select>
                      </div>
                      {settingsEdit.visibilityMode === "last" && (
                        <div style={s.settingsRow}>
                          <label style={s.settingsLabel} className="app-settings-label">Nombre visible</label>
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

// ─── Palette couleurs profil ──────────────────────────────────────────────────
const PROFILE_COLORS = [
  "#3c1e6a", "#194820", "#662205", "#1a3a5c",
  "#4a2800", "#5a1e40", "#1e4a3a", "#2e1a00",
];

// ─── Design system ────────────────────────────────────────────────────────────

const C = {
  bg: "transparent",
  surface: "rgba(252,244,215,0.90)",
  elevated: "rgba(248,238,200,0.93)",
  overlay: "rgba(244,232,188,0.96)",
  border: "rgba(75,35,5,0.18)",
  borderMid: "rgba(75,35,5,0.28)",
  borderStrong: "rgba(75,35,5,0.45)",
  accent: "#3c1e6a",
  accentLight: "#6b4b9e",
  accentGlow: "rgba(60,30,106,0.10)",
  success: "#194820",
  successBg: "rgba(25,72,32,0.10)",
  successBorder: "rgba(45,115,55,0.34)",
  warning: "#7a4c08",
  warningBg: "rgba(122,76,8,0.10)",
  warningBorder: "rgba(160,100,20,0.34)",
  danger: "#8b1a0a",
  dangerBg: "rgba(139,26,10,0.10)",
  dangerBorder: "rgba(180,60,20,0.34)",
  text: "#180b01",
  textSub: "#2a1003",
  textMuted: "rgba(75,35,5,0.58)",
  sans: "'Jost', system-ui, sans-serif",
  serif: "'EB Garamond', Georgia, serif",
  display: "'Cinzel Decorative', 'Cinzel', serif",
  ui: "'Cinzel', 'Jost', serif",
};

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", color: C.text, fontFamily: C.sans, fontSize: 15 },

  // Cachets de cire
  sealTL: { position: "fixed" as const, top: "4.5rem", left: "0.7rem", width: 42, height: 42, borderRadius: "50%", background: "radial-gradient(circle at 36% 36%, #c85a30 0%, #8b2010 48%, #4d0d05 100%)", boxShadow: "0 3px 12px rgba(0,0,0,0.35), 0 0 0 2px rgba(140,50,15,0.32), 0 0 0 4px rgba(140,50,15,0.1)", color: "rgba(255,215,175,0.5)", fontSize: "0.85rem", lineHeight: "42px", textAlign: "center" as const, pointerEvents: "none", zIndex: 98, userSelect: "none" as const },
  sealBR: { position: "fixed" as const, bottom: "5rem", right: "0.5rem", width: 44, height: 44, borderRadius: "50%", background: "radial-gradient(circle at 36% 36%, #c85a30 0%, #8b2010 48%, #4d0d05 100%)", boxShadow: "0 3px 12px rgba(0,0,0,0.35), 0 0 0 2px rgba(140,50,15,0.32), 0 0 0 4px rgba(140,50,15,0.1)", color: "rgba(255,215,175,0.5)", fontSize: "0.85rem", lineHeight: "44px", textAlign: "center" as const, pointerEvents: "none", zIndex: 98, userSelect: "none" as const },

  // Header
  header: { position: "sticky" as const, top: 0, zIndex: 20, background: "rgba(175,132,42,0.92)", backdropFilter: "blur(14px)", borderBottom: "2px solid rgba(75,35,5,0.28)" },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 62 },
  headerLeft: { display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 0, flex: 1 },
  menuBtn: { background: "transparent", border: "none", color: C.textSub, fontSize: "1.1rem", cursor: "pointer", padding: "0.3rem 0.4rem", flexShrink: 0, lineHeight: 1 },
  breadcrumb: { display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, overflow: "hidden" },
  logoMark: { fontSize: "0.82rem", fontWeight: 700, color: C.text, cursor: "pointer", letterSpacing: "0.1em", flexShrink: 0, fontFamily: C.display },
  crumbSep: { color: C.textMuted, fontSize: "0.8rem" },
  crumbItem: { fontSize: "0.78rem", color: C.textSub, cursor: "pointer", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, fontFamily: C.ui },
  crumbCurrent: { fontSize: "0.78rem", color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180, fontFamily: C.ui },
  errorBanner: { background: C.dangerBg, color: C.danger, padding: "0.65rem 1.5rem", fontSize: "0.88rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.dangerBorder}` },
  errorClose: { background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: "1rem" },

  // Layout
  layout: { display: "flex", maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem 5rem", gap: 0, minHeight: "calc(100vh - 62px)" },

  // Sidebar
  sidebar: { width: 230, flexShrink: 0, paddingRight: "1.5rem", paddingTop: "1.75rem", borderRight: "1px solid rgba(75,35,5,0.2)" },
  sidebarOpen: { position: "fixed" as const, top: 62, left: 0, bottom: 0, zIndex: 30, width: 250, padding: "1.25rem", borderRight: "1px solid rgba(75,35,5,0.3)", overflowY: "auto" as const },
  sidebarOverlay: { position: "fixed" as const, inset: 0, zIndex: 29, background: "rgba(60,25,5,0.55)" },
  sidebarHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" },
  sidebarLabel: { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" as const, color: C.textMuted, margin: 0, fontFamily: C.ui },
  sidebarClose: { background: "transparent", border: "none", color: C.textMuted, fontSize: "1rem", cursor: "pointer" },
  storyForm: { display: "flex", flexDirection: "column" as const, gap: "0.5rem", marginBottom: "1rem", padding: "0.9rem", background: "rgba(248,238,200,0.90)", borderRadius: 3, border: `1px solid ${C.borderMid}`, boxShadow: "0 2px 10px rgba(75,35,5,0.1)" },
  storyList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: 2 },
  storyItem: { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.65rem 0.7rem", borderRadius: 3, cursor: "pointer", border: "1px solid transparent" },
  storyItemActive: { background: "rgba(75,35,5,0.12)", borderColor: "rgba(75,35,5,0.32)" },
  storyItemDot: { fontSize: "0.55rem", color: C.textSub, marginTop: 5, flexShrink: 0 },
  storyItemTitle: { fontSize: "0.87rem", fontWeight: 500, color: C.text, lineHeight: 1.4, fontFamily: C.serif },
  storyItemDesc: { fontSize: "0.74rem", color: C.textMuted, marginTop: 2, lineHeight: 1.35 },
  mutedSmall: { fontSize: "0.82rem", color: C.textMuted, padding: "0.5rem 0" },

  // Main
  main: { flex: 1, paddingLeft: "2.25rem", paddingRight: "1.5rem", paddingTop: "1.75rem", paddingBottom: "3rem", minWidth: 0, background: "rgba(252,248,228,0.55)", borderRadius: "0 3px 3px 0" },

  // Empty state
  emptyState: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", minHeight: "65vh", gap: "1.25rem", textAlign: "center" as const },
  emptyOrn: { fontSize: "2.8rem", color: C.text, fontFamily: C.display, lineHeight: 1 },
  emptyTitle: { fontSize: "1.6rem", fontWeight: 700, color: C.text, margin: 0, fontFamily: C.display, letterSpacing: "0.05em" },
  emptyText: { fontSize: "0.9rem", color: C.textSub, margin: 0, maxWidth: 280, lineHeight: 1.85, fontFamily: C.serif, fontStyle: "italic" },

  // Page header
  pageHeader: { marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid rgba(75,35,5,0.2)" },
  pageTitle: { fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.45rem", letterSpacing: "0.04em", color: C.text, fontFamily: C.display },
  pageDesc: { fontSize: "0.95rem", color: C.textSub, margin: 0, lineHeight: 1.75, fontStyle: "italic", fontFamily: C.serif },
  backBtn: { display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "transparent", border: "none", color: C.textMuted, fontSize: "0.7rem", cursor: "pointer", padding: "0 0 0.9rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, fontFamily: C.ui },

  // Tabs
  tabs: { display: "flex", gap: "0.25rem", marginBottom: "1.75rem" },
  tab: { padding: "0.42rem 1.1rem", border: "1px solid rgba(75,35,5,0.28)", borderRadius: 3, cursor: "pointer", background: "transparent", color: C.textMuted, fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase" as const, fontFamily: C.ui },
  tabActive: { background: "rgba(75,35,5,0.14)", borderColor: "rgba(75,35,5,0.45)", color: C.text, fontWeight: 600, fontFamily: C.ui },

  // Forms
  addBtn: { width: "100%", padding: "0.7rem", border: "1px dashed rgba(75,35,5,0.3)", borderRadius: 3, background: "transparent", color: C.textMuted, fontSize: "0.68rem", cursor: "pointer", marginBottom: "1.25rem", letterSpacing: "0.1em", textTransform: "uppercase" as const, fontFamily: C.ui },
  inlineForm: { background: "rgba(248,238,200,0.90)", border: "1px solid rgba(75,35,5,0.18)", borderRadius: 4, padding: "1.4rem", marginBottom: "1.75rem", display: "flex", flexDirection: "column" as const, gap: "0.85rem", boxShadow: "0 3px 16px rgba(75,35,5,0.12), inset 0 1px 0 rgba(255,255,240,0.75)" },
  formTitle: { fontSize: "0.62rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.18em", margin: 0, fontFamily: C.ui },
  mutedCenter: { color: C.textMuted, fontSize: "0.9rem", textAlign: "center" as const, padding: "2.5rem 0", fontStyle: "italic", fontFamily: C.serif },
  hint: { fontSize: "0.76rem", color: C.textMuted, margin: 0 },

  // Chapter cards
  chapterList: { display: "flex", flexDirection: "column" as const, gap: "0.85rem" },
  chapterCard: { background: "rgba(252,244,215,0.92)", border: "1px solid rgba(75,35,5,0.18)", borderRadius: 4, padding: "1.2rem 1.4rem 1.2rem 1.55rem", cursor: "pointer", boxShadow: "inset 3px 0 0 rgba(60,30,106,0.38), 0 3px 14px rgba(75,35,5,0.14), 0 1px 3px rgba(75,35,5,0.07), inset 0 1px 0 rgba(255,255,240,0.8)" },
  chapterCardHeader: { display: "flex", alignItems: "flex-start", gap: "0.9rem" },
  chapterOrder: { width: 32, height: 32, borderRadius: "50%", background: "rgba(75,35,5,0.14)", border: "2px solid rgba(75,35,5,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: C.text, flexShrink: 0, marginTop: 1, fontFamily: C.ui, letterSpacing: "0.05em", boxShadow: "0 0 0 2px rgba(255,240,185,0.3)" },
  chapterCardBody: { flex: 1, minWidth: 0 },
  chapterTitle: { fontSize: "1rem", fontWeight: 600, color: C.text, lineHeight: 1.35, fontFamily: C.serif },
  chapterDesc: { fontSize: "0.85rem", color: C.textSub, marginTop: "0.28rem", lineHeight: 1.65, fontStyle: "italic", fontFamily: C.serif },
  chapterMeta: { display: "flex", gap: "0.45rem", alignItems: "center", marginTop: "0.45rem", fontSize: "0.7rem", color: C.textMuted, fontFamily: C.ui, letterSpacing: "0.04em" },
  metaDot: { opacity: 0.4 },
  chapterArrow: { color: C.textMuted, fontSize: "1rem", flexShrink: 0, marginTop: 5, opacity: 0.5 },
  chapterSceneTags: { display: "flex", gap: "0.35rem", flexWrap: "wrap" as const, marginTop: "0.85rem", paddingTop: "0.85rem", borderTop: "1px solid rgba(75,35,5,0.15)" },
  sceneTag: { fontSize: "0.68rem", background: "rgba(75,35,5,0.07)", color: C.textSub, border: "1px solid rgba(75,35,5,0.18)", borderRadius: 2, padding: "0.18rem 0.55rem", fontFamily: C.ui, letterSpacing: "0.04em" },
  sceneTagClosed: { color: C.textMuted, opacity: 0.5 },
  sceneTagDraft: { color: "#7a4c08", borderColor: "rgba(122,76,8,0.3)" },
  sceneTagMore: { fontSize: "0.68rem", color: C.textMuted, padding: "0.18rem 0.4rem" },

  // Scene list
  sceneList: { display: "flex", flexDirection: "column" as const, gap: "0.55rem" },
  sceneListItem: { display: "flex", alignItems: "center", gap: "0.95rem", background: "rgba(252,244,215,0.90)", border: "1px solid rgba(75,35,5,0.16)", borderRadius: 3, padding: "0.95rem 1.15rem", cursor: "pointer", boxShadow: "0 2px 8px rgba(75,35,5,0.1), 0 1px 2px rgba(75,35,5,0.06)" },
  sceneListOrder: { width: 28, height: 28, borderRadius: "50%", background: "rgba(75,35,5,0.1)", border: "1px solid rgba(75,35,5,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, color: C.textSub, flexShrink: 0, fontFamily: C.ui, boxShadow: "0 0 0 2px rgba(255,240,185,0.2)" },
  sceneListBody: { flex: 1, minWidth: 0 },
  sceneListTitle: { display: "flex", alignItems: "center", gap: "0.55rem", fontSize: "0.96rem", fontWeight: 600, color: C.text, fontFamily: C.serif },
  sceneListMeta: { display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.7rem", color: C.textMuted, marginTop: "0.28rem", fontFamily: C.ui },
  sceneListChars: { color: C.textSub },
  statusBadge: { fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, padding: "0.14rem 0.5rem", borderRadius: 2, flexShrink: 0, fontFamily: C.ui },
  statusBadgeActive: { background: "rgba(25,72,32,0.12)", color: "#194820", border: "1px solid rgba(45,115,55,0.34)" },
  statusBadgeClosed: { background: "rgba(75,35,5,0.08)", color: C.textMuted, border: "1px solid rgba(75,35,5,0.2)" },

  // Scene view
  sceneView: { display: "flex", flexDirection: "column" as const, gap: "1.5rem" },
  sceneViewHeader: { display: "flex", flexDirection: "column" as const, gap: "0.55rem", paddingBottom: "1.25rem", borderBottom: "1px solid rgba(75,35,5,0.2)" },
  sceneChapterLabel: { fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: C.textMuted, fontFamily: C.ui },
  sceneViewTitleRow: { display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" as const },
  sceneViewTitle: { fontSize: "1.75rem", fontWeight: 700, margin: 0, letterSpacing: "0.04em", color: C.text, fontFamily: C.display },
  sceneViewDesc: { fontSize: "0.98rem", color: C.textSub, margin: 0, fontStyle: "italic", lineHeight: 1.8, fontFamily: C.serif },
  sceneChars: { display: "flex", flexWrap: "wrap" as const, gap: "0.5rem", alignItems: "center", paddingTop: "0.25rem" },
  sceneCharChip: { display: "flex", alignItems: "center", gap: "0.35rem", background: "rgba(75,35,5,0.08)", border: "1px solid rgba(75,35,5,0.2)", borderRadius: 20, padding: "0.22rem 0.72rem 0.22rem 0.35rem", fontSize: "0.8rem", color: C.textSub },
  addPersonnageBtn: { background: "transparent", border: "1px dashed rgba(75,35,5,0.3)", borderRadius: 20, color: C.textMuted, fontSize: "0.8rem", cursor: "pointer", padding: "0.3rem 0.9rem", alignSelf: "flex-start" as const },

  // Character select
  charSelectBox: { background: "rgba(248,238,200,0.92)", border: "1px solid rgba(75,35,5,0.22)", borderRadius: 4, padding: "1.15rem", display: "flex", flexDirection: "column" as const, gap: "0.8rem", boxShadow: "0 2px 10px rgba(75,35,5,0.1)" },
  charSelectTitle: { fontSize: "0.62rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.16em", margin: 0, fontFamily: C.ui },
  charCheckList: { display: "flex", flexWrap: "wrap" as const, gap: "0.4rem" },
  charCheckItem: { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.72rem", border: "1px solid rgba(75,35,5,0.22)", borderRadius: 20, fontSize: "0.84rem", cursor: "pointer", color: C.textSub, userSelect: "none" as const },
  charCheckItemOn: { background: "rgba(60,30,106,0.1)", borderColor: "rgba(60,30,106,0.4)", color: C.accent },
  checkbox: { width: 13, height: 13, accentColor: C.accent, cursor: "pointer" },
  charCheckRole: { fontSize: "0.71rem", color: C.textMuted },

  // Image banner
  imageBanner: { position: "relative" as const, borderRadius: 4, height: 240, overflow: "hidden", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "flex-end", padding: "2rem", boxShadow: "0 4px 20px rgba(75,35,5,0.3)" },
  imageBannerGrid: { position: "absolute" as const, inset: 0, backgroundImage: "linear-gradient(rgba(75,35,5,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(75,35,5,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" },
  imageBannerTitle: { position: "relative" as const, fontSize: "1.5rem", fontWeight: 700, color: "rgba(255,240,190,0.95)", textShadow: "0 2px 24px rgba(0,0,0,0.9)", textAlign: "center" as const, fontFamily: C.display },
  imageBannerChars: { position: "relative" as const, fontSize: "0.77rem", color: "rgba(255,230,160,0.6)", marginTop: "0.45rem", letterSpacing: "0.08em", fontFamily: C.ui },
  sceneImg: { width: "100%", borderRadius: 4, display: "block" },

  // View toggle
  viewToggleBar: { display: "flex", background: "rgba(75,35,5,0.08)", borderRadius: 4, padding: "0.25rem", gap: "0.2rem", width: "fit-content", border: "1px solid rgba(75,35,5,0.2)" },
  viewToggleBtn: { padding: "0.35rem 0.95rem", border: "none", borderRadius: 3, background: "transparent", color: C.textMuted, fontSize: "0.68rem", cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase" as const, fontFamily: C.ui },
  viewToggleBtnActive: { padding: "0.35rem 0.95rem", border: "none", borderRadius: 3, background: "rgba(75,35,5,0.14)", color: C.text, fontSize: "0.68rem", cursor: "pointer", fontWeight: 600, fontFamily: C.ui, letterSpacing: "0.1em", textTransform: "uppercase" as const },

  // Contributions — CSS gère papier ligné + guillemet via .contrib-bubble
  contributionsList: { display: "flex", flexDirection: "column" as const, background: "rgba(252,248,228,0.82)", borderRadius: 4, border: "1px solid rgba(75,35,5,0.12)", boxShadow: "0 2px 12px rgba(75,35,5,0.08), inset 0 1px 0 rgba(255,255,240,0.8)" },
  contribBubble: { display: "flex", gap: "1rem", padding: "1.4rem 1rem 1.4rem 1.15rem", borderBottom: "1px solid rgba(75,35,5,0.1)" },
  contribBody: { flex: 1, minWidth: 0 },
  contribMeta: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" },
  contribAuthor: { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", fontFamily: C.ui, textTransform: "uppercase" as const },
  contribTime: { fontSize: "0.68rem", color: C.textMuted, fontFamily: C.ui },
  contribDelete: { marginLeft: "auto", background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.75rem", opacity: 0.35, padding: "0.1rem 0.3rem" },
  contribText: { margin: 0, color: C.text, lineHeight: 2.05, fontFamily: C.serif, fontStyle: "italic", fontSize: "1.02rem", whiteSpace: "pre-wrap" as const },
  contribEmpty: { padding: "3rem 0", color: C.textMuted, fontSize: "0.92rem", fontStyle: "italic", textAlign: "center" as const, fontFamily: C.serif },

  // Divider
  sceneDivider: { display: "flex", alignItems: "center", gap: "1rem", padding: "0.1rem 0" },
  sceneDividerLine: { flex: 1, height: 1, background: "rgba(75,35,5,0.15)" },
  sceneDividerOrn: { fontSize: "0.55rem", color: C.textMuted, flexShrink: 0, opacity: 0.5, fontFamily: C.display },

  // Avatars — style médaillon
  avatar: { width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 700, color: "rgba(255,240,190,0.9)", flexShrink: 0, boxShadow: "0 0 0 2px rgba(255,235,170,0.4), 0 2px 8px rgba(0,0,0,0.15)" },
  avatarSm: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.88rem", fontWeight: 700, color: "rgba(255,240,190,0.9)", flexShrink: 0 },
  avatarXs: { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700, color: "rgba(255,240,190,0.9)", flexShrink: 0 },

  // Write area — espace de plume
  writeArea: { background: "rgba(255,253,240,0.97)", border: "1px solid rgba(75,35,5,0.20)", borderRadius: 4, padding: "1.6rem 1.4rem", display: "flex", flexDirection: "column" as const, gap: "0.95rem", boxShadow: "0 6px 28px rgba(75,35,5,0.16), 0 2px 6px rgba(75,35,5,0.08), inset 0 1px 0 rgba(255,255,255,0.9)" },
  charSelect: { padding: "0.45rem 0.8rem", fontSize: "0.8rem", background: "rgba(252,245,215,0.88)", border: "1px solid rgba(75,35,5,0.20)", borderRadius: 3, color: C.text, width: "100%", maxWidth: 280, fontFamily: C.ui },
  writeTextarea: { width: "100%", padding: "1rem 1.1rem", fontSize: "1.05rem", fontFamily: C.serif, fontStyle: "italic", background: "rgba(255,255,250,0.99)", border: "1px solid rgba(75,35,5,0.15)", borderRadius: 3, color: "#180b01", resize: "vertical" as const, boxSizing: "border-box" as const, lineHeight: 2.05, boxShadow: "inset 0 1px 4px rgba(75,35,5,0.05)" },
  writeActions: { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const },
  writeHint: { fontSize: "0.66rem", color: C.textMuted, margin: 0, letterSpacing: "0.06em", fontFamily: C.ui },

  // Suggestion
  suggestion: { background: "rgba(122,76,8,0.09)", border: "1px solid rgba(122,76,8,0.28)", borderRadius: 3, padding: "0.8rem 0.95rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" },
  suggestionIcon: { flexShrink: 0 },
  suggestionText: { fontSize: "0.95rem", color: C.textSub, flex: 1, fontFamily: C.serif, lineHeight: 1.7, fontStyle: "italic" },
  suggestionClose: { background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.85rem", flexShrink: 0 },

  // Status banners
  closedBanner: { background: "rgba(75,35,5,0.08)", border: "1px solid rgba(75,35,5,0.2)", borderRadius: 3, padding: "0.85rem 1.1rem", fontSize: "0.88rem", color: C.textSub, textAlign: "center" as const, fontFamily: C.serif, fontStyle: "italic" },
  draftBanner: { background: "rgba(122,76,8,0.08)", borderColor: "rgba(122,76,8,0.28)", color: "#7a4c08" },
  settingsBox: { background: "rgba(248,238,200,0.92)", border: "1px solid rgba(75,35,5,0.2)", borderRadius: 4, padding: "1.15rem", display: "flex", flexDirection: "column" as const, gap: "0.85rem", boxShadow: "0 2px 10px rgba(75,35,5,0.1)" },
  settingsTitle: { fontSize: "0.62rem", fontWeight: 700, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.18em", margin: 0, fontFamily: C.ui },
  settingsRow: { display: "flex", alignItems: "center", gap: "0.75rem" },
  settingsLabel: { fontSize: "0.84rem", color: C.textSub, minWidth: 160, flexShrink: 0 },

  // Characters
  charGrid: { display: "flex", flexDirection: "column" as const, gap: "0.85rem" },
  charCard: { background: "rgba(252,244,215,0.92)", border: "1px solid rgba(75,35,5,0.16)", borderRadius: 4, padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column" as const, gap: "0.65rem", boxShadow: "0 3px 12px rgba(75,35,5,0.12), 0 1px 3px rgba(75,35,5,0.06), inset 0 1px 0 rgba(255,255,240,0.8)" },
  charCardTop: { display: "flex", gap: "0.9rem", alignItems: "flex-start" },
  charInfo: { flex: 1, minWidth: 0 },
  charName: { fontSize: "1.02rem", fontWeight: 600, color: C.text, fontFamily: C.serif },
  charBadges: { display: "flex", flexWrap: "wrap" as const, gap: "0.35rem", marginTop: "0.3rem" },
  badge: { fontSize: "0.64rem", fontWeight: 600, background: "rgba(60,30,106,0.1)", color: "#3c1e6a", border: "1px solid rgba(60,30,106,0.3)", borderRadius: 2, padding: "0.15rem 0.5rem", fontFamily: C.ui, letterSpacing: "0.05em" },
  badgeGreen: { background: "rgba(25,72,32,0.1)", color: "#194820", border: "1px solid rgba(45,115,55,0.3)" },
  badgeGold: { background: "rgba(122,76,8,0.1)", color: "#7a4c08", border: "1px solid rgba(160,100,20,0.3)" },
  charDesc: { fontSize: "0.84rem", color: C.textSub, margin: "0.35rem 0 0", lineHeight: 1.6, fontStyle: "italic", fontFamily: C.serif },
  charActions: { display: "flex", gap: "0.4rem", flexShrink: 0 },
  charScenes: { display: "flex", flexWrap: "wrap" as const, gap: "0.35rem", alignItems: "center", paddingTop: "0.55rem", borderTop: "1px solid rgba(75,35,5,0.15)" },
  charScenesLabel: { fontSize: "0.68rem", color: C.textMuted, fontFamily: C.ui },
  charSheet: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", paddingTop: "0.9rem", borderTop: "1px solid rgba(75,35,5,0.15)" },
  fieldGroup: { display: "flex", flexDirection: "column" as const, gap: "0.28rem" },
  fieldLabel: { fontSize: "0.66rem", color: C.textMuted, fontWeight: 500, fontFamily: C.ui, letterSpacing: "0.07em", textTransform: "uppercase" as const },

  // Buttons — style gravure
  row: { display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" as const },
  btnAccent: { padding: "0.48rem 1.15rem", fontSize: "0.68rem", cursor: "pointer", background: "rgba(60,30,106,0.12)", color: "#3c1e6a", border: "1px solid rgba(60,30,106,0.4)", borderRadius: 3, fontFamily: C.ui, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const },
  btnGhost: { padding: "0.48rem 1rem", fontSize: "0.68rem", cursor: "pointer", background: "transparent", color: C.textSub, border: "1px solid rgba(75,35,5,0.3)", borderRadius: 3, fontFamily: C.ui, letterSpacing: "0.1em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const },
  btnMicro: { padding: "0.28rem 0.65rem", fontSize: "0.62rem", cursor: "pointer", background: "rgba(75,35,5,0.08)", color: C.textSub, border: "1px solid rgba(75,35,5,0.2)", borderRadius: 2, fontFamily: C.ui, letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const },
  btnDanger: { padding: "0.28rem 0.6rem", fontSize: "0.62rem", cursor: "pointer", background: "rgba(139,26,10,0.1)", color: "#8b1a0a", border: "1px solid rgba(180,60,20,0.35)", borderRadius: 2, fontFamily: C.ui },

  // Inputs
  inputDark: { padding: "0.52rem 0.82rem", fontSize: "0.88rem", background: "rgba(252,245,215,0.88)", border: "1px solid rgba(75,35,5,0.20)", borderRadius: 3, color: C.text, flex: 1, minWidth: 0 },
  textareaDark: { width: "100%", padding: "0.7rem 0.82rem", fontSize: "0.88rem", background: "rgba(252,245,215,0.88)", border: "1px solid rgba(75,35,5,0.20)", borderRadius: 3, color: C.text, resize: "vertical" as const, boxSizing: "border-box" as const, lineHeight: 1.7, fontFamily: C.sans },
  selectDark: { padding: "0.42rem 0.68rem", fontSize: "0.85rem", background: "rgba(252,245,215,0.88)", border: "1px solid rgba(75,35,5,0.20)", borderRadius: 3, color: C.textSub },

  // Auth
  headerRight: { display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 },
  userChip: { display: "flex", alignItems: "center", gap: "0.55rem" },
  userEmail: { fontSize: "0.7rem", color: C.textSub, fontFamily: C.ui, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  authOverlay: { position: "fixed" as const, inset: 0, zIndex: 39 },
  authPanel: { position: "fixed" as const, top: 70, right: "1.5rem", zIndex: 40, width: 320, background: "rgba(252,244,215,0.99)", border: "1px solid rgba(75,35,5,0.25)", borderRadius: 6, padding: "1.6rem", boxShadow: "0 8px 32px rgba(75,35,5,0.22), 0 2px 8px rgba(75,35,5,0.12)", display: "flex", flexDirection: "column" as const, gap: "1rem" },
  authTitle: { fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: C.textMuted, margin: 0, fontFamily: C.ui },
  authClose: { background: "transparent", border: "none", color: C.textMuted, fontSize: "0.9rem", cursor: "pointer", padding: "0.1rem 0.3rem" },
  authErrorMsg: { fontSize: "0.78rem", color: C.danger, margin: 0, fontFamily: C.serif, fontStyle: "italic" as const },
  authSwitch: { fontSize: "0.74rem", color: C.textMuted, textAlign: "center" as const, margin: 0, fontFamily: C.ui },
  authSwitchLink: { color: C.accent, cursor: "pointer", textDecoration: "underline" },

  // Profil
  profileField: { display: "flex", flexDirection: "column" as const, gap: "0.3rem" },
  profileLabel: { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.textMuted, fontFamily: C.ui },
  colorPalette: { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const, padding: "0.2rem 0" },
};
