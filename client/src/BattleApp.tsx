import { useState, useEffect, useRef } from "react";
import { api } from "./api";
import type { AuthUser, Battle, BattleListItem, BattleMove, BattleVote, BattleVisibility, BattleInviteRole, BattleInviteWithContext } from "./api";
import { socket } from "./socket";

// ── Couleurs / styles ────────────────────────────────────────────────────────

const C = {
  bg: "#12111a",
  surface: "#1c1b27",
  border: "#2e2b40",
  accent: "#c9a84c",
  accentDim: "rgba(201,168,76,0.15)",
  text: "#e8e0d0",
  textMuted: "#7a7590",
  red: "#c0392b",
  redDim: "rgba(192,57,43,0.15)",
  green: "#27ae60",
  greenDim: "rgba(39,174,96,0.12)",
  blue: "#2980b9",
  blueDim: "rgba(41,128,185,0.12)",
} as const;

const s = {
  root: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Georgia', serif", padding: "0 0 4rem" },
  header: { display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.5rem", borderBottom: `1px solid ${C.border}`, background: C.surface } as React.CSSProperties,
  backBtn: { background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: "0.9rem", padding: "0.3rem 0.6rem", borderRadius: 4 } as React.CSSProperties,
  title: { fontSize: "1.1rem", fontWeight: 600, color: C.text, margin: 0 },
  content: { maxWidth: 760, margin: "0 auto", padding: "1.5rem" },
  sectionLabel: { fontSize: "0.7rem", textTransform: "uppercase" as const, letterSpacing: "0.1em", color: C.textMuted, marginBottom: "0.75rem", marginTop: 0 },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1rem" },
  row: { display: "flex", gap: "0.75rem", alignItems: "center" },
  btn: { padding: "0.5rem 1.1rem", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "0.88rem", fontFamily: "inherit" } as React.CSSProperties,
  btnPrimary: { background: C.accent, color: "#1a1508" } as React.CSSProperties,
  btnGhost: { background: "transparent", color: C.textMuted, border: `1px solid ${C.border}` } as React.CSSProperties,
  btnDanger: { background: C.red, color: "#fff" } as React.CSSProperties,
  btnGreen: { background: C.green, color: "#fff" } as React.CSSProperties,
  input: { background: "#0e0d18", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "0.5rem 0.75rem", fontSize: "0.9rem", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
  textarea: { background: "#0e0d18", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "0.6rem 0.75rem", fontSize: "0.9rem", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const, minHeight: 80 },
  badge: (color: string, bg: string) => ({
    display: "inline-block", fontSize: "0.7rem", padding: "0.2rem 0.55rem",
    borderRadius: 4, background: bg, color, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em",
  }),
  muted: { color: C.textMuted, fontSize: "0.88rem" },
  hint: { color: C.textMuted, fontSize: "0.82rem", margin: "0.4rem 0 0" },
  divider: { border: "none", borderTop: `1px solid ${C.border}`, margin: "1.25rem 0" },
  moveItem: { borderLeft: `3px solid ${C.border}`, paddingLeft: "0.85rem", marginBottom: "1rem" } as React.CSSProperties,
  moveAttacker: { borderLeft: `3px solid ${C.accent}` } as React.CSSProperties,
  moveDefender: { borderLeft: `3px solid ${C.blue}` } as React.CSSProperties,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const displayName = (u: { displayName?: string | null; email: string }) =>
  u.displayName || u.email.split("@")[0];

const statusLabel: Record<string, string> = {
  WAITING: "En attente d'un adversaire",
  ACTIVE: "Duel en cours",
  VOTING: "Vote en cours",
  DONE: "Partie terminée",
};

const statusLabelShort: Record<string, string> = {
  WAITING: "En attente",
  ACTIVE: "En cours",
  VOTING: "Vote",
  DONE: "Terminée",
};

const statusColor: Record<string, [string, string]> = {
  WAITING: [C.textMuted, "rgba(120,115,140,0.18)"],
  ACTIVE: [C.green, C.greenDim],
  VOTING: [C.accent, C.accentDim],
  DONE: [C.accent, C.accentDim],
};

// ── Injection CSS animations ──────────────────────────────────────────────────

function ensureBattleStyles() {
  if (typeof document === "undefined" || document.getElementById("battle-anim")) return;
  const el = document.createElement("style");
  el.id = "battle-anim";
  el.textContent = `
    @keyframes battleWin {
      from { opacity: 0; transform: scale(0.88) translateY(12px); }
      to   { opacity: 1; transform: scale(1)    translateY(0); }
    }
    @keyframes victoryPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); }
      50%       { box-shadow: 0 0 48px 8px rgba(201,168,76,0.22); }
    }
  `;
  document.head.appendChild(el);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  currentUser: AuthUser | null;
  onBack: () => void;
}

// ══════════════════════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════════════════════

export default function BattleApp({ currentUser, onBack }: Props) {
  ensureBattleStyles();

  const [view, setView] = useState<"list" | "detail">("list");
  const [battles, setBattles] = useState<BattleListItem[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newVisibility, setNewVisibility] = useState<BattleVisibility>("PRIVATE");
  const [creating, setCreating] = useState(false);

  // Move
  const [moveContent, setMoveContent] = useState("");
  const [submittingMove, setSubmittingMove] = useState(false);

  // Vote
  const [startingVote, setStartingVote] = useState(false);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [joining, setJoining] = useState(false);

  // Invitations
  const [myInvites, setMyInvites] = useState<BattleInviteWithContext[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BattleInviteRole>("SPECTATOR");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const selectedBattleRef = useRef<Battle | null>(null);
  useEffect(() => { selectedBattleRef.current = selectedBattle; }, [selectedBattle]);

  // ── Charge la liste ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    api.battles.list()
      .then(setBattles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api.battleInvites.mine()
      .then(setMyInvites)
      .catch(() => {/* silencieux */});
  }, [currentUser]);

  // ── Écoute socket globale (liste) ──────────────────────────────────────────

  useEffect(() => {
    const onBattleCreated = (raw: BattleListItem & { moves?: unknown[]; votes?: unknown[] }) => {
      // Le serveur peut envoyer un objet battleDetailInclude (avec moves/votes arrays)
      // ou battleListInclude (avec _count). On normalise pour garantir _count.
      const battle: BattleListItem = {
        ...raw,
        _count: raw._count ?? {
          moves: raw.moves?.length ?? 0,
          votes: raw.votes?.length ?? 0,
        },
      };
      setBattles((prev) => prev.some((b) => b.id === battle.id) ? prev : [battle, ...prev]);
    };
    const onBattleUpdated = ({ id, status, defenderId, winner }: Partial<BattleListItem> & { id: string }) => {
      setBattles((prev) => prev.map((b) =>
        b.id === id ? { ...b, ...(status && { status }), ...(defenderId !== undefined && { defenderId }), ...(winner !== undefined && { winner }) } : b
      ));
    };
    const onBattleInvited = ({ invite, battle }: { invite: BattleInviteWithContext; battle: unknown }) => {
      void battle;
      setMyInvites((prev) => prev.some((i) => i.id === invite.id) ? prev : [invite, ...prev]);
    };

    socket.on("battle:created", onBattleCreated);
    socket.on("battle:updated", onBattleUpdated);
    socket.on("battle:invited", onBattleInvited);
    return () => {
      socket.off("battle:created", onBattleCreated);
      socket.off("battle:updated", onBattleUpdated);
      socket.off("battle:invited", onBattleInvited);
    };
  }, []);

  // ── Écoute socket room battle (détail) ─────────────────────────────────────

  useEffect(() => {
    if (!selectedBattle) return;
    const battleId = selectedBattle.id;
    socket.emit("battle:join", { battleId });

    const onJoined = (battle: Battle) => {
      setSelectedBattle(battle);
    };

    const onMoveCreated = ({ move, turnCount, currentTurnUserId, status }: {
      battleId: string; move: BattleMove; turnCount: number; currentTurnUserId: string | null; status: Battle["status"];
    }) => {
      setSelectedBattle((prev) => {
        if (!prev) return prev;
        const prevMoves = prev.moves ?? [];
        const already = prevMoves.some((m) => m.id === move.id);
        return {
          ...prev,
          moves: already ? prevMoves : [...prevMoves, move],
          votes: prev.votes ?? [],
          turnCount,
          currentTurnUserId,
          status,
        };
      });
    };

    const onStatusUpdated = ({ status, currentTurnUserId }: { battleId: string; status: Battle["status"]; currentTurnUserId: string | null }) => {
      setSelectedBattle((prev) => prev ? { ...prev, status, currentTurnUserId } : prev);
    };

    const onVoted = ({ vote, voteCount }: { battleId: string; vote: BattleVote; voteCount: { yes: number; no: number; total: number } }) => {
      setSelectedBattle((prev) => {
        if (!prev) return prev;
        const prevVotes = prev.votes ?? [];
        const already = prevVotes.some((v) => v.id === vote.id);
        if (already) return prev;
        void voteCount;
        return { ...prev, votes: [...prevVotes, vote], moves: prev.moves ?? [] };
      });
    };

    const onFinished = ({ status, winner }: { battleId: string; status: Battle["status"]; winner: Battle["winner"] }) => {
      setSelectedBattle((prev) => prev ? { ...prev, status, winner } : prev);
    };

    socket.on("battle:joined", onJoined);
    socket.on("battle:moveCreated", onMoveCreated);
    socket.on("battle:statusUpdated", onStatusUpdated);
    socket.on("battle:voted", onVoted);
    socket.on("battle:finished", onFinished);

    return () => {
      socket.emit("battle:leave", { battleId });
      socket.off("battle:joined", onJoined);
      socket.off("battle:moveCreated", onMoveCreated);
      socket.off("battle:statusUpdated", onStatusUpdated);
      socket.off("battle:voted", onVoted);
      socket.off("battle:finished", onFinished);
    };
  }, [selectedBattle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectBattle = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const battle = await api.battles.get(id);
      setSelectedBattle(battle);
      setMoveContent("");
      setView("detail");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newGoal.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.battles.create({ title: newTitle.trim(), goal: newGoal.trim(), visibility: newVisibility });
      // Refetch explicite pour garantir le détail complet (moves:[], votes:[])
      const full = await api.battles.get(created.id);
      setNewTitle("");
      setNewGoal("");
      setNewVisibility("PRIVATE");
      setShowCreateForm(false);
      setMoveContent("");
      setSelectedBattle(full);
      setView("detail");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!selectedBattle) return;
    setJoining(true);
    setError(null);
    try {
      const updated = await api.battles.join(selectedBattle.id);
      setSelectedBattle(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBattle || !moveContent.trim()) return;
    setSubmittingMove(true);
    setError(null);
    try {
      const { move, updatedBattle } = await api.battles.createMove(selectedBattle.id, moveContent.trim());
      setMoveContent("");
      setSelectedBattle((prev) => {
        if (!prev) return prev;
        const prevMoves = prev.moves ?? [];
        const already = prevMoves.some((m) => m.id === move.id);
        return {
          ...prev,
          moves: already ? prevMoves : [...prevMoves, move],
          votes: prev.votes ?? [],
          turnCount: updatedBattle.turnCount,
          currentTurnUserId: updatedBattle.currentTurnUserId,
          status: updatedBattle.status,
        };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmittingMove(false);
    }
  };

  const handleStartVoting = async () => {
    if (!selectedBattle) return;
    setStartingVote(true);
    setError(null);
    try {
      const updated = await api.battles.startVoting(selectedBattle.id);
      setSelectedBattle(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStartingVote(false);
    }
  };

  const handleVote = async (vote: boolean) => {
    if (!selectedBattle) return;
    setVoting(true);
    setError(null);
    try {
      const newVote = await api.battles.castVote(selectedBattle.id, vote);
      setSelectedBattle((prev) => {
        if (!prev) return prev;
        const prevVotes = prev.votes ?? [];
        const already = prevVotes.some((v) => v.id === newVote.id);
        return already ? prev : { ...prev, votes: [...prevVotes, newVote], moves: prev.moves ?? [] };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVoting(false);
    }
  };

  const handleCloseVoting = async () => {
    if (!selectedBattle) return;
    setClosing(true);
    setError(null);
    try {
      const updated = await api.battles.closeVoting(selectedBattle.id);
      setSelectedBattle(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClosing(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBattle || !inviteEmail.trim()) return;
    setSendingInvite(true);
    setError(null);
    try {
      await api.battles.invite(selectedBattle.id, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setShowInviteForm(false);
      // Refetch pour mettre à jour la liste des invites dans le détail
      const updated = await api.battles.get(selectedBattle.id);
      setSelectedBattle(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string, battleId: string) => {
    try {
      await api.battleInvites.accept(inviteId);
      setMyInvites((prev) => prev.filter((i) => i.id !== inviteId));
      // Ouvrir la battle
      await handleSelectBattle(battleId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await api.battleInvites.decline(inviteId);
      setMyInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── Guard non-connecté ─────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={onBack}>← Histoires</button>
          <p style={s.title}>⚔ Battle</p>
        </div>
        <div style={{ ...s.content, textAlign: "center", paddingTop: "3rem" }}>
          <p style={s.muted}>Connectez-vous pour accéder au mode Battle.</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Vue liste
  // ══════════════════════════════════════════════════════════════════════════

  if (view === "list") {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={onBack}>← Histoires</button>
          <p style={s.title}>⚔ Battle</p>
        </div>

        <div style={s.content}>
          {error && <p style={{ color: C.red, fontSize: "0.88rem", marginBottom: "1rem" }}>{error}</p>}

          {/* Formulaire de création */}
          {showCreateForm ? (
            <div style={s.card}>
              <p style={{ ...s.sectionLabel, marginBottom: "0.75rem" }}>Nouvelle battle</p>
              <form onSubmit={handleCreate}>
                <div style={{ ...s.card, background: C.blueDim, borderColor: C.blue, marginBottom: "0.75rem" }}>
                  <p style={{ ...s.muted, margin: 0, fontSize: "0.82rem", lineHeight: 1.6 }}>
                    Pour conclure une battle : 2 joueurs sont nécessaires · au moins 3 spectateurs doivent voter · les joueurs ne participent pas au vote.
                  </p>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ ...s.muted, display: "block", marginBottom: "0.3rem" }}>Titre</label>
                  <input
                    style={s.input}
                    placeholder="Nom du duel"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ ...s.muted, display: "block", marginBottom: "0.3rem" }}>Objectif</label>
                  <textarea
                    style={s.textarea}
                    placeholder="Quel est l'objectif que l'attaquant doit atteindre ?"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    required
                  />
                  <p style={s.hint}>L'attaquant gagne si le public juge que l'objectif a été atteint.</p>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ ...s.muted, display: "block", marginBottom: "0.4rem" }}>Visibilité</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {(["PRIVATE", "PUBLIC"] as BattleVisibility[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        style={{
                          ...s.btn,
                          ...(newVisibility === v ? s.btnPrimary : s.btnGhost),
                          fontSize: "0.82rem",
                        }}
                        onClick={() => setNewVisibility(v)}
                      >
                        {v === "PRIVATE" ? "🔒 Privée" : "🌐 Publique"}
                      </button>
                    ))}
                  </div>
                  <p style={s.hint}>
                    {newVisibility === "PRIVATE"
                      ? "Visible uniquement par vous et votre adversaire."
                      : "Visible par tous les joueurs connectés — ils pourront voter."}
                  </p>
                </div>
                <div style={s.row}>
                  <button style={{ ...s.btn, ...s.btnPrimary }} type="submit" disabled={creating}>
                    {creating ? "Création…" : "Créer →"}
                  </button>
                  <button style={{ ...s.btn, ...s.btnGhost }} type="button" onClick={() => setShowCreateForm(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button style={{ ...s.btn, ...s.btnPrimary, marginBottom: "1.5rem" }} onClick={() => setShowCreateForm(true)}>
              ⚔ Créer une battle
            </button>
          )}

          {/* Invitations en attente */}
          {myInvites.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p style={s.sectionLabel}>Invitations en attente ({myInvites.length})</p>
              {myInvites.map((inv) => (
                <div key={inv.id} style={{ ...s.card, borderColor: C.accent, background: "rgba(201,168,76,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" as const }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{inv.battle.title}</span>
                      <span style={{ ...s.badge(C.accent, C.accentDim), marginLeft: "0.5rem" }}>
                        {inv.role === "PLAYER" ? "⚔ Joueur" : "👁 Spectateur"}
                      </span>
                      <p style={{ ...s.muted, margin: "0.25rem 0 0" }}>
                        Invitation de {displayName(inv.battle.attacker)}
                      </p>
                    </div>
                    <div style={s.row}>
                      <button
                        style={{ ...s.btn, ...s.btnGreen, fontSize: "0.82rem" }}
                        onClick={() => handleAcceptInvite(inv.id, inv.battle.id)}
                      >
                        Accepter
                      </button>
                      <button
                        style={{ ...s.btn, ...s.btnGhost, fontSize: "0.82rem" }}
                        onClick={() => handleDeclineInvite(inv.id)}
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Liste */}
          <p style={s.sectionLabel}>Battles en cours</p>
          {loading && <p style={s.muted}>Chargement…</p>}
          {!loading && battles.length === 0 && (
            <p style={s.muted}>Aucune battle pour l'instant. Créez le premier duel !</p>
          )}
          {battles.map((b) => {
            const [color, bg] = statusColor[b.status] ?? [C.textMuted, "transparent"];
            return (
              <div key={b.id} style={{ ...s.card, cursor: "pointer" }} onClick={() => handleSelectBattle(b.id)}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap" as const }}>
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                      <span style={s.badge(color, bg)}>{statusLabelShort[b.status]}</span>
                      {b.visibility === "PUBLIC" && (
                        <span style={s.badge(C.blue, C.blueDim)}>🌐 Public</span>
                      )}
                      {b.winner && (
                        <span style={s.badge(C.accent, C.accentDim)}>
                          {b.winner === "ATTACKER" ? "🏆 Attaquant" : "🛡️ Défenseur"}
                        </span>
                      )}
                    </div>
                    <p style={{ ...s.muted, margin: "0 0 0.4rem" }}>{b.goal}</p>
                    <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: C.textMuted }}>
                      <span>⚔ {displayName(b.attacker)}</span>
                      {b.defender
                        ? <span>🛡️ {displayName(b.defender)}</span>
                        : <span style={{ fontStyle: "italic" }}>🛡️ En attente d'un défenseur…</span>
                      }
                      {b.status !== "DONE" && <span>Tour {b.turnCount}/{b.maxTurns}</span>}
                      <span>{b._count?.moves ?? 0} move{(b._count?.moves ?? 0) !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <span style={{ color: C.textMuted }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Vue détail
  // ══════════════════════════════════════════════════════════════════════════

  const b = selectedBattle!;
  const bMoves = b.moves ?? [];
  const bVotes = b.votes ?? [];
  const isAttacker = currentUser.id === b.attackerId;
  const isDefender = currentUser.id === b.defenderId;
  const isPlayer = isAttacker || isDefender;
  const isMyTurn = b.currentTurnUserId === currentUser.id;
  const bInvites = b.invites ?? [];
  const myVote = bVotes.find((v) => v.userId === currentUser.id);
  // Seuls les votes spectateurs (non joueurs) comptent
  const spectatorVotes = bVotes.filter((v) => v.userId !== b.attackerId && v.userId !== b.defenderId);
  const yesCount = spectatorVotes.filter((v) => v.vote).length;
  const noCount = spectatorVotes.filter((v) => !v.vote).length;
  const canStartVoting = isPlayer && b.status === "ACTIVE" && b.turnCount >= b.minTurns;
  const reachedMinTurns = b.turnCount >= b.minTurns;
  const MIN_VOTES_CLOSE = 3;
  const canCloseVoting = isPlayer && b.status === "VOTING" && spectatorVotes.length >= MIN_VOTES_CLOSE;
  const hasAcceptedSpectator = bInvites.some((inv) => inv.role === "SPECTATOR" && inv.status === "ACCEPTED");
  const showPrivateWarning = b.visibility === "PRIVATE" && (b.status === "WAITING" || b.status === "ACTIVE") && !hasAcceptedSpectator;
  const [statusColor2, statusBg2] = statusColor[b.status] ?? [C.textMuted, "transparent"];

  // ── Bannière de statut contextuelle ────────────────────────────────────────
  const bannerConfig: Record<string, { bg: string; border: string; icon: string; main: string; sub: string } | null> = {
    WAITING: {
      bg: "rgba(120,115,140,0.1)",
      border: "rgba(120,115,140,0.25)",
      icon: "⏳",
      main: "En attente d'un adversaire",
      sub: isAttacker
        ? "Invitez un joueur ou rendez la battle publique pour trouver un adversaire."
        : "La place de défenseur est libre — rejoignez le duel !",
    },
    ACTIVE: {
      bg: "rgba(39,174,96,0.08)",
      border: "rgba(39,174,96,0.22)",
      icon: "⚔",
      main: `Duel en cours · Tour ${b.turnCount} / ${b.maxTurns}`,
      sub: b.currentTurnUserId === currentUser.id
        ? "🎯 C'est votre tour — écrivez votre move !"
        : `En attente de ${b.currentTurnUserId === b.attackerId ? displayName(b.attacker) : b.defender ? displayName(b.defender) : "l'adversaire"}…`,
    },
    VOTING: {
      bg: "rgba(201,168,76,0.1)",
      border: "rgba(201,168,76,0.28)",
      icon: "🗳",
      main: "Vote en cours",
      sub: isPlayer
        ? `${spectatorVotes.length} vote${spectatorVotes.length !== 1 ? "s" : ""} spectateur${spectatorVotes.length !== 1 ? "s" : ""} · minimum ${MIN_VOTES_CLOSE} requis`
        : "Le public décide si l'objectif a été atteint.",
    },
    DONE: null,
  };
  const banner = bannerConfig[b.status];

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => { setView("list"); setSelectedBattle(null); }}>← Liste</button>
        <p style={s.title}>{b.title}</p>
        <span style={{ marginLeft: "auto", ...s.badge(statusColor2, statusBg2) }}>{statusLabelShort[b.status]}</span>
      </div>

      {/* Bannière de statut */}
      {banner && (
        <div style={{
          padding: "0.65rem 1.5rem",
          background: banner.bg,
          borderBottom: `1px solid ${banner.border}`,
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1.1rem" }}>{banner.icon}</span>
          <div>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{banner.main}</span>
            <span style={{ color: C.textMuted, fontSize: "0.82rem", marginLeft: "0.6rem" }}>{banner.sub}</span>
          </div>
        </div>
      )}

      <div style={s.content}>
        {error && <p style={{ color: C.red, fontSize: "0.88rem", marginBottom: "1rem" }}>{error}</p>}

        {/* Objectif */}
        {b.status !== "DONE" && (
          <div style={{ ...s.card, borderColor: C.accent, background: "rgba(201,168,76,0.05)" }}>
            <p style={{ ...s.sectionLabel, color: C.accent }}>Objectif du duel</p>
            <p style={{ margin: 0, fontStyle: "italic", lineHeight: 1.6 }}>{b.goal}</p>
            <p style={{ ...s.hint, marginTop: "0.4rem" }}>
              L'attaquant gagne si le public juge que cet objectif a été atteint.
            </p>
          </div>
        )}

        {/* Joueurs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          {/* Attaquant */}
          <div style={{
            ...s.card, margin: 0,
            borderColor: isAttacker ? C.accent : C.border,
            background: isAttacker ? "rgba(201,168,76,0.06)" : C.surface,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
              <p style={{ ...s.sectionLabel, margin: 0 }}>⚔ Attaquant</p>
              {b.status === "ACTIVE" && b.currentTurnUserId === b.attackerId && (
                <span style={{ fontSize: "0.68rem", background: C.accentDim, color: C.accent, padding: "0.1rem 0.4rem", borderRadius: 3, fontWeight: 700 }}>
                  ✍ Son tour
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>{displayName(b.attacker)}</p>
            {isAttacker && <p style={{ ...s.hint, color: C.accent, margin: "0.2rem 0 0" }}>← vous</p>}
          </div>
          {/* Défenseur */}
          <div style={{
            ...s.card, margin: 0,
            borderColor: isDefender ? C.blue : C.border,
            background: isDefender ? "rgba(41,128,185,0.06)" : C.surface,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
              <p style={{ ...s.sectionLabel, margin: 0 }}>🛡️ Défenseur</p>
              {b.status === "ACTIVE" && b.currentTurnUserId === b.defenderId && (
                <span style={{ fontSize: "0.68rem", background: C.blueDim, color: C.blue, padding: "0.1rem 0.4rem", borderRadius: 3, fontWeight: 700 }}>
                  ✍ Son tour
                </span>
              )}
            </div>
            {b.defender
              ? <>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>{displayName(b.defender)}</p>
                  {isDefender && <p style={{ ...s.hint, color: C.blue, margin: "0.2rem 0 0" }}>← vous</p>}
                </>
              : <p style={{ ...s.muted, fontStyle: "italic", margin: 0 }}>En attente…</p>
            }
          </div>
        </div>

        {/* Avertissement battle privée sans spectateur */}
        {showPrivateWarning && (
          <div style={{ ...s.card, borderColor: C.accent, background: C.accentDim, marginBottom: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>
              ⚠️ Cette battle est privée. Invitez au moins un spectateur pour permettre le vote.
            </p>
          </div>
        )}

        {/* Invitations envoyées (pour les joueurs) */}
        {isPlayer && b.status !== "DONE" && (
          <div style={{ marginBottom: "1rem" }}>
            {bInvites.length > 0 && (
              <div style={{ marginBottom: "0.5rem" }}>
                <p style={s.sectionLabel}>Invitations envoyées</p>
                {bInvites.map((inv) => (
                  <div key={inv.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem", fontSize: "0.83rem" }}>
                    <span style={s.badge(
                      inv.status === "ACCEPTED" ? C.green : inv.status === "DECLINED" ? C.red : C.textMuted,
                      inv.status === "ACCEPTED" ? C.greenDim : inv.status === "DECLINED" ? C.redDim : "rgba(120,115,140,0.18)",
                    )}>
                      {inv.status === "ACCEPTED" ? "✓" : inv.status === "DECLINED" ? "✗" : "…"}
                    </span>
                    <span style={{ color: C.textMuted }}>{displayName(inv.user)}</span>
                    <span style={{ color: inv.role === "PLAYER" ? C.accent : C.blue, fontSize: "0.76rem" }}>
                      {inv.role === "PLAYER" ? "⚔ Joueur" : "👁 Spectateur"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {showInviteForm ? (
              <form onSubmit={handleSendInvite} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" as const }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ ...s.muted, display: "block", marginBottom: "0.25rem", fontSize: "0.78rem" }}>Email</label>
                  <input
                    style={{ ...s.input, padding: "0.4rem 0.6rem" }}
                    placeholder="email@exemple.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ ...s.muted, display: "block", marginBottom: "0.25rem", fontSize: "0.78rem" }}>Rôle</label>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    {(["SPECTATOR", "PLAYER"] as BattleInviteRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        style={{ ...s.btn, ...(inviteRole === r ? s.btnPrimary : s.btnGhost), fontSize: "0.78rem", padding: "0.4rem 0.65rem" }}
                        onClick={() => setInviteRole(r)}
                        disabled={r === "PLAYER" && !!b.defenderId}
                      >
                        {r === "PLAYER" ? "⚔ Joueur" : "👁 Spectateur"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button style={{ ...s.btn, ...s.btnPrimary, fontSize: "0.82rem" }} type="submit" disabled={sendingInvite || !inviteEmail.trim()}>
                    {sendingInvite ? "…" : "Envoyer"}
                  </button>
                  <button style={{ ...s.btn, ...s.btnGhost, fontSize: "0.82rem" }} type="button" onClick={() => setShowInviteForm(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <button style={{ ...s.btn, ...s.btnGhost, fontSize: "0.82rem" }} onClick={() => setShowInviteForm(true)}>
                + Inviter
              </button>
            )}
          </div>
        )}

        {/* Rejoindre comme défenseur */}
        {b.status === "WAITING" && !isPlayer && (
          <div style={{ ...s.card, textAlign: "center" as const }}>
            <p style={{ ...s.muted, marginBottom: "0.75rem" }}>La place de défenseur est libre.</p>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleJoin} disabled={joining}>
              {joining ? "Rejoindre…" : "🛡️ Rejoindre comme défenseur"}
            </button>
          </div>
        )}

        <hr style={s.divider} />

        {/* Timeline des moves */}
        <p style={s.sectionLabel}>Moves ({bMoves.length})</p>
        {bMoves.length === 0 && (
          <p style={s.muted}>Aucun move pour l'instant.{b.status === "ACTIVE" && " C'est à l'attaquant de commencer."}</p>
        )}
        <div style={{ marginBottom: "1.25rem" }}>
          {bMoves.map((move) => {
            const isAtk = move.userId === b.attackerId;
            return (
              <div key={move.id} style={{ ...s.moveItem, ...(isAtk ? s.moveAttacker : s.moveDefender) }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", marginBottom: "0.2rem" }}>
                  <span style={{ fontSize: "0.78rem", color: isAtk ? C.accent : C.blue, fontWeight: 600 }}>
                    {isAtk ? "⚔" : "🛡️"} {displayName(move.user)}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: C.textMuted }}>Tour {move.turnNumber}</span>
                </div>
                <p style={{ margin: 0, lineHeight: 1.55 }}>{move.content}</p>
              </div>
            );
          })}
        </div>

        {/* Zone d'écriture */}
        {b.status === "ACTIVE" && isPlayer && (
          isMyTurn ? (
            <form onSubmit={handleMove} style={{ marginBottom: "1.25rem" }}>
              <textarea
                style={s.textarea}
                placeholder="Votre move…"
                value={moveContent}
                onChange={(e) => setMoveContent(e.target.value)}
                disabled={submittingMove}
              />
              <div style={{ ...s.row, marginTop: "0.6rem" }}>
                <button style={{ ...s.btn, ...s.btnPrimary }} type="submit" disabled={submittingMove || !moveContent.trim()}>
                  {submittingMove ? "Envoi…" : "Écrire →"}
                </button>
                {canStartVoting ? (
                  <button
                    style={{ ...s.btn, ...s.btnGhost, marginLeft: "auto" }}
                    type="button"
                    onClick={handleStartVoting}
                    disabled={startingVote}
                  >
                    {startingVote ? "…" : "Lancer le vote"}
                  </button>
                ) : (
                  <span style={{ ...s.hint, marginLeft: "auto" }}>
                    Tour {b.turnCount} / {b.minTurns} avant le vote
                  </span>
                )}
              </div>
            </form>
          ) : (
            <div style={{ ...s.card, textAlign: "center" as const, color: C.textMuted, marginBottom: "1.25rem" }}>
              <p style={{ margin: "0 0 0.5rem" }}>
                En attente de {b.currentTurnUserId === b.attackerId ? displayName(b.attacker) : b.defender ? displayName(b.defender) : "l'adversaire"}…
              </p>
              {reachedMinTurns && (
                <div style={{ marginTop: "0.5rem" }}>
                  <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleStartVoting} disabled={startingVote}>
                    {startingVote ? "…" : "Lancer le vote maintenant"}
                  </button>
                </div>
              )}
              {!reachedMinTurns && (
                <p style={s.hint}>
                  Le vote peut être lancé à partir du tour {b.minTurns} (actuellement {b.turnCount}).
                </p>
              )}
            </div>
          )
        )}

        {b.status === "ACTIVE" && !isPlayer && (
          <div style={{ ...s.card, textAlign: "center" as const, color: C.blue, marginBottom: "1.25rem", background: C.blueDim, borderColor: C.blue }}>
            <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>👁 Vous êtes spectateur</p>
            <p style={{ ...s.hint, margin: 0 }}>Suivez le duel — vous pourrez voter si la phase de vote est lancée.</p>
          </div>
        )}

        {b.status === "WAITING" && isAttacker && (
          <p style={{ ...s.muted, textAlign: "center" as const, marginBottom: "1.25rem" }}>
            La battle est prête — invitez un adversaire pour commencer.
          </p>
        )}

        {/* Phase de vote */}
        {b.status === "VOTING" && (
          <div style={{ ...s.card, textAlign: "center" as const }}>
            <p style={{ ...s.sectionLabel, color: C.accent, textAlign: "center" as const }}>Vote du public</p>
            <p style={{ fontStyle: "italic", margin: "0 0 1rem" }}>L'objectif a-t-il été atteint ?</p>

            {isPlayer ? (
              <p style={{ ...s.muted, fontStyle: "italic" }}>
                En tant que joueur, vous ne participez pas au vote — le public décide.
              </p>
            ) : myVote ? (
              <p style={{ ...s.muted, fontStyle: "italic" }}>
                Vote enregistré : <strong>{myVote.vote ? "Oui ✓" : "Non ✗"}</strong>
              </p>
            ) : (
              <>
                <p style={{ ...s.hint, marginBottom: "0.75rem", color: C.blue }}>
                  👁 Vous assistez en spectateur — votre vote compte !
                </p>
                <div style={{ ...s.row, justifyContent: "center", gap: "1rem" }}>
                  <button style={{ ...s.btn, ...s.btnGreen, minWidth: 80 }} onClick={() => handleVote(true)} disabled={voting}>
                    Oui
                  </button>
                  <button style={{ ...s.btn, ...s.btnDanger, minWidth: 80 }} onClick={() => handleVote(false)} disabled={voting}>
                    Non
                  </button>
                </div>
              </>
            )}

            <p style={{ ...s.hint, marginTop: "0.75rem" }}>
              Votes spectateurs : {spectatorVotes.length} / {MIN_VOTES_CLOSE}
              {spectatorVotes.length < MIN_VOTES_CLOSE && ` · encore ${MIN_VOTES_CLOSE - spectatorVotes.length} nécessaire${MIN_VOTES_CLOSE - spectatorVotes.length > 1 ? "s" : ""}`}
            </p>

            {isPlayer && (
              <div style={{ marginTop: "1rem" }}>
                <button
                  style={{ ...s.btn, ...(canCloseVoting ? s.btnGhost : { ...s.btnGhost, opacity: 0.45, cursor: "not-allowed" as const }) }}
                  onClick={canCloseVoting ? handleCloseVoting : undefined}
                  disabled={closing || !canCloseVoting}
                >
                  {closing ? "Clôture…" : "Clore le vote →"}
                </button>
                {!canCloseVoting && (
                  <p style={s.hint}>
                    En attente d'au moins {MIN_VOTES_CLOSE} votes spectateurs ({spectatorVotes.length}/{MIN_VOTES_CLOSE})
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Résultat final */}
        {b.status === "DONE" && (
          <div style={{
            ...s.card,
            borderColor: C.accent,
            background: "linear-gradient(160deg, rgba(201,168,76,0.12) 0%, rgba(28,27,39,0.0) 55%)",
            animation: "battleWin 0.5s cubic-bezier(0.16,1,0.3,1) forwards, victoryPulse 2.5s ease-in-out 0.5s 3",
            overflow: "hidden" as const,
          }}>
            {/* Label */}
            <p style={{
              fontSize: "0.7rem", textTransform: "uppercase" as const, letterSpacing: "0.14em",
              color: C.accent, margin: "0 0 1.25rem", fontWeight: 700, textAlign: "center" as const,
            }}>
              🏁 Partie terminée
            </p>

            {/* Vainqueur */}
            <div style={{ textAlign: "center" as const, marginBottom: "1.5rem" }}>
              <p style={{ fontSize: "3.5rem", margin: "0 0 0.4rem", lineHeight: 1 }}>
                {b.winner === "ATTACKER" ? "🏆" : "🛡️"}
              </p>
              <p style={{ fontWeight: 800, fontSize: "1.5rem", margin: "0 0 0.2rem", letterSpacing: "-0.01em" }}>
                {b.winner === "ATTACKER" ? displayName(b.attacker) : b.defender ? displayName(b.defender) : "Défenseur"}
              </p>
              <p style={{ color: C.accent, fontSize: "0.88rem", margin: 0, fontWeight: 600 }}>
                {b.winner === "ATTACKER" ? "⚔ Attaquant victorieux" : "🛡️ Défenseur victorieux"}
              </p>
            </div>

            {/* Objectif */}
            <div style={{
              background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "0.85rem 1rem",
              marginBottom: "1rem", borderLeft: `3px solid ${C.accent}`,
            }}>
              <p style={{ ...s.sectionLabel, marginBottom: "0.3rem", color: C.accent }}>Objectif du duel</p>
              <p style={{ margin: "0 0 0.4rem", fontStyle: "italic", lineHeight: 1.55 }}>{b.goal}</p>
              <p style={{ ...s.hint, margin: 0 }}>
                {b.winner === "ATTACKER"
                  ? "✓ Le public a jugé que l'objectif a été atteint."
                  : "✗ Le public a jugé que l'objectif n'a pas été atteint."}
              </p>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
              {[
                { label: "Tours joués", value: String(b.turnCount), color: C.text },
                { label: "Votes", value: String(spectatorVotes.length), color: C.text },
                { label: "Oui", value: String(yesCount), color: C.green },
                { label: "Non", value: String(noCount), color: C.red },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "0.6rem 0.5rem", textAlign: "center" as const }}>
                  <p style={{ ...s.sectionLabel, margin: "0 0 0.2rem" }}>{label}</p>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: "1.35rem", color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
