import { useState, useEffect, useRef } from "react";
import { api } from "./api";
import type { AuthUser, Battle, BattleListItem, BattleMove, BattleVote } from "./api";
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
  WAITING: "En attente",
  ACTIVE: "En cours",
  VOTING: "Vote en cours",
  DONE: "Terminée",
};

const statusColor: Record<string, [string, string]> = {
  WAITING: [C.textMuted, "rgba(120,115,140,0.18)"],
  ACTIVE: [C.green, C.greenDim],
  VOTING: [C.accent, C.accentDim],
  DONE: [C.textMuted, "rgba(120,115,140,0.18)"],
};

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  currentUser: AuthUser | null;
  onBack: () => void;
}

// ══════════════════════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════════════════════

export default function BattleApp({ currentUser, onBack }: Props) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [battles, setBattles] = useState<BattleListItem[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [creating, setCreating] = useState(false);

  // Move
  const [moveContent, setMoveContent] = useState("");
  const [submittingMove, setSubmittingMove] = useState(false);

  // Vote
  const [startingVote, setStartingVote] = useState(false);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [joining, setJoining] = useState(false);

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
  }, [currentUser]);

  // ── Écoute socket globale (liste) ──────────────────────────────────────────

  useEffect(() => {
    const onBattleCreated = (battle: BattleListItem) => {
      setBattles((prev) => prev.some((b) => b.id === battle.id) ? prev : [battle, ...prev]);
    };
    const onBattleUpdated = ({ id, status, defenderId, winner }: Partial<BattleListItem> & { id: string }) => {
      setBattles((prev) => prev.map((b) =>
        b.id === id ? { ...b, ...(status && { status }), ...(defenderId !== undefined && { defenderId }), ...(winner !== undefined && { winner }) } : b
      ));
    };
    socket.on("battle:created", onBattleCreated);
    socket.on("battle:updated", onBattleUpdated);
    return () => {
      socket.off("battle:created", onBattleCreated);
      socket.off("battle:updated", onBattleUpdated);
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
      const created = await api.battles.create({ title: newTitle.trim(), goal: newGoal.trim() });
      // Refetch explicite pour garantir le détail complet (moves:[], votes:[])
      const full = await api.battles.get(created.id);
      setNewTitle("");
      setNewGoal("");
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
                <div style={{ marginBottom: "1rem" }}>
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
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.35rem" }}>
                      <span style={{ fontWeight: 600 }}>{b.title}</span>
                      <span style={s.badge(color, bg)}>{statusLabel[b.status]}</span>
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
                      <span>Tour {b.turnCount}/{b.maxTurns}</span>
                      <span>{b._count.moves} move{b._count.moves !== 1 ? "s" : ""}</span>
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
  const myVote = bVotes.find((v) => v.userId === currentUser.id);
  const yesCount = bVotes.filter((v) => v.vote).length;
  const noCount = bVotes.filter((v) => !v.vote).length;
  const canStartVoting = isPlayer && b.status === "ACTIVE" && b.turnCount >= b.minTurns;
  const [statusColor2, statusBg2] = statusColor[b.status] ?? [C.textMuted, "transparent"];

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => { setView("list"); setSelectedBattle(null); }}>← Liste</button>
        <p style={s.title}>{b.title}</p>
        <span style={{ marginLeft: "auto", ...s.badge(statusColor2, statusBg2) }}>{statusLabel[b.status]}</span>
      </div>

      <div style={s.content}>
        {error && <p style={{ color: C.red, fontSize: "0.88rem", marginBottom: "1rem" }}>{error}</p>}

        {/* Objectif */}
        <div style={{ ...s.card, borderColor: C.accent, background: "rgba(201,168,76,0.06)" }}>
          <p style={{ ...s.sectionLabel, color: C.accent }}>Objectif</p>
          <p style={{ margin: 0, fontStyle: "italic" }}>{b.goal}</p>
          <p style={{ ...s.hint, marginTop: "0.5rem" }}>
            Tour {b.turnCount} / {b.maxTurns} &nbsp;·&nbsp;
            {b.status === "ACTIVE" && b.currentTurnUserId && (
              <>Tour de : <strong>{
                b.currentTurnUserId === b.attackerId
                  ? `⚔ ${displayName(b.attacker)}`
                  : b.defender ? `🛡️ ${displayName(b.defender)}` : "?"
              }</strong></>
            )}
            {b.status === "WAITING" && "En attente d'un défenseur"}
            {b.status === "VOTING" && "Phase de vote"}
            {b.status === "DONE" && "Battle terminée"}
          </p>
        </div>

        {/* Joueurs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ ...s.card, margin: 0, borderColor: isAttacker ? C.accent : C.border }}>
            <p style={s.sectionLabel}>⚔ Attaquant</p>
            <p style={{ margin: 0, fontWeight: 600 }}>{displayName(b.attacker)}</p>
            {isAttacker && <p style={s.hint}>C'est vous</p>}
          </div>
          <div style={{ ...s.card, margin: 0, borderColor: isDefender ? C.blue : C.border }}>
            <p style={s.sectionLabel}>🛡️ Défenseur</p>
            {b.defender
              ? <><p style={{ margin: 0, fontWeight: 600 }}>{displayName(b.defender)}</p>
                  {isDefender && <p style={s.hint}>C'est vous</p>}</>
              : <p style={{ ...s.muted, fontStyle: "italic", margin: 0 }}>En attente…</p>
            }
          </div>
        </div>

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
                {canStartVoting && (
                  <button
                    style={{ ...s.btn, ...s.btnGhost, marginLeft: "auto" }}
                    type="button"
                    onClick={handleStartVoting}
                    disabled={startingVote}
                  >
                    {startingVote ? "…" : "Lancer le vote"}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div style={{ ...s.card, textAlign: "center" as const, color: C.textMuted, marginBottom: "1.25rem" }}>
              Ce n'est pas votre tour.
              {canStartVoting && (
                <div style={{ marginTop: "0.75rem" }}>
                  <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleStartVoting} disabled={startingVote}>
                    {startingVote ? "…" : "Lancer le vote"}
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {b.status === "ACTIVE" && !isPlayer && (
          <p style={{ ...s.muted, textAlign: "center" as const, marginBottom: "1.25rem" }}>
            Vous suivez ce duel en spectateur.
          </p>
        )}

        {b.status === "WAITING" && isAttacker && (
          <p style={{ ...s.muted, textAlign: "center" as const, marginBottom: "1.25rem" }}>
            En attente d'un adversaire…
          </p>
        )}

        {/* Phase de vote */}
        {b.status === "VOTING" && (
          <div style={{ ...s.card, textAlign: "center" as const }}>
            <p style={{ ...s.sectionLabel, color: C.accent, textAlign: "center" as const }}>Vote du public</p>
            <p style={{ fontStyle: "italic", margin: "0 0 1rem" }}>L'objectif a-t-il été atteint ?</p>

            {myVote ? (
              <p style={{ ...s.muted, fontStyle: "italic" }}>
                Vote enregistré : <strong>{myVote.vote ? "Oui ✓" : "Non ✗"}</strong>
              </p>
            ) : (
              <div style={{ ...s.row, justifyContent: "center", gap: "1rem" }}>
                <button style={{ ...s.btn, ...s.btnGreen, minWidth: 80 }} onClick={() => handleVote(true)} disabled={voting}>
                  Oui
                </button>
                <button style={{ ...s.btn, ...s.btnDanger, minWidth: 80 }} onClick={() => handleVote(false)} disabled={voting}>
                  Non
                </button>
              </div>
            )}

            <p style={{ ...s.hint, marginTop: "0.75rem" }}>
              {bVotes.length} vote{bVotes.length !== 1 ? "s" : ""} enregistré{bVotes.length !== 1 ? "s" : ""}
            </p>

            {isPlayer && (
              <button
                style={{ ...s.btn, ...s.btnGhost, marginTop: "1rem" }}
                onClick={handleCloseVoting}
                disabled={closing}
              >
                {closing ? "Clôture…" : "Clore le vote →"}
              </button>
            )}
          </div>
        )}

        {/* Résultat final */}
        {b.status === "DONE" && (
          <div style={{ ...s.card, textAlign: "center" as const, borderColor: C.accent, background: C.accentDim }}>
            <p style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>
              {b.winner === "ATTACKER" ? "🏆" : "🛡️"}
            </p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: "0 0 0.3rem" }}>
              {b.winner === "ATTACKER" ? "Victoire de l'attaquant" : "Victoire du défenseur"}
            </p>
            <p style={s.muted}>
              {b.winner === "ATTACKER"
                ? "Le public a jugé que l'objectif a été atteint."
                : "Le public a jugé que l'objectif n'a pas été atteint."}
            </p>
            <hr style={s.divider} />
            <p style={{ ...s.muted, marginBottom: 0 }}>
              Résultat : {yesCount} Oui · {noCount} Non · {bVotes.length} vote{bVotes.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
