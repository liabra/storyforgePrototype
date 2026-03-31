import { useEffect, useRef, useState } from "react";
import { api, tokenStore } from "./api";
import { socket } from "./socket";
import BattleApp from "./BattleApp";
import type {
  Story,
  PublicStory,
  Chapter,         // Phase A : conservé — chapter.routes toujours actif
  Scene,
  Contribution,
  Character,
  CharacterRef,
  CharacterFull,
  CharacterInput,
  ContentStatus,
  SceneStatus,
  SceneMode,
  StoryVisibility,
  AuthUser,
  UserProfileInput,
  Participant,
  ParticipantRole,
  ActivityItem,
  JoinRequest,
} from "./api";
import type { PresenceUser } from "./presence";
import { scenePresenceLabel } from "./presence";
import { PresenceAvatar } from "./PresenceAvatar";
import { ToastContainer } from "./Toast";
import type { ToastItem } from "./Toast";
import type { AppNotification } from "./api";
import SceneReader from "./SceneReader";
import WorldMap from "./WorldMap";
import { ReportModal } from "./ReportModal";
import AdminPage from "./AdminPage";

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
  if (contrib.user?.email) return contrib.user.email?.split("@")[0] ?? "Anonyme";
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

function ensureAppStyles() {
  if (typeof document === "undefined" || document.getElementById("app-anim")) return;
  const el = document.createElement("style");
  el.id = "app-anim";
  el.textContent = `
    @keyframes sf-flicker {
      0%, 100% { transform: scaleX(1) scaleY(1); opacity: 1; }
      50% { transform: scaleX(0.85) scaleY(0.93); opacity: 0.8; }
    }
  `;
  document.head.appendChild(el);
}

function FlameIndicator({ contribCount }: { contribCount: number }) {
  const MAX_CONTRIBS = 35;
  const progress = Math.min(contribCount / MAX_CONTRIBS, 1);
  const intensity = 1 - progress;

  const h1 = Math.round(30 * intensity);
  const h2 = Math.round(45 * intensity);
  const baseOpacity = 0.3 + intensity * 0.65;

  const flames = [
    { height: Math.round(10 + intensity * 22), delay: "0s" },
    { height: Math.round(14 + intensity * 30), delay: "0.35s" },
    { height: Math.round(11 + intensity * 24), delay: "0.7s" },
  ];

  return (
    <div
      title={`Histoire : ${Math.round(progress * 100)}% accomplie`}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: 48,
        paddingBottom: 2,
        flexShrink: 0,
        opacity: baseOpacity,
        transition: "opacity 1.5s ease",
      }}
    >
      {flames.map((f, i) => (
        <div
          key={i}
          style={{
            width: 9,
            height: f.height,
            borderRadius: "50% 50% 30% 30%",
            background: `linear-gradient(to top, hsl(${h1},90%,45%), hsl(${h2},95%,68%))`,
            animation: `sf-flicker 1.8s ease-in-out ${f.delay} infinite`,
            transition: "height 2s ease, opacity 2s ease",
          }}
        />
      ))}
    </div>
  );
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

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

type TypingUser = { userId: string; username: string };

function typingLabel(users: TypingUser[]): string {
  if (users.length === 0) return "";
  if (users.length === 1) return `${users[0].username} est en train d'écrire…`;
  if (users.length === 2) return `${users[0].username} et ${users[1].username} écrivent…`;
  return `${users.length} personnes écrivent…`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  ensureAppStyles();

  // Navigation
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  // Phase A : selectedChapter conservé en state mais n'est plus utilisé pour la navigation principale
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [activeTab, setActiveTab] = useState<"scenes" | "characters" | "participants">("scenes");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigation principale
  const [appView, setAppView] = useState<"stories" | "battle" | "admin">("stories");

  // Stories
  const [stories, setStories] = useState<Story[]>([]);
  const [archivedStories, setArchivedStories] = useState<Story[]>([]);
  const [showArchivedStories, setShowArchivedStories] = useState(false);
  const [showStoryForm, setShowStoryForm] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyDesc, setStoryDesc] = useState("");

  // Phase A : scenes plate au niveau story (remplace l'ancienne structure chapters[].scenes)
  const [scenes, setScenes] = useState<Scene[]>([]);

  // Scenes
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [newScene, setNewScene] = useState({ title: "", description: "" });
  const [creatingScene, setCreatingScene] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [spectatorView, setSpectatorView] = useState(false);
  const [isReading, setIsReading] = useState(false);

  const [showWorldMap, setShowWorldMap] = useState(false);

  // Scene settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsEdit, setSettingsEdit] = useState<{ visibilityMode: string; visibleCount: number; status: SceneStatus; mode: "FREE" | "TURN" }>({ visibilityMode: "last", visibleCount: 3, status: "ACTIVE", mode: "FREE" });
  const [savingSettings, setSavingSettings] = useState(false);

  // Scene characters
  const [sceneCharEdits, setSceneCharEdits] = useState<string[]>([]);
  const [savingChars, setSavingChars] = useState(false);
  const [showCharSelect, setShowCharSelect] = useState(false);

  // Contributions
  const [contribContent, setContribContent] = useState("");
  const [contribCharId, setContribCharId] = useState<string>("");
  const [roleDowngradeAlert, setRoleDowngradeAlert] = useState(false);
  const [roleDowngradeDraft, setRoleDowngradeDraft] = useState<string | null>(null);
  const contribContentRef = useRef("");
  const myRoleRef = useRef<ParticipantRole | null>(null);
  const [submittingContrib, setSubmittingContrib] = useState(false);
  const [editingContribId, setEditingContribId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [reportTarget, setReportTarget] = useState<{ targetType: "CONTRIBUTION" | "BATTLE_MOVE" | "STORY"; targetId: string } | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestingIdea, setSuggestingIdea] = useState(false);
  const [gmSuggestion, setGmSuggestion] = useState<string | null>(null);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newChar, setNewChar] = useState<CharacterInput>({ name: "", nickname: "" });
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [charEdits, setCharEdits] = useState<Record<string, CharacterInput>>({});
  const [savingChar, setSavingChar] = useState<string | null>(null);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [error, setError] = useState<string | null>(null);
  const contribEndRef = useRef<HTMLDivElement>(null);
  const navRestoredRef = useRef(false);
  const selectedStoryIdRef = useRef<string | null>(null);
  const selectedSceneIdRef = useRef<string | null>(null);

  // Auth
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<"login" | "register" | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPseudonym, setAuthPseudonym] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Profil
  const [showProfile, setShowProfile] = useState(false);
  const [profileEdits, setProfileEdits] = useState<UserProfileInput>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Responsive
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // Stories loaded flag (pour la restauration de nav)
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  // Présence en ligne
  const [onlineCount, setOnlineCount] = useState(0);
  const [allScenePresence, setAllScenePresence] = useState<Record<string, PresenceUser[]>>({});

  // Homepage vivante
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [storyLastActivity, setStoryLastActivity] = useState<Record<string, number>>({});

  // Histoires publiques (discovery)
  const [publicStories, setPublicStories] = useState<PublicStory[]>([]);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  // Notifications internes
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myRole, setMyRole] = useState<ParticipantRole | null>(null);
  // true une fois que le rôle a été résolu (évite le flash de bannières "visiteur" pendant le chargement)
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Demandes de participation
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myJoinRequest, setMyJoinRequest] = useState<JoinRequest | null>(null);
  const [requestingJoin, setRequestingJoin] = useState(false);

  // ── Responsive listener
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Sync refs pour la reconnexion socket
  useEffect(() => {
    selectedStoryIdRef.current = selectedStory?.id ?? null;
  }, [selectedStory?.id]);

  useEffect(() => {
    selectedSceneIdRef.current = selectedScene?.id ?? null;
    setIsReading(false);
  }, [selectedScene?.id]);

  useEffect(() => { contribContentRef.current = contribContent; }, [contribContent]);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

  // ── Restauration de brouillon après changement de scène ou de rôle
  // S'exécute après que selectedScene ET myRole sont tous deux committés dans le DOM,
  // ce qui garantit que le rôle est à jour même après refresh (où setMyRole est asynchrone).
  useEffect(() => {
    if (!selectedScene || !currentUser || myRole !== "VIEWER") return;
    const draftKey = `sf_draft_${currentUser.id}_${selectedScene.id}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (!savedDraft) return;
    setContribContent(savedDraft);
    setRoleDowngradeDraft(savedDraft);
    setRoleDowngradeAlert(true);
  }, [selectedScene?.id, myRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket : connexion liée à l'authentification
  useEffect(() => {
    if (!currentUser) return;

    const username = currentUser.displayName ?? currentUser.email?.split("@")[0] ?? currentUser.pseudonym ?? "Joueur";

    // Ré-identifie et ré-rejoint story/scène après chaque (re)connexion
    const onConnect = () => {
      socket.emit("presence:identify", {
        userId: currentUser.id,
        username,
        color: currentUser.color,
      });
      if (selectedStoryIdRef.current) {
        socket.emit("story:join", { storyId: selectedStoryIdRef.current });
      }
      if (selectedSceneIdRef.current) {
        socket.emit("scene:join", { sceneId: selectedSceneIdRef.current });
        socket.emit("presence:scene:join", { sceneId: selectedSceneIdRef.current, storyId: selectedStoryIdRef.current });
      }
    };

    const onPresenceUpdate = ({ count }: { count: number }) => {
      setOnlineCount(count);
    };

    const onActivityNew = (item: ActivityItem) => {
      setActivityFeed((prev) => [item, ...prev].slice(0, 10));
      setStoryLastActivity((prev) => {
        const t = new Date(item.at).getTime();
        if ((prev[item.storyId] ?? 0) < t) return { ...prev, [item.storyId]: t };
        return prev;
      });

      // Ne pas afficher de toast pour ses propres actions
      if (item.userId && item.userId === currentUser?.id) return;
      // Ne pas afficher de toast si l'utilisateur est déjà dans la scène concernée
      if (item.type === "contribution" && selectedSceneIdRef.current === item.sceneId) return;

      const message = item.type === "contribution"
        ? `${item.username} a écrit dans ${item.sceneTitle}`
        : `Nouvelle scène : ${item.sceneTitle}`;

      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: item.type, message }].slice(-5);
      });
    };

    const onInvitationReceived = ({ storyTitle, role }: { storyId: string; storyTitle: string; role: string }) => {
      const roleLabel = role === "EDITOR" ? "éditeur" : "lecteur";
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "contribution" as const, message: `Tu as été invité(e) à collaborer à "${storyTitle}" en tant que ${roleLabel}` }].slice(-5);
      });
      // Rafraîchir la liste des histoires pour afficher la nouvelle
      api.stories.list().then(setStories).catch(() => {});
    };

    const onJoinRequestReceived = ({ storyId: reqStoryId, storyTitle, userDisplayName }: { requestId: string; storyId: string; storyTitle: string; userId: string; userDisplayName: string }) => {
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "scene" as const, message: `${userDisplayName} demande à participer à "${storyTitle}"` }].slice(-5);
      });
      // Si on est actuellement sur cette histoire, rafraîchir la liste des demandes
      if (selectedStoryIdRef.current === reqStoryId) {
        api.joinRequests.list(reqStoryId).then(setJoinRequests).catch(() => {});
      }
    };

    const onJoinRequestResponse = ({ storyTitle, accepted }: { requestId: string; storyId: string; storyTitle: string; accepted: boolean }) => {
      const message = accepted
        ? `Ta demande a été acceptée ! Tu es maintenant éditeur de "${storyTitle}"`
        : `Ta demande de participation à "${storyTitle}" a été refusée`;
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "contribution" as const, message }].slice(-5);
      });
      if (!accepted) {
        setMyJoinRequest((prev) => prev ? { ...prev, status: "DECLINED" } : prev);
      }
    };

    // Mise à jour de rôle d'un participant — émis dans la room story ET la room personnelle.
    // Géré ici (main effect, deps [currentUser]) pour garantir que currentUser est toujours frais,
    // contrairement au story-room effect qui capture currentUser à la sélection de l'histoire.
    const onParticipantUpdateGlobal = ({
      userId,
      storyId: eventStoryId,
      role,
    }: { userId: string; storyId: string; role: ParticipantRole }) => {
      // N'appliquer que si c'est pour l'histoire actuellement ouverte
      if (eventStoryId !== selectedStoryIdRef.current) return;

      // Mise à jour de la liste des participants (visible dans l'onglet Participants)
      setParticipants((prev) => prev.map((p) => p.userId === userId ? { ...p, role } : p));

      // Mise à jour du rôle personnel si c'est notre propre userId
      if (userId === currentUser.id) {
        const prevRole = myRoleRef.current;
        setMyRole(role);
        setMyJoinRequest((prev) => prev ? { ...prev, status: "ACCEPTED" } : prev);

        if (role === "VIEWER" && prevRole !== "VIEWER") {
          // Downgrade EDITOR → VIEWER : sauvegarder le brouillon en cours
          const sceneId = selectedSceneIdRef.current;
          const draft = contribContentRef.current.trim();
          if (sceneId && draft) {
            localStorage.setItem(`sf_draft_${currentUser.id}_${sceneId}`, draft);
            setRoleDowngradeDraft(draft);
          } else {
            setRoleDowngradeDraft(null);
          }
          setRoleDowngradeAlert(true);
        } else if (role !== "VIEWER" && prevRole === "VIEWER") {
          // Upgrade VIEWER → EDITOR : restaurer le brouillon si la zone est vide
          setRoleDowngradeAlert(false);
          const sceneId = selectedSceneIdRef.current;
          if (sceneId) {
            const saved = localStorage.getItem(`sf_draft_${currentUser.id}_${sceneId}`);
            if (saved && !contribContentRef.current.trim()) {
              setContribContent(saved);
              setRoleDowngradeDraft(saved);
            }
          }
        }
      }
    };

    const onBattleInvited = ({ invite, battle }: { invite: { role: string }; battle: { title: string } }) => {
      const roleLabel = invite.role === "PLAYER" ? "joueur" : "spectateur";
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "scene" as const, message: `Invitation battle : "${battle.title}" — rôle ${roleLabel}` }].slice(-5);
      });
    };

    const onNotificationNew = (notif: AppNotification) => {
      setNotifications((prev) => [notif, ...prev]);
      if (notif.type === "USER_BANNED") {
        setCurrentUser((u) => u ? { ...u, isBanned: true } : u);
      } else if (notif.type === "USER_UNBANNED") {
        setCurrentUser((u) => u ? { ...u, isBanned: false } : u);
      }
    };

    socket.on("connect", onConnect);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("activity:new", onActivityNew);
    socket.on("invitation:received", onInvitationReceived);
    socket.on("join-request:received", onJoinRequestReceived);
    socket.on("join-request:response", onJoinRequestResponse);
    socket.on("participant:update", onParticipantUpdateGlobal);
    socket.on("battle:invited", onBattleInvited);
    socket.on("notification:new", onNotificationNew);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("activity:new", onActivityNew);
      socket.off("invitation:received", onInvitationReceived);
      socket.off("join-request:received", onJoinRequestReceived);
      socket.off("join-request:response", onJoinRequestResponse);
      socket.off("participant:update", onParticipantUpdateGlobal);
      socket.off("battle:invited", onBattleInvited);
      socket.off("notification:new", onNotificationNew);
      socket.disconnect();
    };
  }, [currentUser]);

  // ── Socket : rejoindre/quitter la room de la scène ouverte
  useEffect(() => {
    if (!selectedScene) return;

    socket.emit("scene:join", { sceneId: selectedScene.id });
    socket.emit("presence:scene:join", { sceneId: selectedScene.id, storyId: selectedStory?.id });

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
      // Phase A : sync du compteur dans la liste plate de scènes
      setScenes((p) => p.map((sc) =>
        sc.id === contrib.sceneId
          ? { ...sc, _count: { contributions: (sc._count?.contributions ?? 0) + 1 } }
          : sc
      ));
    };

    const onTypingStart = ({ userId, username }: { userId: string; username: string }) => {
      if (userId === currentUser?.id) return;
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, username }]
      );
      // Auto-expiration si typing:stop non reçu (ex : déconnexion)
      clearTimeout(typingTimersRef.current[userId]);
      typingTimersRef.current[userId] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
        delete typingTimersRef.current[userId];
      }, 5000);
    };

    const onTypingStop = ({ userId }: { userId: string }) => {
      clearTimeout(typingTimersRef.current[userId]);
      delete typingTimersRef.current[userId];
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    const onContribDelete = ({ id }: { id: string }) => {
      setSelectedScene((s) =>
        s ? { ...s, contributions: (s.contributions ?? []).filter((c) => c.id !== id) } : s
      );
    };

    const onContribUpdate = (updated: import("./api").Contribution) => {
      setSelectedScene((s) => {
        if (!s) return s;
        return {
          ...s,
          contributions: (s.contributions ?? []).map((c) => (c.id === updated.id ? updated : c)),
        };
      });
    };

    const onGmIntervention = ({ text }: { text: string }) => {
      setGmSuggestion(text);
    };

    socket.on("contribution:new", onContribNew);
    socket.on("contribution:delete", onContribDelete);
    socket.on("contribution:update", onContribUpdate);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("gm_intervention", onGmIntervention);

    return () => {
      socket.emit("presence:scene:leave", { sceneId: selectedScene.id });
      socket.emit("scene:leave", { sceneId: selectedScene.id });
      socket.off("contribution:new", onContribNew);
      socket.off("contribution:delete", onContribDelete);
      socket.off("contribution:update", onContribUpdate);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("gm_intervention", onGmIntervention);
      // Nettoyer les timers d'auto-expiration
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
      setTypingUsers([]);
      // Arrêter notre propre indicateur si on quitte la scène en cours de frappe
      if (isTypingRef.current) {
        socket.emit("typing:stop", { sceneId: selectedScene.id, userId: currentUser?.id });
        isTypingRef.current = false;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [selectedScene?.id]);

  // ── Socket : room story — structure narrative + présence multi-scènes
  useEffect(() => {
    if (!selectedStory) return;

    socket.emit("story:join", { storyId: selectedStory.id });

    // Phase A : chapter:new supprimé, plus de chapitres dans le state
    const onSceneNew = ({ scene }: { storyId: string; scene: Scene }) => {
      // Dédup : la réponse HTTP peut être arrivée avant le socket
      setScenes((prev) => prev.some((s) => s.id === scene.id) ? prev : [...prev, scene]);
    };

    const onScenePresenceUpdate = ({ sceneId, users }: { sceneId: string; users: PresenceUser[] }) => {
      setAllScenePresence((prev) => ({ ...prev, [sceneId]: users }));
    };

    const onStoryPresenceSnapshot = ({ snapshot }: { storyId: string; snapshot: Record<string, PresenceUser[]> }) => {
      setAllScenePresence(snapshot);
    };

    const onCharacterNew = (char: Character) => {
      setCharacters((prev) => prev.some((c) => c.id === char.id) ? prev : [...prev, char]);
    };

    const onCharacterUpdate = (char: Character) => {
      setCharacters((prev) => prev.map((c) => c.id === char.id ? char : c));
    };

    const onCharacterDelete = ({ id }: { id: string }) => {
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setExpandedCharId((prev) => prev === id ? null : prev);
    };

    const onSceneCharactersUpdate = ({ sceneId, characters }: { sceneId: string; characters: CharacterRef[] }) => {
      setSelectedScene((s) => s?.id === sceneId ? { ...s, characters } : s);
      // Phase A : mise à jour dans la liste plate
      setScenes((prev) => prev.map((sc) => sc.id === sceneId ? { ...sc, characters } : sc));
    };

    const onTurnUpdate = ({ sceneId, mode, currentTurnUserId }: { sceneId: string; mode: SceneMode; currentTurnUserId: string | null }) => {
      setSelectedScene((s) => s?.id === sceneId ? { ...s, mode, currentTurnUserId } : s);
      setSettingsEdit((p) => ({ ...p, mode }));
    };

    const onSceneDelete = ({ sceneId }: { sceneId: string; storyId: string }) => {
      // Phase A : suppression dans la liste plate
      setScenes((p) => p.filter((sc) => sc.id !== sceneId));
      setSelectedScene((s) => s?.id === sceneId ? null : s);
    };

    // Phase A : onChapterDelete supprimé

    const onSceneStatusUpdate = ({ sceneId, status, sceneTitle, triggeredBy }: { sceneId: string; storyId: string; status: SceneStatus; sceneTitle?: string; triggeredBy?: string }) => {
      setSelectedScene((s) => s?.id === sceneId ? { ...s, status } : s);
      // Phase A : mise à jour dans la liste plate
      setScenes((p) => p.map((sc) => sc.id === sceneId ? { ...sc, status } : sc));
      setSettingsEdit((p) => ({ ...p, status }));
      if (status === "DONE" && triggeredBy !== currentUser?.id) {
        setToasts((prev) => {
          const id = ++toastIdRef.current;
          const label = sceneTitle ? `'${sceneTitle}'` : "cette scène";
          return [...prev, { id, type: "scene" as const, message: `🏁 La scène ${label} est terminée` }].slice(-5);
        });
      }
    };

    // Phase A : onChapterStatusUpdate supprimé

    const onStoryStatusUpdate = ({ storyId, status, storyTitle, triggeredBy }: { storyId: string; status: ContentStatus; storyTitle?: string; triggeredBy?: string }) => {
      setSelectedStory((s) => s?.id === storyId ? { ...s, status } : s);
      setStories((p) => p.map((s) => s.id === storyId ? { ...s, status } : s));
      if (status === "DONE" && triggeredBy !== currentUser?.id) {
        setToasts((prev) => {
          const id = ++toastIdRef.current;
          const label = storyTitle ? `'${storyTitle}'` : "cette histoire";
          return [...prev, { id, type: "scene" as const, message: `📖 L'histoire ${label} est terminée` }].slice(-5);
        });
      }
    };

    const onStoryVisibilityUpdate = ({ storyId, visibility }: { storyId: string; visibility: StoryVisibility }) => {
      setSelectedStory((s) => s?.id === storyId ? { ...s, visibility } : s);
      setStories((p) => p.map((s) => s.id === storyId ? { ...s, visibility } : s));
      if (visibility === "PRIVATE") setPublicStories((p) => p.filter((s) => s.id !== storyId));
    };

    // Phase A : chapter:new, chapter:delete, chapter:statusUpdate supprimés
    socket.on("scene:new", onSceneNew);
    socket.on("scene:presence:update", onScenePresenceUpdate);
    socket.on("story:presence:snapshot", onStoryPresenceSnapshot);
    socket.on("character:new", onCharacterNew);
    socket.on("character:update", onCharacterUpdate);
    socket.on("character:delete", onCharacterDelete);
    socket.on("scene:characters:update", onSceneCharactersUpdate);
    socket.on("turn:update", onTurnUpdate);
    socket.on("scene:delete", onSceneDelete);
    socket.on("scene:statusUpdate", onSceneStatusUpdate);
    socket.on("story:statusUpdate", onStoryStatusUpdate);
    socket.on("story:visibilityUpdate", onStoryVisibilityUpdate);

    return () => {
      socket.emit("story:leave", { storyId: selectedStory.id });
      socket.off("scene:new", onSceneNew);
      socket.off("scene:presence:update", onScenePresenceUpdate);
      socket.off("story:presence:snapshot", onStoryPresenceSnapshot);
      socket.off("character:new", onCharacterNew);
      socket.off("character:update", onCharacterUpdate);
      socket.off("character:delete", onCharacterDelete);
      socket.off("scene:characters:update", onSceneCharactersUpdate);
      socket.off("turn:update", onTurnUpdate);
      socket.off("scene:delete", onSceneDelete);
      socket.off("scene:statusUpdate", onSceneStatusUpdate);
      socket.off("story:statusUpdate", onStoryStatusUpdate);
      socket.off("story:visibilityUpdate", onStoryVisibilityUpdate);
      setAllScenePresence({});
    };
  }, [selectedStory?.id]);

  // ── Restore session
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) { setAuthLoading(false); return; }
    api.users.getProfile()
      .then(setCurrentUser)
      .catch(() => { tokenStore.clear(); setCurrentUser(null); })
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Load notifications (uniquement si connecté)
  useEffect(() => {
    if (!currentUser) { setNotifications([]); return; }
    api.notifications.mine().then(setNotifications).catch(() => {});
  }, [currentUser]);

  // ── Load stories (uniquement si connecté)
  useEffect(() => {
    if (!currentUser) { setStories([]); setArchivedStories([]); setStoriesLoaded(false); return; }
    api.stories.list()
      .then((data) => { setStories(data); setStoriesLoaded(true); })
      .catch(() => setError("Impossible de charger les histoires."));
    api.stories.listArchived().then(setArchivedStories).catch(() => {});
  }, [currentUser]);

  // ── Load public stories (toujours, connecté ou non)
  useEffect(() => {
    api.stories.listPublic().then(setPublicStories).catch(() => {});
  }, []);

  // ── Load activity feed (seed initial)
  useEffect(() => {
    if (!currentUser) { setActivityFeed([]); setStoryLastActivity({}); return; }
    api.activity.recent().then((items) => {
      setActivityFeed(items);
      const activity: Record<string, number> = {};
      for (const item of items) {
        const t = new Date(item.at).getTime();
        if (!activity[item.storyId] || t > activity[item.storyId]) activity[item.storyId] = t;
      }
      setStoryLastActivity(activity);
    }).catch(() => {});
  }, [currentUser?.id]);

  // ── Sauvegarde navigation courante
  // Ne s'exécute qu'après que la restauration a été tentée pour ne pas effacer
  // sf_nav au mount avant de l'avoir lu.
  useEffect(() => {
    if (!navRestoredRef.current) return;
    if (!selectedStory) { localStorage.removeItem("sf_nav"); return; }
    // Phase A : chapterId supprimé du payload
    localStorage.setItem("sf_nav", JSON.stringify({
      storyId: selectedStory.id,
      sceneId: selectedScene?.id ?? null,
    }));
  }, [selectedStory?.id, selectedScene?.id]);

  // ── Restauration navigation après refresh
  useEffect(() => {
    if (!currentUser || !storiesLoaded || navRestoredRef.current) return;
    navRestoredRef.current = true;
    const raw = localStorage.getItem("sf_nav");
    if (!raw) return;
    try {
      // Phase A : chapterId supprimé, scènes chargées directement
      const { storyId, sceneId } = JSON.parse(raw) as {
        storyId?: string; sceneId?: string;
      };
      if (!storyId) return;
      const story = stories.find((s) => s.id === storyId);
      if (!story) return;
      Promise.all([
        api.scenes.list(story.id),
        api.characters.list(story.id),
        api.participants.list(story.id),
      ]).then(([sceneData, charData, participantData]) => {
        setSelectedStory(story);
        setScenes(sceneData);
        setCharacters(charData);
        setParticipants(participantData);
        const mine = participantData.find((p) => p.userId === currentUser.id);
        const restoredRole = mine?.role ?? null;
        setMyRole(restoredRole);
        setMembershipResolved(true);
        if (restoredRole === "OWNER") {
          api.joinRequests.list(story.id).then(setJoinRequests).catch(() => {});
        } else if (restoredRole === "VIEWER") {
          api.joinRequests.getMine(story.id).then(setMyJoinRequest).catch(() => {});
        }
        setActiveTab("scenes");
        if (!sceneId) return;
        api.scenes.get(sceneId).then((scene) => {
          setSelectedScene(scene);
          setSettingsEdit({
            visibilityMode: scene.visibilityMode,
            visibleCount: scene.visibleCount,
            status: scene.status,
            mode: scene.mode ?? "FREE",
          });
          setSceneCharEdits(scene.characters.map((c) => c.id));
          setSpectatorView(false);
          setShowSettings(false);
          setShowCharSelect(false);
          setSuggestion(null);
          setRoleDowngradeAlert(false);
          setRoleDowngradeDraft(null);
          setContribContent("");
          setContribCharId(charData[0]?.id ?? "");
        }).catch(() => { /* scène supprimée ou inaccessible */ });
      }).catch(() => { /* erreur de restauration */ });
    } catch { /* JSON malformé */ }
  }, [currentUser?.id, storiesLoaded]);

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
    setActiveTab("scenes");
    setSidebarOpen(false);
    setParticipants([]);
    setMyRole(null);
    setMembershipResolved(false);
    setJoinRequests([]);
    setMyJoinRequest(null);
    // Phase A : chargement direct des scènes (plus de chapitres)
    const [sceneData, charData] = await Promise.all([
      api.scenes.list(story.id),
      api.characters.list(story.id),
    ]);
    setScenes(sceneData);
    setCharacters(charData);
    if (currentUser) {
      const participantData = await api.participants.list(story.id);
      setParticipants(participantData);
      const mine = participantData.find((p) => p.userId === currentUser.id);
      const role = mine?.role ?? null;
      setMyRole(role);
      setMembershipResolved(true);
      // Charger les demandes selon le rôle
      if (role === "OWNER") {
        api.joinRequests.list(story.id).then(setJoinRequests).catch(() => {});
      } else if (role === "VIEWER" || role === null) {
        // VIEWER et non-membre connecté peuvent tous deux avoir une demande en cours
        api.joinRequests.getMine(story.id).then(setMyJoinRequest).catch(() => {});
      }
    } else {
      // Invité : pas de membership à charger
      setMembershipResolved(true);
    }
  };

  // ── Select scene → load full scene with contributions
  const handleSelectScene = async (sceneId: string) => {
    const scene = await api.scenes.get(sceneId);
    setSelectedScene(scene);
    setSettingsEdit({
      visibilityMode: scene.visibilityMode,
      visibleCount: scene.visibleCount,
      status: scene.status,
      mode: scene.mode ?? "FREE",
    });
    setSceneCharEdits(scene.characters.map((c) => c.id));
    setSpectatorView(false);
    setShowSettings(false);
    setShowCharSelect(false);
    setSuggestion(null);
    setGmSuggestion(null);
    setRoleDowngradeAlert(false);
    setRoleDowngradeDraft(null);
    setContribContent("");
    setContribCharId(characters[0]?.id ?? "");
  };

  // ── Helper : afficher une erreur en toast
  const addErrorToast = (err: unknown) => {
    const msg = (err as Error).message ?? "Une erreur est survenue.";
    setToasts((prev) => [...prev, { id: ++toastIdRef.current, type: "error" as const, message: msg }].slice(-5));
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
      addErrorToast(err);
    }
  };

  // ── Create scene
  const handleCreateScene = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStory || !newScene.title.trim()) return;
    setCreatingScene(true);
    try {
      // Phase A : création directe sous l'histoire (plus de chapitre requis)
      const created = await api.scenes.create(selectedStory.id, {
        title: newScene.title.trim(),
        description: newScene.description.trim() || undefined,
        order: scenes.length + 1,
      });
      // Dédup : le socket event peut être arrivé avant la réponse HTTP
      const sceneItem: Scene = { ...created, _count: { contributions: 0 }, contributions: [] };
      setScenes((p) => p.some((s) => s.id === created.id) ? p : [...p, sceneItem]);
      setNewScene({ title: "", description: "" });
      setShowSceneForm(false);
    } catch (err: unknown) {
      addErrorToast(err);
    } finally {
      setCreatingScene(false);
    }
  };

  // ── Typing indicator : émettre typing:start / typing:stop avec debounce
  const handleTyping = () => {
    if (!selectedScene || !currentUser) return;
    const username = currentUser.displayName ?? currentUser.email?.split("@")[0] ?? currentUser.pseudonym ?? "Joueur";

    if (!isTypingRef.current) {
      socket.emit("typing:start", { sceneId: selectedScene.id, userId: currentUser.id, username });
      isTypingRef.current = true;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing:stop", { sceneId: selectedScene.id, userId: currentUser.id });
      isTypingRef.current = false;
      typingTimeoutRef.current = null;
    }, 2500);
  };

  // ── Submit contribution
  const handleSubmitContrib = async () => {
    if (!selectedScene || !contribContent.trim()) return;

    // Arrêter l'indicateur de frappe immédiatement à l'envoi
    if (isTypingRef.current && currentUser) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("typing:stop", { sceneId: selectedScene.id, userId: currentUser.id });
      isTypingRef.current = false;
      typingTimeoutRef.current = null;
    }

    setSubmittingContrib(true);
    try {
      const contrib = await api.contributions.create(selectedScene.id, {
        content: contribContent.trim(),
        characterId: contribCharId || undefined,
      });
      // Dédup : le socket event contribution:new peut précéder la réponse HTTP.
      // onContribNew (socket) est la source de vérité pour le compteur de chapitre.
      setSelectedScene((s) => {
        if (!s) return s;
        if ((s.contributions ?? []).some((c) => c.id === contrib.id)) return s;
        return { ...s, contributions: [...(s.contributions ?? []), contrib], _count: { contributions: (s._count?.contributions ?? 0) + 1 } };
      });
      setContribContent("");
    } catch (err: unknown) {
      addErrorToast(err);
    } finally {
      setSubmittingContrib(false);
    }
  };

  // ── Delete contribution
  const handleDeleteContrib = async (id: string) => {
    if (!selectedScene) return;
    if (!window.confirm("Supprimer cette contribution ?")) return;
    await api.contributions.delete(id);
    setSelectedScene((s) =>
      s ? { ...s, contributions: (s.contributions ?? []).filter((c) => c.id !== id) } : s
    );
  };

  // ── Edit contribution
  const handleStartEdit = (contrib: import("./api").Contribution) => {
    setEditingContribId(contrib.id);
    setEditingContent(contrib.content);
  };

  const handleSaveEdit = async () => {
    if (!editingContribId || !editingContent.trim()) return;
    try {
      const updated = await api.contributions.update(editingContribId, editingContent);
      setSelectedScene((s) => {
        if (!s) return s;
        return {
          ...s,
          contributions: (s.contributions ?? []).map((c) => (c.id === updated.id ? updated : c)),
        };
      });
      setEditingContribId(null);
      setEditingContent("");
    } catch (err: unknown) {
      addErrorToast(err);
    }
  };

  const handleCancelEdit = () => {
    setEditingContribId(null);
    setEditingContent("");
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
  const handleToggleMode = async (newMode: SceneMode) => {
    if (!selectedScene) return;
    const updated = await api.scenes.update(selectedScene.id, { mode: newMode });
    setSelectedScene((s) => s ? { ...s, mode: updated.mode, currentTurnUserId: updated.currentTurnUserId } : s);
    setSettingsEdit((p) => ({ ...p, mode: updated.mode }));
    const label = newMode === "TURN" ? "Tour par tour activé" : "Mode libre activé";
    setToasts((prev) => {
      const id = ++toastIdRef.current;
      return [...prev, { id, type: "scene" as const, message: label }].slice(-5);
    });
  };

  const handleSaveSettings = async () => {
    if (!selectedScene) return;
    setSavingSettings(true);
    try {
      const updated = await api.scenes.update(selectedScene.id, settingsEdit);
      setSelectedScene((s) => s ? { ...s, ...settingsEdit, characters: s.characters, contributions: s.contributions } : s);
      // Phase A : sync status dans la liste plate de scènes
      setScenes((p) => p.map((sc) =>
        sc.id === selectedScene.id ? { ...sc, status: settingsEdit.status } : sc
      ));
      setShowSettings(false);
      void updated;
    } catch (err: unknown) {
      addErrorToast(err);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Delete scene (OWNER)
  const handleDeleteScene = async () => {
    if (!selectedScene) return;
    if (!window.confirm(`Supprimer la scène "${selectedScene.title}" ? Cette action est irréversible.`)) return;
    const deletedTitle = selectedScene.title;
    const deletedId = selectedScene.id;
    await api.scenes.delete(deletedId);
    // Phase A : mise à jour dans la liste plate (le socket confirmera chez les autres)
    setScenes((p) => p.filter((sc) => sc.id !== deletedId));
    setSelectedScene(null);
    setToasts((prev) => {
      const id = ++toastIdRef.current;
      return [...prev, { id, type: "scene" as const, message: `Scène "${deletedTitle}" supprimée` }].slice(-5);
    });
  };

  // ── Toggle story status (OWNER)
  const handleToggleStoryStatus = async () => {
    if (!selectedStory) return;
    const newStatus: ContentStatus = (selectedStory as Story & { status: ContentStatus }).status === "DONE" ? "ACTIVE" : "DONE";
    const updated = await api.stories.updateStatus(selectedStory.id, newStatus);
    setSelectedStory((s) => s ? { ...s, status: updated.status } : s);
    setStories((p) => p.map((s) => s.id === updated.id ? { ...s, status: updated.status } : s));
    const label = updated.status === "DONE"
      ? `Histoire "${selectedStory.title}" terminée`
      : `Histoire "${selectedStory.title}" réouverte`;
    setToasts((prev) => {
      const id = ++toastIdRef.current;
      return [...prev, { id, type: "scene" as const, message: label }].slice(-5);
    });
  };

  // ── Toggle story visibility (OWNER)
  const handleToggleVisibility = async () => {
    if (!selectedStory) return;
    const newVis: StoryVisibility = selectedStory.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    const updated = await api.stories.updateVisibility(selectedStory.id, newVis);
    setSelectedStory((s) => s ? { ...s, visibility: updated.visibility } : s);
    setStories((p) => p.map((s) => s.id === updated.id ? { ...s, visibility: updated.visibility } : s));
    // Rafraîchir la liste publique depuis le serveur
    api.stories.listPublic().then(setPublicStories).catch(() => {});
    const label = updated.visibility === "PUBLIC" ? `Histoire rendue publique` : `Histoire rendue privée`;
    setToasts((prev) => {
      const id = ++toastIdRef.current;
      return [...prev, { id, type: "scene" as const, message: label }].slice(-5);
    });
  };

  // ── Archive / Restaurer / Supprimer (OWNER)
  const handleArchiveStory = async () => {
    if (!selectedStory) return;
    if (!window.confirm(`Archiver « ${selectedStory.title} » ? L'histoire ne sera plus visible dans vos listes.`)) return;
    try {
      const updated = await api.stories.archive(selectedStory.id);
      setStories((p) => p.filter((s) => s.id !== updated.id));
      setArchivedStories((p) => [updated, ...p]);
      setSelectedStory(null);
      setToasts((prev) => { const id = ++toastIdRef.current; return [...prev, { id, type: "scene" as const, message: "Histoire archivée" }].slice(-5); });
    } catch (err) { addErrorToast(err); }
  };

  const handleUnarchiveStory = async () => {
    if (!selectedStory) return;
    try {
      const updated = await api.stories.unarchive(selectedStory.id);
      setArchivedStories((p) => p.filter((s) => s.id !== updated.id));
      setStories((p) => [updated, ...p]);
      setSelectedStory(updated);
      setToasts((prev) => { const id = ++toastIdRef.current; return [...prev, { id, type: "scene" as const, message: "Histoire restaurée" }].slice(-5); });
    } catch (err) { addErrorToast(err); }
  };

  const handleDeleteStory = async () => {
    if (!selectedStory) return;
    if (!window.confirm(`Supprimer définitivement « ${selectedStory.title} » ? Cette action est irréversible.`)) return;
    try {
      await api.stories.delete(selectedStory.id);
      setStories((p) => p.filter((s) => s.id !== selectedStory.id));
      setArchivedStories((p) => p.filter((s) => s.id !== selectedStory.id));
      setSelectedStory(null);
      setToasts((prev) => { const id = ++toastIdRef.current; return [...prev, { id, type: "scene" as const, message: "Histoire supprimée" }].slice(-5); });
    } catch (err) { addErrorToast(err); }
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
    try {
      const created = await api.characters.create(selectedStory.id, {
        name: newChar.name?.trim() || undefined,
        nickname: newChar.nickname?.trim() || undefined,
      });
      // Déduplication : le socket character:new peut arriver avant la réponse HTTP
      // (le serveur émet avant res.json). On n'ajoute que si absent.
      setCharacters((p) => p.some((c) => c.id === created.id) ? p : [...p, created]);
      setNewChar({ name: "", nickname: "" });
    } catch (err: unknown) {
      addErrorToast(err);
    }
  };

  const handleSaveChar = async (char: Character) => {
    setSavingChar(char.id);
    try {
      const updated = await api.characters.update(char.id, charEdits[char.id] ?? {});
      setCharacters((p) => p.map((c) => (c.id === updated.id ? updated : c)));
      setExpandedCharId(null);
    } catch (err: unknown) {
      addErrorToast(err);
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
      const result = await api.auth.register(
        authPassword,
        authEmail.trim() || undefined,
        authPseudonym.trim() || undefined
      );
      tokenStore.set(result.token);
      setCurrentUser(result.user);
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
      } else {
        setAuthView(null);
      }
      setAuthEmail("");
      setAuthPassword("");
      setAuthPseudonym("");
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
    navRestoredRef.current = false;
    localStorage.removeItem("sf_nav");
  };

  const handleOpenProfile = () => {
    setProfileEdits({
      displayName: currentUser?.displayName ?? "",
      color: currentUser?.color ?? "",
      bio: currentUser?.bio ?? "",
      notifBattleEnabled: currentUser?.notifBattleEnabled ?? true,
      notifInvitesEnabled: currentUser?.notifInvitesEnabled ?? true,
      notifGeneralEnabled: currentUser?.notifGeneralEnabled ?? true,
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
        notifBattleEnabled: profileEdits.notifBattleEnabled,
        notifInvitesEnabled: profileEdits.notifInvitesEnabled,
        notifGeneralEnabled: profileEdits.notifGeneralEnabled,
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
    const participant = participants.find((p) => p.userId === userId);
    const name = participant?.user.displayName || participant?.user.email?.split("@")[0] || participant?.user.pseudonym || "Participant";
    const roleLabel = role === "EDITOR" ? "éditeur" : "lecteur";
    setToasts((prev) => {
      const id = ++toastIdRef.current;
      return [...prev, { id, type: "scene" as const, message: `${name} est maintenant ${roleLabel}.` }].slice(-5);
    });
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!selectedStory) return;
    await api.participants.remove(selectedStory.id, userId);
    setParticipants((p) => p.filter((x) => x.userId !== userId));
  };

  // ── Demandes de participation
  const handleRequestJoin = async () => {
    if (!selectedStory) return;
    setRequestingJoin(true);
    try {
      const req = await api.joinRequests.create(selectedStory.id);
      setMyJoinRequest(req);
    } catch (err: unknown) {
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "contribution" as const, message: (err as Error).message }].slice(-5);
      });
    } finally {
      setRequestingJoin(false);
    }
  };

  const handleRespondToRequest = async (requestId: string, action: "accept" | "decline") => {
    if (!selectedStory) return;
    try {
      const updated = await api.joinRequests.respond(selectedStory.id, requestId, action);
      setJoinRequests((prev) => prev.filter((r) => r.id !== updated.id));
      if (action === "accept") {
        setParticipants((prev) =>
          prev.map((p) => p.userId === updated.userId ? { ...p, role: "EDITOR" as ParticipantRole } : p)
        );
      }
    } catch (err: unknown) {
      setToasts((prev) => {
        const id = ++toastIdRef.current;
        return [...prev, { id, type: "contribution" as const, message: (err as Error).message }].slice(-5);
      });
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const closeStoryForm = () => {
    setShowStoryForm(false);
    setStoryTitle("");
    setStoryDesc("");
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Breadcrumb context
  const crumbStory = selectedStory?.title ?? null;
  // Phase A : niveau chapitre supprimé du breadcrumb
  const crumbScene = selectedScene?.title ?? null;

  // Phase A : navigation précédente / suivante dans la liste plate de scènes
  const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
  const sceneNavIndex = selectedScene
    ? sortedScenes.findIndex((sc) => sc.id === selectedScene.id)
    : -1;
  const prevScene = sceneNavIndex > 0 ? sortedScenes[sceneNavIndex - 1] : null;
  const nextScene = sceneNavIndex < sortedScenes.length - 1 ? sortedScenes[sceneNavIndex + 1] : null;

  // ── Rôles et accès dérivés ──────────────────────────────────────────────────
  const isGuest = !currentUser;                           // non connecté
  const isMember = myRole !== null;                       // a un rôle dans l'histoire
  const canWrite = myRole === "OWNER" || myRole === "EDITOR"; // peut écrire
  // true pendant le chargement du membership — masque les bannières "visiteur" pour éviter le flash
  const membershipPending = !!selectedStory && !membershipResolved;
  // Données de l'histoire publique (pour les non-membres : count participants, etc.)
  const publicStoryData = selectedStory && !isMember
    ? publicStories.find((s) => s.id === selectedStory.id) ?? null
    : null;

  // ── Mode Battle — rendu isolé ──────────────────────────────────────────────
  if (appView === "battle") {
    return <BattleApp currentUser={currentUser} onBack={() => setAppView("stories")} />;
  }

  if (appView === "admin") {
    return (
      <AdminPage
        onBack={() => setAppView("stories")}
        addToast={(msg, type) => setToasts((prev) => [...prev, { id: ++toastIdRef.current, type: type ?? "scene", message: msg }].slice(-5))}
      />
    );
  }

  return (
    <div style={s.root}>
      <div style={s.sealTL} className="app-seal-tl" aria-hidden="true">✦</div>
      <div style={s.sealBR} className="app-seal-br" aria-hidden="true">✦</div>

      {/* ══ Header */}
      <header style={s.header}>
        <div style={s.headerInner} className="app-header-inner">
          <div style={s.headerLeft}>
            <button style={s.menuBtn} onClick={() => setSidebarOpen((v) => !v)} aria-label="Menu">
              ☰
            </button>
            {/* Branding — cliquable, caché sur mobile */}
            <span
              style={s.headerBrand}
              className="app-logo-mark app-header-brand"
              title="Retour à l'accueil"
              onClick={() => { setSelectedStory(null); setSelectedScene(null); }}
            >
              ✦ StoryForge
            </span>
            <span style={s.headerBrandSep} className="app-header-brand" aria-hidden="true" />
            <div style={s.breadcrumb}>
              <span style={s.logoMark} className="app-logo-mark" title="Retour à l'accueil" onClick={() => { setSelectedStory(null); setSelectedScene(null); }}>
                ✦ Accueil
              </span>
              {crumbStory && (
                <span className="app-crumb-mid">
                  <span style={s.crumbSep}>/</span>
                  {/* Phase A : clic sur l'histoire ramène à la liste des scènes */}
                  <span style={s.crumbItem} className="app-crumb-item" onClick={() => setSelectedScene(null)}>
                    {crumbStory}
                  </span>
                </span>
              )}
              {crumbScene && (
                <span className="app-crumb-last">
                  <span style={s.crumbSep}>/</span>
                  <span style={s.crumbCurrent}>{crumbScene}</span>
                </span>
              )}
            </div>
          </div>
          <div style={s.headerRight} className="app-header-right">
            {currentUser && (
              <button
                onClick={() => setShowWorldMap(true)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(75,35,5,0.25)",
                  borderRadius: 4,
                  padding: "0.3rem 0.7rem",
                  color: C.textMuted,
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.08em",
                }}
                title="Carte du monde"
              >
                🌍
              </button>
            )}
            {currentUser?.isAdmin && (
              <button
                style={{ ...s.btnGhost, fontSize: "0.82rem", padding: "0.25rem 0.65rem", color: "#92400e", borderColor: "rgba(146,64,14,0.35)" }}
                onClick={() => setAppView("admin")}
                title="Administration"
              >
                ⚑ Admin
              </button>
            )}
            {currentUser && (
              <div style={{ position: "relative" }}>
                <button
                  style={{ ...s.btnGhost, fontSize: "0.9rem", padding: "0.25rem 0.55rem", position: "relative" }}
                  onClick={() => setShowNotifPanel((v) => !v)}
                  title="Notifications"
                  aria-label="Notifications"
                >
                  🔔
                  {notifications.filter((n) => !n.isRead).length > 0 && (
                    <span style={{
                      position: "absolute", top: 1, right: 1,
                      width: 8, height: 8, borderRadius: "50%",
                      background: "#b91c1c", border: "1.5px solid #f8f0d8",
                    }} />
                  )}
                </button>
                {showNotifPanel && (
                  <NotifPanel
                    notifications={notifications}
                    onMarkRead={async (id) => {
                      await api.notifications.markRead(id);
                      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
                    }}
                    onClose={() => setShowNotifPanel(false)}
                  />
                )}
              </div>
            )}
            <button
              style={{ ...s.btnGhost, fontSize: "0.82rem", padding: "0.25rem 0.65rem" }}
              onClick={() => setAppView("battle")}
              title="Mode Battle"
            >
              ⚔ Battle
            </button>
            {!authLoading && (
              currentUser ? (
                <div style={s.userChip}>
                  {currentUser.color && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: currentUser.color, flexShrink: 0 }} />
                  )}
                  <span style={s.userEmail} className="app-user-name">{currentUser.displayName || currentUser.email || currentUser.pseudonym || "Joueur"}</span>
                  {onlineCount > 1 && (
                    <span className="app-online-indicator" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4caf50", display: "inline-block", flexShrink: 0 }} />
                      {onlineCount} en ligne
                    </span>
                  )}
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
              <button className="app-new-story-btn" style={s.btnAccent} onClick={() => {
                if (showStoryForm) {
                  closeStoryForm();
                } else {
                  setShowStoryForm(true);
                  if (isMobile) setSidebarOpen(true);
                }
              }}>
                {showStoryForm ? "Annuler" : (isMobile ? "+ Histoire" : "Nouvelle histoire")}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Barre de navigation contextuelle — mobile uniquement */}
      {selectedStory && (
        <div className="app-ctx-nav">
          <button
            className="app-ctx-back"
            onClick={() => selectedScene ? setSelectedScene(null) : setSelectedStory(null)}
            aria-label="Retour"
          >
            ←
          </button>
          <div className="app-ctx-crumbs">
            {selectedScene ? (
              <>
                <span className="app-ctx-story" onClick={() => setSelectedScene(null)}>
                  {selectedStory.title}
                </span>
                <span className="app-ctx-sep">/</span>
                <span className="app-ctx-current">{selectedScene.title}</span>
              </>
            ) : (
              <>
                <span className="app-ctx-story" onClick={() => setSelectedStory(null)}>
                  Histoires
                </span>
                <span className="app-ctx-sep">/</span>
                <span className="app-ctx-current">{selectedStory.title}</span>
              </>
            )}
          </div>
        </div>
      )}

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
              {authView === "register" && (
                <>
                  <input
                    style={s.inputDark}
                    type="text"
                    placeholder="Pseudonyme (obligatoire sans email)"
                    value={authPseudonym}
                    onChange={(e) => setAuthPseudonym(e.target.value)}
                    autoFocus
                    maxLength={40}
                  />
                  <input
                    style={s.inputDark}
                    type="email"
                    placeholder="Email (optionnel)"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </>
              )}
              {authView === "login" && (
                <input
                  style={s.inputDark}
                  type="text"
                  placeholder="Email ou pseudonyme"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  autoFocus
                />
              )}
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

      {recoveryCode && (
        <>
          <div style={s.authOverlay} onClick={() => { setRecoveryCode(null); setAuthView(null); }} />
          <div style={{ ...s.authPanel, maxWidth: 400 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
              <p style={s.authTitle}>🔑 Ton code de récupération</p>
            </div>
            <p style={{ fontSize: "0.82rem", color: C.textSub, fontStyle: "italic", marginBottom: "1rem", lineHeight: 1.6 }}>
              Note ce code maintenant — il ne sera plus jamais affiché.
              Si tu oublies ton mot de passe, c'est le seul moyen de récupérer ton compte.
            </p>
            <div style={{
              background: "rgba(75,35,5,0.08)",
              border: "1px solid rgba(75,35,5,0.25)",
              borderRadius: 6,
              padding: "1rem",
              fontFamily: C.serif,
              fontSize: "0.95rem",
              lineHeight: 2,
              color: C.text,
              letterSpacing: "0.02em",
              marginBottom: "1rem",
              wordBreak: "break-word",
            }}>
              {recoveryCode}
            </div>
            <button
              style={{ ...s.btnAccent, width: "100%", marginBottom: "0.5rem" }}
              onClick={() => navigator.clipboard.writeText(recoveryCode)}
            >
              📋 Copier le code
            </button>
            <button
              style={{ ...s.btnGhost, width: "100%" }}
              onClick={() => { setRecoveryCode(null); setAuthView(null); }}
            >
              J'ai noté mon code — continuer →
            </button>
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
                  placeholder={currentUser.email?.split("@")[0] ?? currentUser.pseudonym ?? "Joueur"}
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
              {/* Préférences de notifications */}
              <div style={{ borderTop: "1px solid rgba(75,35,5,0.12)", paddingTop: "0.75rem" }}>
                <label style={{ ...s.profileLabel, display: "block", marginBottom: "0.5rem" }}>Notifications</label>
                {(
                  [
                    { key: "notifBattleEnabled" as const, label: "Notifications de battle" },
                    { key: "notifInvitesEnabled" as const, label: "Invitations" },
                    { key: "notifGeneralEnabled" as const, label: "Infos générales" },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.4rem", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={profileEdits[key] ?? true}
                      onChange={(e) => setProfileEdits((p) => ({ ...p, [key]: e.target.checked }))}
                      style={{ accentColor: "#3c1e6a", width: 15, height: 15, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.83rem", color: "#2d1305" }}>{label}</span>
                  </label>
                ))}
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "rgba(75,35,5,0.5)", lineHeight: 1.45 }}>
                  Les notifications importantes liées à la sécurité et au compte restent toujours actives.
                </p>
              </div>
              {profileError && <p style={s.authErrorMsg}>{profileError}</p>}
              <button style={s.btnAccent} type="submit" disabled={savingProfile}>
                {savingProfile ? "Sauvegarde…" : "Enregistrer →"}
              </button>
            </form>
            <p style={{ ...s.authSwitch, textAlign: "left" as const, color: C.textMuted }}>
              {currentUser.email ?? currentUser.pseudonym ?? "Sans email"}
            </p>
          </div>
        </>
      )}

      {error && <div style={s.errorBanner}>{error}<button style={s.errorClose} onClick={() => setError(null)}>✕</button></div>}

      {currentUser?.isBanned && (
        <div style={{
          background: "rgba(146,64,14,0.12)", borderBottom: "1px solid rgba(146,64,14,0.28)",
          color: "#92400e", padding: "0.55rem 1.5rem",
          fontSize: "0.85rem", textAlign: "center" as const, fontWeight: 500,
        }}>
          Votre compte est actuellement suspendu. La lecture reste disponible, mais les interactions sont désactivées.
        </div>
      )}

      <div style={s.layout} className="app-layout">

        {/* ══ Sidebar */}
        <aside className={`app-sidebar${sidebarOpen ? " is-open" : ""}`} style={{ ...s.sidebar, ...(sidebarOpen ? s.sidebarOpen : {}) }}>
          <div style={s.sidebarHead}>
            <p style={s.sidebarLabel}>Histoires</p>
            <button style={s.sidebarClose} onClick={() => { setSidebarOpen(false); closeStoryForm(); }}>✕</button>
          </div>

          {showStoryForm && (
            <form onSubmit={handleCreateStory} style={s.storyForm}>
              <input style={s.inputDark} placeholder="Titre" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} required autoFocus />
              <input style={s.inputDark} placeholder="Description (optionnelle)" value={storyDesc} onChange={(e) => setStoryDesc(e.target.value)} />
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button style={s.btnAccent} type="submit">Créer →</button>
                <button style={s.btnGhost} type="button" onClick={closeStoryForm}>Annuler</button>
              </div>
            </form>
          )}

          <ul style={s.storyList}>
            {stories.map((story) => {
              const active = selectedStory?.id === story.id;
              return (
                <li key={story.id} style={{ ...s.storyItem, ...(active ? s.storyItemActive : {}) }} className={`story-item${active ? " is-active" : ""}`} onClick={() => handleSelectStory(story)}>
                  <div style={s.storyItemDot}>{active ? "▶" : "○"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <div style={s.storyItemTitle}>{story.title}</div>
                      {story.visibility === "PUBLIC" && (
                        <span style={{ fontSize: "0.65rem", color: "#2a6a2a", background: "rgba(20,80,20,0.10)", border: "1px solid rgba(20,80,20,0.2)", borderRadius: 3, padding: "0 0.3rem", flexShrink: 0 }}>Public</span>
                      )}
                    </div>
                    {story.description && <div style={s.storyItemDesc}>{story.description}</div>}
                  </div>
                </li>
              );
            })}
            {stories.length === 0 && <p style={s.mutedSmall}>Aucune histoire pour l'instant.</p>}
          </ul>

          {/* ── Archives */}
          {archivedStories.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: "0.75rem", padding: "0.1rem 0", display: "flex", alignItems: "center", gap: "0.3rem" }}
                onClick={() => setShowArchivedStories((v) => !v)}
              >
                {showArchivedStories ? "▾" : "▸"} Archives ({archivedStories.length})
              </button>
              {showArchivedStories && (
                <ul style={{ ...s.storyList, marginTop: "0.4rem", opacity: 0.7 }}>
                  {archivedStories.map((story) => {
                    const active = selectedStory?.id === story.id;
                    return (
                      <li key={story.id} style={{ ...s.storyItem, ...(active ? s.storyItemActive : {}) }} className={`story-item${active ? " is-active" : ""}`} onClick={() => handleSelectStory(story)}>
                        <div style={s.storyItemDot}>{active ? "▶" : "○"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={s.storyItemTitle}>{story.title}</div>
                          {story.description && <div style={s.storyItemDesc}>{story.description}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>

        {sidebarOpen && <div style={s.sidebarOverlay} onClick={() => { setSidebarOpen(false); closeStoryForm(); }} />}

        {/* ══ Main */}
        <main style={s.main} className="app-main">

          {/* ── Aucune histoire sélectionnée — visiteur non connecté */}
          {!selectedStory && !currentUser && (
            <div style={{
              maxWidth: 680,
              margin: "0 auto",
              padding: "4rem 2rem 6rem",
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center",
              gap: "0",
            }}>
              {/* Logo */}
              <div style={{
                fontSize: "2rem",
                marginBottom: "1rem",
                opacity: 0.7,
              }}>✦</div>
              <h1 style={{
                fontFamily: C.display,
                fontSize: "clamp(2rem, 5vw, 3rem)",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: C.text,
                margin: "0 0 0.5rem",
                textAlign: "center" as const,
              }}>
                STORYFORGE
              </h1>
              <p style={{
                fontFamily: C.serif,
                fontStyle: "italic",
                fontSize: "1.1rem",
                color: C.textSub,
                margin: "0 0 3rem",
                textAlign: "center" as const,
              }}>
                Un monde narratif. Un ami discret.
              </p>

              {/* Manifeste */}
              <div style={{
                width: "100%",
                display: "flex",
                flexDirection: "column" as const,
                gap: "1.5rem",
                marginBottom: "3rem",
              }}>
                {[
                  {
                    icon: "🎭",
                    title: "Vous écrivez. L'IA observe.",
                    desc: "StoryForge n'écrit pas à votre place. Un Maître du Jeu invisible lit votre histoire et intervient au bon moment — un bruit, une tension, un retournement. Jamais intrusif. Toujours au service de votre récit.",
                  },
                  {
                    icon: "🌍",
                    title: "Chaque histoire construit un monde.",
                    desc: "Ce que vous inventez ce soir — un lieu, un objet, une phrase — entre silencieusement dans la mémoire du monde. D'autres joueurs, ailleurs, le retrouveront un jour sans savoir d'où ça vient.",
                  },
                  {
                    icon: "🔑",
                    title: "StoryForge ne sait pas qui vous êtes.",
                    desc: "Pas d'email obligatoire. Pas de tracking. Pas de pub. Un pseudonyme suffit pour commencer. Vos histoires vous appartiennent — et rien d'autre ne nous intéresse.",
                  },
                ].map((item) => (
                  <div key={item.title} style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                    padding: "1.1rem 1.3rem",
                    background: "rgba(75,35,5,0.04)",
                    border: "1px solid rgba(75,35,5,0.1)",
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: "1.4rem", flexShrink: 0, lineHeight: 1.4 }}>{item.icon}</span>
                    <div>
                      <p style={{
                        fontFamily: C.ui,
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        color: C.text,
                        margin: "0 0 0.35rem",
                      }}>
                        {item.title}
                      </p>
                      <p style={{
                        fontFamily: C.serif,
                        fontStyle: "italic",
                        fontSize: "0.92rem",
                        color: C.textSub,
                        margin: 0,
                        lineHeight: 1.65,
                      }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap" as const,
                justifyContent: "center" as const,
                marginBottom: "2rem",
              }}>
                <button
                  style={{
                    ...s.btnAccent,
                    fontSize: "0.85rem",
                    padding: "0.65rem 1.6rem",
                    letterSpacing: "0.1em",
                  }}
                  onClick={() => setAuthView("register")}
                >
                  Commencer une histoire →
                </button>
                <button
                  style={{
                    ...s.btnGhost,
                    fontSize: "0.85rem",
                    padding: "0.65rem 1.4rem",
                  }}
                  onClick={() => setAuthView("login")}
                >
                  Se connecter
                </button>
              </div>

              {/* Histoires publiques */}
              {publicStories.length > 0 && (
                <div style={{ width: "100%" }}>
                  <p style={{
                    fontFamily: C.ui,
                    fontSize: "0.68rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase" as const,
                    color: C.textMuted,
                    margin: "0 0 0.75rem",
                    textAlign: "center" as const,
                  }}>
                    Histoires en cours
                  </p>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.5rem" }}>
                    {publicStories.slice(0, 3).map((story) => (
                      <div
                        key={story.id}
                        style={{
                          ...s.homepageStoryRow,
                          cursor: "pointer",
                        }}
                        onClick={() => handleSelectStory(story as unknown as Story)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={s.homepageStoryTitle}>{story.title}</div>
                          {story.description && (
                            <div style={s.homepageStoryDesc}>{story.description}</div>
                          )}
                        </div>
                        <span style={{ ...s.chapterArrow, marginTop: 0 }}>→</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Homepage vivante (connecté, pas d'histoire sélectionnée) */}
          {!selectedStory && currentUser && (
            <div style={s.homepage}>
              {/* En-tête */}
              <div style={s.homepageHead}>
                <div style={s.emptyOrn} className="empty-orn">✦</div>
                <p style={s.emptyTitle}>StoryForge</p>
                {onlineCount > 0 && (
                  <div style={s.homepagePulse}>
                    <span style={s.pulseDot} />
                    {onlineCount} personne{onlineCount !== 1 ? "s" : ""} en ligne
                  </div>
                )}
              </div>

              {/* Histoires triées par activité récente */}
              {stories.length > 0 && (
                <div style={s.homepageSection}>
                  <p style={s.homepageSectionLabel}>Vos histoires</p>
                  <div>
                    {[...stories]
                      .sort((a, b) => (storyLastActivity[b.id] ?? 0) - (storyLastActivity[a.id] ?? 0))
                      .map((story) => (
                        <div key={story.id} style={s.homepageStoryRow} className="story-item" onClick={() => handleSelectStory(story)}>
                          <div style={{ flex: 1 }}>
                            <div style={s.homepageStoryTitle}>{story.title}</div>
                            {story.description && <div style={s.homepageStoryDesc}>{story.description}</div>}
                            {(() => {
                              const pd = publicStories.find((ps) => ps.id === story.id);
                              return pd ? (
                                <span style={{ fontSize: "0.75rem", color: C.textMuted }}>
                                  👥 {pd._count.participants} participant{pd._count.participants !== 1 ? "s" : ""}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {storyLastActivity[story.id] && (
                            <span style={s.homepageStoryTime}>{timeAgo(new Date(storyLastActivity[story.id]).toISOString())}</span>
                          )}
                          <span style={{ ...s.chapterArrow, marginTop: 0 }}>→</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Feed d'activité récente */}
              {activityFeed.length > 0 && (
                <div style={s.homepageSection}>
                  <p style={s.homepageSectionLabel}>Activité récente</p>
                  <div style={s.activityFeed}>
                    {activityFeed.map((item, i) => (
                      <div key={i} style={s.activityItem}>
                        <span style={s.activityDot}>{item.type === "scene" ? "+" : "·"}</span>
                        <span style={s.activityBody}>
                          {item.type === "contribution" ? (
                            <><strong>{item.username}</strong> <span style={{ color: C.textMuted }}>dans</span> {item.sceneTitle}</>
                          ) : (
                            <>Scène <strong>{item.sceneTitle}</strong></>
                          )}
                          <span style={s.activityMeta}> — {item.storyTitle}</span>
                        </span>
                        <span style={s.activityTime}>{timeAgo(item.at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histoires publiques auxquelles l'utilisateur n'appartient pas */}
              {(() => {
                const myIds = new Set(stories.map((s) => s.id));
                const discoverable = publicStories.filter((s) => !myIds.has(s.id));
                if (discoverable.length === 0) return null;
                return (
                  <div style={s.homepageSection}>
                    <p style={s.homepageSectionLabel}>Histoires publiques</p>
                    <div>
                      {discoverable.map((story) => (
                        <div key={story.id} style={s.homepageStoryRow} className="story-item" onClick={() => handleSelectStory(story as unknown as Story)}>
                          <div style={{ flex: 1 }}>
                            <div style={s.homepageStoryTitle}>{story.title}</div>
                            {story.description && <div style={s.homepageStoryDesc}>{story.description}</div>}
                            <div style={{ fontSize: "0.75rem", color: C.textMuted, marginTop: 2, display: "flex", gap: "0.75rem" }}>
                              <span>{story._count.scenes} scène{story._count.scenes !== 1 ? "s" : ""}</span>
                              <span>👥 {story._count.participants > 0 ? `${story._count.participants} participant${story._count.participants !== 1 ? "s" : ""}` : "Soyez le premier à participer"}</span>
                            </div>
                          </div>
                          <span style={{ ...s.chapterArrow, marginTop: 0 }}>→</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Fallback si aucune activité */}
              {activityFeed.length === 0 && stories.length === 0 && (
                <p style={s.emptyText}>
                  Chaque grande histoire commence par une ligne.<br /><br />
                  Ouvre le menu pour créer ta première histoire.
                </p>
              )}
            </div>
          )}

          {/* ── Histoire sélectionnée → liste des scènes (Phase A : plus de niveau chapitre) */}
          {selectedStory && !selectedScene && (
            <div>
              <div style={s.pageHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <h1 style={{ ...s.pageTitle, margin: 0 }} className="app-page-title">{selectedStory.title}</h1>
                  {selectedStory.visibility === "PUBLIC" && (
                    <span style={{ ...s.statusBadge, background: "rgba(20,80,20,0.10)", color: "#2a6a2a", border: "1px solid rgba(20,80,20,0.25)", fontSize: "0.7rem" }}>
                      Public
                    </span>
                  )}
                  {(selectedStory as Story & { status?: ContentStatus }).status === "DONE" && (
                    <span style={{ ...s.statusBadge, background: "rgba(75,35,5,0.12)", color: C.textMuted, border: `1px solid ${C.border}`, fontSize: "0.7rem" }}>
                      Terminée
                    </span>
                  )}
                  {(selectedStory as Story).isArchived && (
                    <span style={{ ...s.statusBadge, background: "rgba(75,35,5,0.08)", color: C.textMuted, border: `1px solid ${C.border}`, fontSize: "0.7rem" }}>
                      Archivée
                    </span>
                  )}
                  {myRole === "OWNER" && (
                    <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto", flexWrap: "wrap" as const }}>
                      {!(selectedStory as Story).isArchived && (
                        <>
                          <button
                            style={{ ...s.btnGhost, fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                            onClick={handleToggleVisibility}
                          >
                            {selectedStory.visibility === "PUBLIC" ? "Rendre privée" : "Rendre publique"}
                          </button>
                          <button
                            style={{ ...s.btnGhost, fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                            onClick={handleToggleStoryStatus}
                          >
                            {(selectedStory as Story & { status?: ContentStatus }).status === "DONE" ? "Réouvrir l'histoire" : "Terminer l'histoire"}
                          </button>
                          <button
                            style={{ ...s.btnGhost, fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                            onClick={handleArchiveStory}
                          >
                            Archiver
                          </button>
                        </>
                      )}
                      {(selectedStory as Story).isArchived && (
                        <button
                          style={{ ...s.btnGhost, fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                          onClick={handleUnarchiveStory}
                        >
                          Restaurer
                        </button>
                      )}
                      <button
                        style={{ ...s.btnGhost, fontSize: "0.78rem", padding: "0.2rem 0.6rem", color: "#b91c1c", borderColor: "rgba(185,28,28,0.3)" }}
                        onClick={handleDeleteStory}
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </div>
                {selectedStory.description && <p style={s.pageDesc}>{selectedStory.description}</p>}
              </div>

              {/* Tabs */}
              <div style={s.tabs} className="app-tabs">
                {/* Phase A : onglet Scènes remplace Chapitres */}
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "scenes" ? s.tabActive : {}) }} onClick={() => setActiveTab("scenes")}>
                  Scènes ({scenes.length})
                </button>
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "characters" ? s.tabActive : {}) }} onClick={() => setActiveTab("characters")}>
                  Personnages ({characters.length})
                </button>
                <button className="app-tab" style={{ ...s.tab, ...(activeTab === "participants" ? s.tabActive : {}) }} onClick={() => setActiveTab("participants")}>
                  Participants {isMember ? `(${participants.length})` : publicStoryData ? `(${publicStoryData._count.participants})` : ""}
                </button>
              </div>

              {/* ── Tab Scènes (Phase A : remplace Chapitres) */}
              {activeTab === "scenes" && (
                <div>
                  {/* Bannière visiteur */}
                  {isGuest && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(60,60,80,0.07)", border: "1px solid rgba(60,60,80,0.18)", borderRadius: 6, color: C.textMuted, fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                      Vous consultez cette histoire en lecture publique.{" "}
                      <button
                        style={{ background: "none", border: "none", color: C.accent, textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                        onClick={() => setAuthView("register")}
                      >
                        Créer un compte pour participer →
                      </button>
                    </div>
                  )}
                  {/* Bannières connecté — masquées pendant le chargement du membership */}
                  {!isGuest && !membershipPending && !isMember && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(122,76,8,0.08)", border: "1px solid rgba(122,76,8,0.25)", borderRadius: 6, color: "#7a4c08", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                      Vous lisez cette histoire en tant que visiteur.{" "}
                      <button
                        style={{ background: "none", border: "none", color: "#7a4c08", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                        onClick={handleRequestJoin}
                        disabled={requestingJoin || myJoinRequest?.status === "PENDING"}
                      >
                        {myJoinRequest?.status === "PENDING" ? "Demande en attente…" : "Demander à participer →"}
                      </button>
                    </div>
                  )}
                  {!membershipPending && myRole === "VIEWER" && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(122,76,8,0.08)", border: "1px solid rgba(122,76,8,0.25)", borderRadius: 6, color: "#7a4c08", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                      Vous lisez cette histoire en tant que spectateur.{" "}
                      <button
                        style={{ background: "none", border: "none", color: "#7a4c08", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                        onClick={() => setActiveTab("participants")}
                      >
                        Devenir éditeur →
                      </button>
                    </div>
                  )}
                  {/* Bouton ajout scène — visible seulement pour les membres qui peuvent écrire */}
                  {!membershipPending && canWrite && (selectedStory as Story & { status?: ContentStatus }).status !== "DONE" && (!showSceneForm ? (
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
                  ))}

                  {scenes.length === 0 && (
                    <p style={s.mutedCenter}>
                      {canWrite ? "Aucune scène. Commence par en créer une." : "Aucune scène pour l'instant."}
                    </p>
                  )}

                  <div style={s.sceneList}>
                    {sortedScenes.map((sc) => {
                      const sp = allScenePresence[sc.id] ?? [];
                      return (
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
                              {sc._count?.contributions ?? 0} contribution{(sc._count?.contributions ?? 0) !== 1 ? "s" : ""}
                              {sc.characters.length > 0 && (
                                <span style={s.sceneListChars}>
                                  {sc.characters.map((c) => displayName(c)).join(" · ")}
                                </span>
                              )}
                            </div>
                          </div>
                          {sp.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 6 }}>
                              <div style={{ display: "flex" }}>
                                {sp.slice(0, 4).map((u, i) => (
                                  <div key={u.userId} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 4 - i }}>
                                    <PresenceAvatar user={u} size={20} />
                                  </div>
                                ))}
                                {sp.length > 4 && (
                                  <div style={{ marginLeft: -6, zIndex: 0, width: 20, height: 20, borderRadius: "50%", background: "rgba(75,35,5,0.15)", border: "1px solid rgba(255,235,170,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "rgba(75,35,5,0.7)", fontWeight: 600 }}>
                                    +{sp.length - 4}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <span style={s.chapterArrow}>→</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Tab Personnages */}
              {activeTab === "characters" && (
                <div>
                  {canWrite ? (
                    <form onSubmit={handleCreateChar} style={s.inlineForm}>
                      <div style={s.row}>
                        <input style={s.inputDark} placeholder="Nom" value={newChar.name ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))} />
                        <input style={s.inputDark} placeholder="Pseudo / surnom" value={newChar.nickname ?? ""} onChange={(e) => setNewChar((p) => ({ ...p, nickname: e.target.value }))} />
                        <button style={s.btnAccent} type="submit">+ Ajouter</button>
                      </div>
                      <p style={s.hint}>Un nom ou un pseudo suffit pour commencer.</p>
                    </form>
                  ) : (
                    !membershipPending && (
                      <p style={{ ...s.hint, marginBottom: 12 }}>
                        {isGuest ? (
                          <>Créez un compte pour contribuer aux personnages.{" "}
                            <button style={{ background: "none", border: "none", color: C.accent, textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }} onClick={() => setAuthView("register")}>Créer un compte →</button>
                          </>
                        ) : !isMember ? (
                          <>Vous lisez cette histoire en visiteur.{" "}
                            <button style={{ background: "none", border: "none", color: "#7a4c08", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }} onClick={handleRequestJoin} disabled={requestingJoin || myJoinRequest?.status === "PENDING"}>
                              {myJoinRequest?.status === "PENDING" ? "Demande en attente…" : "Demander à participer →"}
                            </button>
                          </>
                        ) : (
                          "Vous êtes en lecture seule. Demandez à devenir éditeur pour contribuer aux personnages."
                        )}
                      </p>
                    )
                  )}

                  {characters.length === 0 && <p style={s.mutedCenter}>Aucun personnage dans cette histoire.</p>}

                  <div style={s.charGrid}>
                    {characters.map((char) => {
                      const hue = avatarHue(displayName(char));
                      const ink = characterInk(hue);
                      const isExpanded = isMember && expandedCharId === char.id;
                      // Auteur = celui qui a créé le personnage.
                      // Cas legacy (userId null) : le OWNER garde les droits admin.
                      const isAuthor = char.userId
                        ? char.userId === currentUser?.id
                        : myRole === "OWNER";
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
                              {char.user && (
                                <p style={{ fontSize: "0.7rem", color: C.textMuted, margin: "0.25rem 0 0", fontStyle: "italic" }}>
                                  Créé par {char.user.displayName || char.user.email?.split("@")[0] || char.user.pseudonym || "Joueur"}
                                </p>
                              )}
                            </div>
                            <div style={s.charActions}>
                              {isMember && (
                                <button style={s.btnMicro} onClick={() => {
                                  if (isExpanded) { setExpandedCharId(null); return; }
                                  setExpandedCharId(char.id);
                                  setCharEdits((p) => ({ ...p, [char.id]: {
                                    name: char.name,
                                    nickname: char.nickname,
                                    role: char.role,
                                    shortDescription: char.shortDescription,
                                    appearance: char.appearance,
                                    outfit: char.outfit,
                                    accessories: char.accessories,
                                    personality: char.personality,
                                    traits: char.traits,
                                    faction: char.faction,
                                    visualNotes: char.visualNotes,
                                  }}));
                                }}>
                                  {isExpanded ? "Fermer" : "Fiche"}
                                </button>
                              )}
                              {isAuthor && (
                                <button style={s.btnDanger} onClick={() => handleDeleteChar(char.id)}>✕</button>
                              )}
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
                                    style={{ ...s.inputDark, ...(!isAuthor ? { opacity: 0.7, cursor: "default" } : {}) }}
                                    value={(charEdits[char.id]?.[field] as string) ?? ""}
                                    onChange={(e) => setCharEdits((p) => ({ ...p, [char.id]: { ...p[char.id], [field]: e.target.value } }))}
                                    readOnly={!isAuthor}
                                  />
                                </div>
                              ))}
                              {isAuthor && (
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <button style={s.btnAccent} onClick={() => handleSaveChar(char)} disabled={savingChar === char.id}>
                                    {savingChar === char.id ? "Sauvegarde…" : "Sauvegarder →"}
                                  </button>
                                </div>
                              )}
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
                  {/* Non-membre ou visiteur : count uniquement, pas de liste nominative */}
                  {!membershipPending && !isMember && (
                    <div style={{ padding: "1rem", background: "rgba(60,60,80,0.05)", border: "1px solid rgba(60,60,80,0.15)", borderRadius: 6, marginBottom: "1rem", textAlign: "center" as const }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "1rem", color: C.textMuted }}>
                        👥 {publicStoryData ? (
                          publicStoryData._count.participants > 0
                            ? `${publicStoryData._count.participants} participant${publicStoryData._count.participants !== 1 ? "s" : ""}`
                            : "Soyez le premier à participer"
                        ) : "Participants"}
                      </p>
                      {isGuest ? (
                        <button
                          style={{ ...s.btnAccent, fontSize: "0.85rem" }}
                          onClick={() => setAuthView("register")}
                        >
                          Créer un compte pour participer →
                        </button>
                      ) : (
                        <button
                          style={{ ...s.btnAccent, fontSize: "0.85rem" }}
                          onClick={handleRequestJoin}
                          disabled={requestingJoin || myJoinRequest?.status === "PENDING"}
                        >
                          {myJoinRequest?.status === "PENDING"
                            ? "Demande en attente de validation…"
                            : requestingJoin ? "Envoi…" : "Demander à participer →"}
                        </button>
                      )}
                    </div>
                  )}

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

                  {/* ── Demandes en attente (propriétaire) */}
                  {myRole === "OWNER" && joinRequests.length > 0 && (
                    <div style={{ marginBottom: "1rem" }}>
                      <p style={{ ...s.formTitle, color: "#c0a060" }}>
                        Demandes de participation ({joinRequests.length})
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {joinRequests.map((req) => {
                          const name = req.user.displayName || req.user.email?.split("@")[0] || req.user.pseudonym || "Joueur";
                          return (
                            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem", background: "rgba(192,160,96,0.08)", border: "1px solid rgba(192,160,96,0.3)", borderRadius: 6 }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#c0a060", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: C.serif, fontSize: "0.92rem", color: C.text, fontWeight: 600 }}>{name}</div>
                                <div style={{ fontSize: "0.76rem", color: C.textMuted }}>{req.user.email ?? req.user.pseudonym ?? "Joueur"} · demande à devenir éditeur</div>
                              </div>
                              <button style={{ ...s.btnAccent, padding: "0.25rem 0.6rem", fontSize: "0.8rem" }} onClick={() => handleRespondToRequest(req.id, "accept")}>
                                Accepter
                              </button>
                              <button style={{ ...s.btnDanger, padding: "0.25rem 0.6rem", fontSize: "0.8rem" }} onClick={() => handleRespondToRequest(req.id, "decline")}>
                                Refuser
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Bouton "Demander à participer" (VIEWER) */}
                  {myRole === "VIEWER" && (
                    <div style={{ marginBottom: "1rem", padding: "0.85rem", background: "rgba(122,76,8,0.06)", border: "1px solid rgba(122,76,8,0.2)", borderRadius: 6 }}>
                      {!myJoinRequest || myJoinRequest.status === "DECLINED" ? (
                        <>
                          <p style={{ margin: "0 0 0.6rem", fontSize: "0.88rem", color: C.textMuted }}>
                            {myJoinRequest?.status === "DECLINED"
                              ? "Ta demande a été refusée. Tu peux en soumettre une nouvelle."
                              : "Tu es lecteur de cette histoire. Tu peux demander à devenir éditeur."}
                          </p>
                          <button style={s.btnAccent} onClick={handleRequestJoin} disabled={requestingJoin}>
                            {requestingJoin ? "Envoi…" : "Devenir éditeur →"}
                          </button>
                        </>
                      ) : myJoinRequest.status === "PENDING" ? (
                        <p style={{ margin: 0, fontSize: "0.88rem", color: "#c0a060" }}>
                          Ta demande est en attente de validation par le propriétaire.
                        </p>
                      ) : (
                        <p style={{ margin: 0, fontSize: "0.88rem", color: "#2e7d32" }}>
                          Ta demande a été acceptée ! Tu es maintenant éditeur.
                        </p>
                      )}
                    </div>
                  )}

                  {isMember && participants.length === 0 && <p style={s.mutedCenter}>Aucun participant chargé.</p>}

                  {isMember && participants.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                    {participants.map((pt) => {
                      const ink = pt.user.color
                        ? { color: pt.user.color, bg: hexToRgba(pt.user.color, 0.07), border: hexToRgba(pt.user.color, 0.35) }
                        : characterInk(avatarHue(pt.user.displayName || pt.user.email || pt.user.pseudonym || "Joueur"));
                      const name = pt.user.displayName || pt.user.email?.split("@")[0] || pt.user.pseudonym || "Joueur";
                      const isMe = currentUser?.id === pt.userId;
                      return (
                        <div key={pt.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem", background: ink.bg, border: `1px solid ${ink.border}`, borderRadius: 6 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: ink.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: C.serif, fontSize: "0.92rem", color: C.text, fontWeight: 600 }}>{name}</div>
                            <div style={{ fontSize: "0.76rem", color: C.textMuted }}>{pt.user.email ?? pt.user.pseudonym ?? "Sans email"}</div>
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
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Scène sélectionnée → vue complète (Phase A : plus besoin de selectedChapter) */}
          {selectedStory && selectedScene && (
            <div style={s.sceneView}>

              {/* Header scène */}
              <div style={s.sceneViewHeader}>
                {/* Barre de navigation : retour + précédente/suivante */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "0.9rem" }}>
                  <button style={{ ...s.backBtn, padding: 0 }} onClick={() => setSelectedScene(null)}>← Scènes</button>
                  {sortedScenes.length > 1 && (
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button
                        style={{ ...s.backBtn, padding: 0, ...(prevScene ? {} : { opacity: 0.3, pointerEvents: "none" as const }) }}
                        onClick={() => prevScene && handleSelectScene(prevScene.id)}
                        disabled={!prevScene}
                      >
                        ‹ Précédente
                      </button>
                      <span style={{ color: "rgba(75,35,5,0.2)", fontSize: "0.7rem", alignSelf: "center" }}>|</span>
                      <button
                        style={{ ...s.backBtn, padding: 0, ...(nextScene ? {} : { opacity: 0.3, pointerEvents: "none" as const }) }}
                        onClick={() => nextScene && handleSelectScene(nextScene.id)}
                        disabled={!nextScene}
                      >
                        Suivante ›
                      </button>
                    </div>
                  )}
                </div>
                {/* Phase A : label chapitre supprimé */}
                <div style={s.sceneViewTitleRow}>
                  <h2 style={s.sceneViewTitle} className="app-scene-title">{selectedScene.title}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    {selectedScene.status === "ACTIVE" && (
                      <FlameIndicator contribCount={(selectedScene.contributions ?? []).length} />
                    )}
                    <span style={{ ...s.statusBadge, ...statusBadgeStyle(selectedScene.status) }}>
                      {statusLabel(selectedScene.status)}
                    </span>
                  </div>
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
                    {(myRole === "OWNER" || myRole === "EDITOR") && (
                      <button style={s.btnMicro} onClick={() => setShowCharSelect((v) => !v)}>
                        {showCharSelect ? "Fermer" : "✏️ Modifier"}
                      </button>
                    )}
                  </div>
                )}
                {selectedScene.characters.length === 0 && (myRole === "OWNER" || myRole === "EDITOR") && (
                  <button style={s.addPersonnageBtn} onClick={() => setShowCharSelect((v) => !v)}>
                    + Ajouter des personnages à cette scène
                  </button>
                )}

                {/* Sélection personnages — OWNER/EDITOR uniquement */}
                {showCharSelect && (myRole === "OWNER" || myRole === "EDITOR") && (
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

              {/* ── Présence dans la scène */}
              {(() => {
                const sp = allScenePresence[selectedScene.id] ?? [];
                if (sp.length === 0) return null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 12px", borderBottom: "1px solid rgba(75,35,5,0.1)", marginBottom: 4 }}>
                    <div style={{ display: "flex" }}>
                      {sp.slice(0, 6).map((u, i) => (
                        <div key={u.userId} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 6 - i }}>
                          <PresenceAvatar user={u} size={26} />
                        </div>
                      ))}
                      {sp.length > 6 && (
                        <div style={{ marginLeft: -8, zIndex: 0, width: 26, height: 26, borderRadius: "50%", background: "rgba(75,35,5,0.15)", border: "2px solid rgba(255,235,170,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "rgba(75,35,5,0.7)", fontWeight: 600 }}>
                          +{sp.length - 6}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, opacity: 0.5, fontStyle: "italic" }}>
                      {scenePresenceLabel(sp)}
                    </span>
                  </div>
                );
              })()}

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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                <button
                  style={{ ...s.viewToggleBtn, border: "1px solid rgba(75,35,5,0.2)", borderRadius: 4, padding: "0.35rem 0.8rem" }}
                  onClick={() => setIsReading(true)}
                  title="Mode lecture immersif"
                >
                  📖 Lire
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
                    const emptyMsg = spectatorView
                      ? "Aucun texte visible pour les spectateurs selon les paramètres actuels."
                      : isGuest
                        ? "Aucune contribution pour l'instant. Créez un compte pour participer."
                        : !isMember
                          ? "Aucune contribution pour l'instant. Demandez à participer pour contribuer."
                          : myRole === "VIEWER"
                            ? "Aucune contribution pour l'instant. Demandez à devenir éditeur pour contribuer."
                            : "Aucune contribution encore. Soyez le premier à écrire !";
                    return <div style={s.contribEmpty}>{emptyMsg}</div>;
                  }

                  return visible.map((contrib) => {
                    const ink = resolveInk(contrib);
                    const isOwn = !!currentUser && contrib.userId === currentUser.id;
                    const isEditing = editingContribId === contrib.id;
                    return (
                      <div key={contrib.id} style={{ ...s.contribBubble, borderLeft: `3px solid ${ink.border}`, background: ink.bg }} className="contrib-bubble app-contrib-bubble">
                        <div style={{ ...s.avatarSm, background: ink.color, border: `2px solid ${ink.border}`, boxShadow: "0 0 0 2px rgba(255,235,170,0.3), 0 2px 8px rgba(0,0,0,0.15)" }}>
                          {contribInitial(contrib)}
                        </div>
                        <div style={s.contribBody}>
                          <div style={s.contribMeta}>
                            <span style={{ ...s.contribAuthor, color: ink.color }}>{contribAuthor(contrib)}</span>
                            <span style={s.contribTime}>{formatTime(contrib.createdAt)}</span>
                            {!spectatorView && isOwn && !isEditing && (
                              <button style={s.contribAction} onClick={() => handleStartEdit(contrib)} title="Modifier">✎</button>
                            )}
                            {!spectatorView && (isOwn || myRole === "OWNER") && (
                              <button style={s.contribDelete} onClick={() => handleDeleteContrib(contrib.id)} title="Supprimer">✕</button>
                            )}
                            {currentUser && !isOwn && !isEditing && (
                              <button style={s.reportBtn} onClick={() => setReportTarget({ targetType: "CONTRIBUTION", targetId: contrib.id })} title="Signaler">🚩</button>
                            )}
                          </div>
                          {isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.3rem" }}>
                              <textarea
                                style={{ ...s.contribText, border: "1px solid rgba(75,35,5,0.25)", borderRadius: "4px", padding: "0.4rem 0.5rem", background: "rgba(255,248,220,0.5)", resize: "vertical" as const, minHeight: "4rem" }}
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit();
                                  if (e.key === "Escape") handleCancelEdit();
                                }}
                                autoFocus
                              />
                              <div style={{ display: "flex", gap: "0.4rem" }}>
                                <button style={s.contribSaveBtn} onClick={handleSaveEdit}>Enregistrer</button>
                                <button style={s.contribCancelBtn} onClick={handleCancelEdit}>Annuler</button>
                              </div>
                            </div>
                          ) : (
                            <p style={s.contribText}>{contrib.content}</p>
                          )}
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

              {/* ── Message du Maître du jeu IA */}
              {gmSuggestion && (
                <div style={{
                  margin: "0.75rem 0",
                  padding: "0.85rem 1rem",
                  background: "rgba(40,20,5,0.55)",
                  border: "1px solid rgba(192,160,96,0.45)",
                  borderLeft: "3px solid #c0a060",
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.65rem",
                }}>
                  <span style={{ fontSize: "1.1rem", flexShrink: 0, lineHeight: 1.4 }}>🎭</span>
                  <div style={{ flex: 1, minWidth: 0, overflow: "visible" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", color: "#c0a060", textTransform: "uppercase" as const, marginBottom: "0.3rem" }}>
                      Maître du jeu
                    </div>
                    <p style={{ margin: 0, fontStyle: "italic", color: "rgba(255,235,170,0.88)", fontSize: "0.92rem", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                      {gmSuggestion}
                    </p>
                  </div>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(192,160,96,0.5)", fontSize: "0.8rem", padding: "0 0.1rem", flexShrink: 0, lineHeight: 1 }}
                    onClick={() => setGmSuggestion(null)}
                    title="Fermer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* ── Indicateur "en train d'écrire…" — toujours dans le DOM pour éviter le layout shift */}
              <p style={{ margin: "0 0 8px", minHeight: 18, fontSize: 12, fontStyle: "italic", opacity: typingUsers.length > 0 ? 0.5 : 0, color: "inherit", transition: "opacity 0.15s ease" }}>
                {typingLabel(typingUsers)}
              </p>

              {/* ── Alerte changement de rôle (downgrade en direct ou après refresh) */}
              {!spectatorView && selectedScene.status === "ACTIVE" && myRole === "VIEWER" && roleDowngradeAlert && (
                <div style={{ padding: "1rem 1.1rem", background: "rgba(180,60,20,0.07)", border: "1.5px solid rgba(180,60,20,0.3)", borderRadius: 8, color: "#8b3a0f", fontSize: "0.9rem" }}>
                  <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>Votre rôle a changé — vous êtes maintenant en lecture seule.</p>
                  {roleDowngradeDraft ? (
                    <>
                      <p style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", opacity: 0.85 }}>Votre texte a été conservé temporairement pour éviter toute perte.</p>
                      <textarea
                        readOnly
                        value={roleDowngradeDraft}
                        rows={4}
                        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "0.5rem 0.6rem", borderRadius: 5, border: "1px solid rgba(180,60,20,0.25)", background: "rgba(180,60,20,0.04)", color: "inherit", fontSize: "0.88rem", fontFamily: "inherit", marginBottom: "0.75rem" }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          style={{ padding: "0.35rem 0.9rem", borderRadius: 5, border: "1px solid rgba(180,60,20,0.35)", background: "transparent", color: "#8b3a0f", cursor: "pointer", fontSize: "0.85rem" }}
                          onClick={() => { navigator.clipboard.writeText(roleDowngradeDraft ?? ""); }}
                        >
                          Copier le texte
                        </button>
                        <button
                          style={{ padding: "0.35rem 0.9rem", borderRadius: 5, border: "none", background: "rgba(180,60,20,0.12)", color: "#8b3a0f", cursor: "pointer", fontSize: "0.85rem" }}
                          onClick={() => {
                            const blob = new Blob([roleDowngradeDraft ?? ""], { type: "text/plain" });
                            const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                            a.download = `brouillon-scene-${selectedScene.id}.txt`; a.click();
                          }}
                        >
                          Télécharger
                        </button>
                        <button
                          style={{ padding: "0.35rem 0.9rem", borderRadius: 5, border: "none", background: "transparent", color: "#8b3a0f", cursor: "pointer", fontSize: "0.85rem", marginLeft: "auto", opacity: 0.7 }}
                          onClick={() => {
                            setRoleDowngradeAlert(false);
                            localStorage.removeItem(`sf_draft_${currentUser?.id}_${selectedScene.id}`);
                            setRoleDowngradeDraft(null);
                            setContribContent("");
                          }}
                        >
                          J'ai compris ✕
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      style={{ padding: "0.35rem 0.9rem", borderRadius: 5, border: "none", background: "transparent", color: "#8b3a0f", cursor: "pointer", fontSize: "0.85rem", opacity: 0.7, paddingLeft: 0 }}
                      onClick={() => setRoleDowngradeAlert(false)}
                    >
                      J'ai compris ✕
                    </button>
                  )}
                </div>
              )}

              {/* ── Bandeau lecture seule (sans alerte active) */}
              {!membershipPending && !spectatorView && selectedScene.status === "ACTIVE" && myRole === "VIEWER" && !roleDowngradeAlert && (
                <div style={{ padding: "0.75rem 1rem", background: "rgba(122,76,8,0.08)", border: "1px solid rgba(122,76,8,0.25)", borderRadius: 6, color: "#7a4c08", fontSize: "0.88rem", textAlign: "center" }}>
                  {myJoinRequest?.status === "PENDING" ? (
                    "Ta demande est en attente de validation par le propriétaire."
                  ) : myJoinRequest?.status === "ACCEPTED" ? (
                    "Ta demande a été acceptée ! Recharge la page pour écrire."
                  ) : (
                    <>
                      Vous êtes en lecture seule.{" "}
                      <button
                        style={{ background: "none", border: "none", color: "#7a4c08", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                        onClick={() => { setActiveTab("participants"); setSelectedScene(null); }}
                        disabled={requestingJoin}
                      >
                        Devenir éditeur →
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── Histoire terminée — contributions bloquées */}
              {!spectatorView && selectedScene.status === "ACTIVE" && (myRole === "OWNER" || myRole === "EDITOR") && (selectedStory as Story & { status?: ContentStatus }).status === "DONE" && (
                <div style={s.closedBanner}>
                  🔒 Cette histoire est terminée — les contributions ne sont plus acceptées.
                </div>
              )}

              {/* ── Zone d'écriture (OWNER / EDITOR, scène ACTIVE seulement) */}
              {!spectatorView && selectedScene.status === "ACTIVE" && (myRole === "OWNER" || myRole === "EDITOR") && (selectedStory as Story & { status?: ContentStatus }).status !== "DONE" && (() => {
                const isTurnMode = selectedScene.mode === "TURN";
                const isMyTurn = !isTurnMode || selectedScene.currentTurnUserId === currentUser?.id;
                const turnParticipant = isTurnMode && !isMyTurn
                  ? participants.find((p) => p.userId === selectedScene.currentTurnUserId)
                  : null;
                const turnName = turnParticipant?.user.displayName || turnParticipant?.user.email?.split("@")[0] || turnParticipant?.user.pseudonym || "…";
                return (
                  <div style={s.writeArea} className="write-area app-write-area">
                    {/* Indicateur de tour */}
                    {isTurnMode && (
                      <div style={{
                        padding: "0.5rem 0.75rem",
                        borderRadius: 6,
                        marginBottom: "0.6rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        background: isMyTurn ? "rgba(25,72,32,0.10)" : "rgba(122,76,8,0.08)",
                        color: isMyTurn ? "#194820" : "#7a4c08",
                        border: `1px solid ${isMyTurn ? "rgba(45,115,55,0.34)" : "rgba(160,100,20,0.34)"}`,
                      }}>
                        {isMyTurn ? "👉 C'est votre tour d'écrire" : `⏳ Ce n'est pas votre tour — Tour de : ${turnName}`}
                      </div>
                    )}

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
                        disabled={!isMyTurn}
                      >
                        <option value="">— Aucun personnage —</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>{displayName(c)}{c.role ? ` (${c.role})` : ""}</option>
                        ))}
                      </select>
                    )}

                    <textarea
                      style={{ ...s.writeTextarea, ...(!isMyTurn ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
                      placeholder={isMyTurn ? "Écris ta contribution narrative ici…" : "En attente de votre tour…"}
                      value={contribContent}
                      onChange={(e) => { if (isMyTurn) { setContribContent(e.target.value); handleTyping(); } }}
                      onKeyDown={(e) => {
                        if (isMyTurn && e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitContrib();
                      }}
                      readOnly={!isMyTurn}
                      rows={4}
                    />

                    <div style={s.writeActions}>
                      <button style={s.btnAccent} onClick={handleSubmitContrib} disabled={submittingContrib || !contribContent.trim() || !isMyTurn}>
                        {submittingContrib ? "Envoi…" : "Contribuer"}
                      </button>
                      <button style={s.btnGhost} onClick={handleSuggestIdea} disabled={suggestingIdea}>
                        {suggestingIdea ? "…" : "💡 Idée"}
                      </button>
                      <button style={s.btnGhost} onClick={handleGenerateImage} disabled={generatingImage}>
                        {generatingImage ? "…" : "🎨 Illustrer"}
                      </button>
                    </div>

                    <p style={s.writeHint}>⌘↵ ou Ctrl+↵ pour envoyer</p>
                  </div>
                );
              })()}

              {/* ── Navigation bas de page */}
              {sortedScenes.length > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1.25rem", borderTop: "1px solid rgba(75,35,5,0.12)" }}>
                  <button
                    style={{ ...s.btnGhost, ...(prevScene ? {} : { opacity: 0.3, pointerEvents: "none" as const }) }}
                    onClick={() => prevScene && handleSelectScene(prevScene.id)}
                    disabled={!prevScene}
                  >
                    ← {prevScene?.title ?? ""}
                  </button>
                  <span style={{ fontSize: "0.68rem", color: C.textMuted, fontFamily: C.ui, letterSpacing: "0.08em" }}>
                    {sceneNavIndex + 1} / {sortedScenes.length}
                  </span>
                  <button
                    style={{ ...s.btnGhost, ...(nextScene ? {} : { opacity: 0.3, pointerEvents: "none" as const }) }}
                    onClick={() => nextScene && handleSelectScene(nextScene.id)}
                    disabled={!nextScene}
                  >
                    {nextScene?.title ?? ""} →
                  </button>
                </div>
              )}

              {/* ── Paramètres de la scène — OWNER toujours visible, quel que soit le statut */}
              {!spectatorView && myRole === "OWNER" && (
                <div style={{ marginTop: "0.75rem" }}>
                  <button style={s.btnGhost} onClick={() => setShowSettings((v) => !v)}>
                    ⚙ Paramètres
                  </button>
                  {showSettings && (
                    <div style={{ ...s.settingsBox, marginTop: "0.5rem" }}>
                      <p style={s.settingsTitle}>Paramètres de la scène</p>
                      <div style={s.settingsRow}>
                        <label style={s.settingsLabel} className="app-settings-label">Statut</label>
                        <select style={s.selectDark} value={settingsEdit.status} onChange={(e) =>
                          setSettingsEdit((p) => ({ ...p, status: e.target.value as SceneStatus }))
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
                      <div style={s.settingsRow}>
                        <label style={s.settingsLabel} className="app-settings-label">Mode d'écriture</label>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            style={{
                              padding: "0.25rem 0.7rem", borderRadius: 5, fontSize: "0.82rem", cursor: "pointer",
                              border: `1px solid ${settingsEdit.mode === "FREE" ? C.accentLight : C.border}`,
                              background: settingsEdit.mode === "FREE" ? C.accentGlow : "transparent",
                              color: settingsEdit.mode === "FREE" ? C.accent : C.textMuted,
                              fontWeight: settingsEdit.mode === "FREE" ? 600 : 400,
                            }}
                            onClick={() => { if (settingsEdit.mode !== "FREE") handleToggleMode("FREE"); }}
                          >
                            Mode libre
                          </button>
                          <button
                            style={{
                              padding: "0.25rem 0.7rem", borderRadius: 5, fontSize: "0.82rem", cursor: "pointer",
                              border: `1px solid ${settingsEdit.mode === "TURN" ? C.accentLight : C.border}`,
                              background: settingsEdit.mode === "TURN" ? C.accentGlow : "transparent",
                              color: settingsEdit.mode === "TURN" ? C.accent : C.textMuted,
                              fontWeight: settingsEdit.mode === "TURN" ? 600 : 400,
                            }}
                            onClick={() => { if (settingsEdit.mode !== "TURN") handleToggleMode("TURN"); }}
                          >
                            Tour par tour
                          </button>
                        </div>
                      </div>
                      <button style={s.btnAccent} onClick={handleSaveSettings} disabled={savingSettings}>
                        {savingSettings ? "Sauvegarde…" : "Appliquer"}
                      </button>
                      <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${C.border}` }}>
                        <button
                          style={{ ...s.btnGhost, color: C.danger, borderColor: "rgba(139,26,10,0.3)", fontSize: "0.82rem" }}
                          onClick={handleDeleteScene}
                        >
                          🗑 Supprimer cette scène
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportTarget(null)}
          onSuccess={() => {
            setReportTarget(null);
            setToasts((prev) => [...prev, { id: ++toastIdRef.current, type: "scene" as const, message: "Signalement envoyé. Merci." }].slice(-5));
          }}
          onError={(err) => addErrorToast(err)}
        />
      )}

      {/* Mode lecture immersif */}
      {isReading && selectedScene && (
        <SceneReader
          scene={selectedScene}
          chapterTitle={selectedChapter?.title}
          storyTitle={selectedStory?.title}
          onClose={() => setIsReading(false)}
        />
      )}

      {showWorldMap && <WorldMap onClose={() => setShowWorldMap(false)} />}
    </div>
  );
}

// ─── NotifPanel ───────────────────────────────────────────────────────────────
function NotifPanel({
  notifications,
  onMarkRead,
  onClose,
}: {
  notifications: AppNotification[];
  onMarkRead: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Overlay invisible pour fermer en cliquant dehors */}
      <div style={{ position: "fixed", inset: 0, zIndex: 10019 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 58, right: "1rem",
        width: "min(320px, calc(100vw - 2rem))", maxHeight: 420, overflowY: "auto" as const,
        background: "rgba(252,244,215,0.99)",
        border: "1px solid rgba(75,35,5,0.22)",
        borderRadius: 8,
        boxShadow: "0 8px 28px rgba(75,35,5,0.18)",
        zIndex: 10020,
        fontFamily: "'Jost', system-ui, sans-serif",
      }}>
        <div style={{ padding: "0.65rem 0.85rem", borderBottom: "1px solid rgba(75,35,5,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#180b01" }}>Notifications</span>
          {notifications.filter((n) => !n.isRead).length > 0 && (
            <span style={{ fontSize: "0.72rem", color: "rgba(75,35,5,0.55)" }}>
              {notifications.filter((n) => !n.isRead).length} non lue{notifications.filter((n) => !n.isRead).length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {notifications.length === 0 ? (
          <p style={{ margin: 0, padding: "1rem 0.85rem", fontSize: "0.82rem", color: "rgba(75,35,5,0.55)" }}>
            Aucune notification.
          </p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              style={{
                padding: "0.6rem 0.85rem",
                borderBottom: "1px solid rgba(75,35,5,0.07)",
                background: n.isRead ? "transparent" : "rgba(60,30,106,0.04)",
                display: "flex", flexDirection: "column" as const, gap: "0.2rem",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.83rem", lineHeight: 1.45, color: "#180b01" }}>{n.message}</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", color: "rgba(75,35,5,0.45)" }}>{fmt(n.createdAt)}</span>
                {!n.isRead && (
                  <button
                    onClick={() => onMarkRead(n.id)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: "0.72rem", color: "#3c1e6a", padding: 0, fontFamily: "inherit",
                    }}
                  >
                    Marquer comme lu
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
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
  headerBrand: { fontSize: "0.85rem", fontWeight: 700, color: C.text, cursor: "pointer", letterSpacing: "0.1em", flexShrink: 0, fontFamily: C.display },
  headerBrandSep: { width: 1, height: "1.1rem", background: "rgba(75,35,5,0.25)", flexShrink: 0, alignSelf: "center" },
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

  // Homepage vivante
  homepage: { maxWidth: 640, margin: "0 auto", padding: "2rem 0" },
  homepageHead: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "0.9rem", textAlign: "center" as const, marginBottom: "2.5rem" },
  homepagePulse: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.success },
  pulseDot: { width: 6, height: 6, borderRadius: "50%", background: "#4caf50", display: "inline-block", flexShrink: 0 },
  homepageSection: { marginBottom: "2rem" },
  homepageSectionLabel: { fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: C.textMuted, margin: "0 0 0.75rem", fontFamily: C.ui },
  homepageStoryRow: { display: "flex", alignItems: "center", gap: 10, padding: "0.75rem 1rem", cursor: "pointer", borderRadius: 4, background: "rgba(75,35,5,0.04)", border: `1px solid ${C.border}`, marginBottom: "0.45rem", transition: "background 0.1s" },
  homepageStoryTitle: { fontFamily: C.serif, fontSize: "1rem", color: C.text, fontWeight: 500, lineHeight: 1.3 },
  homepageStoryDesc: { fontSize: "0.78rem", color: C.textMuted, marginTop: 2, lineHeight: 1.35 },
  homepageStoryTime: { fontSize: 11, color: C.textMuted, flexShrink: 0, whiteSpace: "nowrap" as const },
  activityFeed: { display: "flex", flexDirection: "column" as const },
  activityItem: { display: "flex", alignItems: "baseline", gap: "0.5rem", fontSize: 13, padding: "0.5rem 0", borderBottom: `1px solid rgba(75,35,5,0.07)`, lineHeight: 1.5 },
  activityDot: { color: C.textMuted, fontWeight: 700, flexShrink: 0, width: 12, textAlign: "center" as const },
  activityBody: { flex: 1, color: C.textSub },
  activityMeta: { color: C.textMuted, fontSize: 12 },
  activityTime: { fontSize: 11, color: C.textMuted, flexShrink: 0, whiteSpace: "nowrap" as const },

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
  contribDelete: { marginLeft: "0.1rem", background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.75rem", opacity: 0.35, padding: "0.1rem 0.3rem" },
  contribAction: { marginLeft: "auto", background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.8rem", opacity: 0.45, padding: "0.1rem 0.3rem" },
  reportBtn: { marginLeft: "0.1rem", background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: "0.72rem", opacity: 0.3, padding: "0.1rem 0.3rem" },
  contribSaveBtn: { fontSize: "0.72rem", padding: "0.25rem 0.65rem", background: "rgba(75,35,5,0.12)", border: "1px solid rgba(75,35,5,0.25)", borderRadius: "4px", cursor: "pointer", color: C.text, fontFamily: C.ui },
  contribCancelBtn: { fontSize: "0.72rem", padding: "0.25rem 0.65rem", background: "transparent", border: "1px solid rgba(75,35,5,0.15)", borderRadius: "4px", cursor: "pointer", color: C.textMuted, fontFamily: C.ui },
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
