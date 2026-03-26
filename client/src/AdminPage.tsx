import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import type { AdminReport, ReportStatus } from "./api";

const C = {
  bg: "#f8f0d8",
  surface: "rgba(252,244,215,0.97)",
  border: "rgba(75,35,5,0.18)",
  borderStrong: "rgba(75,35,5,0.32)",
  text: "#180b01",
  textMuted: "rgba(75,35,5,0.55)",
  accent: "#3c1e6a",
  danger: "#b91c1c",
  warn: "#92400e",
  success: "#194820",
  sans: "'Jost', system-ui, sans-serif",
  ui: "'Cinzel', serif",
};

const TARGET_LABEL: Record<string, string> = {
  CONTRIBUTION: "Contribution",
  BATTLE_MOVE: "Battle Move",
  STORY: "Histoire",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function authorName(a: AdminReport["contentAuthor"]) {
  if (!a) return "—";
  return a.displayName || a.email;
}

interface Props {
  onBack: () => void;
  addToast: (msg: string, type?: "scene" | "error") => void;
}

export default function AdminPage({ onBack, addToast }: Props) {
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("OPEN");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // id en cours d'action

  const load = useCallback(async (s: ReportStatus) => {
    setLoading(true);
    try {
      const data = await api.admin.listReports(s);
      setReports(data);
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(statusFilter); }, [statusFilter, load]);

  const handleIgnore = async (r: AdminReport) => {
    setBusy(r.id);
    try {
      await api.admin.ignoreReport(r.id);
      setReports((p) => p.filter((x) => x.id !== r.id));
      addToast("Signalement ignoré");
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (r: AdminReport) => {
    if (!window.confirm(`Supprimer ce contenu (${TARGET_LABEL[r.targetType]}) ? Cette action est irréversible.`)) return;
    setBusy(r.id);
    try {
      await api.admin.deleteContent(r.targetType, r.targetId);
      setReports((p) => p.filter((x) => x.id !== r.id));
      addToast("Contenu supprimé");
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const handleBan = async (r: AdminReport) => {
    if (!r.contentAuthor) return;
    const name = authorName(r.contentAuthor);
    if (!window.confirm(`Bannir ${name} ? L'utilisateur ne pourra plus interagir.`)) return;
    setBusy(r.id);
    try {
      await api.admin.banUser(r.contentAuthor.id);
      // Mettre à jour localement le flag isBanned dans les cards
      setReports((p) =>
        p.map((x) =>
          x.contentAuthor?.id === r.contentAuthor!.id
            ? { ...x, contentAuthor: { ...x.contentAuthor!, isBanned: true } }
            : x,
        ),
      );
      addToast(`Utilisateur ${name} banni`);
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const handleUnban = async (r: AdminReport) => {
    if (!r.contentAuthor) return;
    const name = authorName(r.contentAuthor);
    setBusy(r.id);
    try {
      await api.admin.unbanUser(r.contentAuthor.id);
      setReports((p) =>
        p.map((x) =>
          x.contentAuthor?.id === r.contentAuthor!.id
            ? { ...x, contentAuthor: { ...x.contentAuthor!, isBanned: false } }
            : x,
        ),
      );
      addToast(`Utilisateur ${name} débanni`);
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const tabs: ReportStatus[] = ["OPEN", "IGNORED", "RESOLVED"];
  const tabLabel: Record<ReportStatus, string> = { OPEN: "À traiter", IGNORED: "Ignorés", RESOLVED: "Résolus" };

  return (
    <div style={{ minHeight: "100vh", fontFamily: C.sans, color: C.text, padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "0.35rem 0.75rem", cursor: "pointer", fontSize: "0.82rem", color: C.textMuted }}
        >
          ← Retour
        </button>
        <h1 style={{ margin: 0, fontFamily: C.ui, fontSize: "1.15rem", fontWeight: 700, letterSpacing: "0.03em" }}>
          Administration · Signalements
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem" }}>
        {tabs.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "0.38rem 0.9rem",
              borderRadius: 5,
              border: `1px solid ${statusFilter === s ? C.accent : C.border}`,
              background: statusFilter === s ? C.accent : "transparent",
              color: statusFilter === s ? "#fff" : C.textMuted,
              fontFamily: C.sans,
              fontSize: "0.82rem",
              fontWeight: statusFilter === s ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {tabLabel[s]}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: C.textMuted, fontSize: "0.88rem" }}>Chargement…</p>
      ) : reports.length === 0 ? (
        <p style={{ color: C.textMuted, fontSize: "0.88rem" }}>Aucun signalement {tabLabel[statusFilter].toLowerCase()}.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {reports.map((r) => {
            const isBusy = busy === r.id;
            const author = r.contentAuthor;
            return (
              <div
                key={r.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${r.targetType === "CONTRIBUTION" ? C.accent : r.targetType === "BATTLE_MOVE" ? "#1e40af" : C.warn}`,
                  borderRadius: 7,
                  padding: "0.9rem 1rem",
                  boxShadow: "0 1px 6px rgba(75,35,5,0.07)",
                }}
              >
                {/* Meta ligne */}
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.45rem" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, background: "rgba(75,35,5,0.08)", borderRadius: 3, padding: "0.1rem 0.45rem", color: C.text }}>
                    {TARGET_LABEL[r.targetType]}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: C.textMuted }}>{formatDate(r.createdAt)}</span>
                  {author?.isBanned && (
                    <span style={{ fontSize: "0.7rem", background: "rgba(185,28,28,0.1)", color: C.danger, borderRadius: 3, padding: "0.1rem 0.4rem", fontWeight: 600 }}>
                      BANNI
                    </span>
                  )}
                </div>

                {/* Contenu signalé */}
                {r.contentPreview && (
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", lineHeight: 1.5, color: C.text, background: "rgba(75,35,5,0.04)", borderRadius: 4, padding: "0.4rem 0.6rem", borderLeft: "2px solid rgba(75,35,5,0.12)" }}>
                    {r.contentPreview}
                  </p>
                )}
                {!r.contentPreview && (
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: C.textMuted, fontStyle: "italic" }}>Contenu supprimé ou introuvable</p>
                )}

                {/* Auteur + signaleur */}
                <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", fontSize: "0.78rem", color: C.textMuted, marginBottom: "0.65rem" }}>
                  <span>
                    <strong style={{ color: C.text }}>Auteur :</strong>{" "}
                    {author ? (author.displayName || author.email) : "—"}
                  </span>
                  <span>
                    <strong style={{ color: C.text }}>Signalé par :</strong>{" "}
                    {r.user.displayName || r.user.email}
                  </span>
                  {r.reason && (
                    <span>
                      <strong style={{ color: C.text }}>Raison :</strong> {r.reason}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {statusFilter === "OPEN" && (
                    <button
                      onClick={() => handleIgnore(r)}
                      disabled={isBusy}
                      style={btnStyle(C.textMuted, "rgba(75,35,5,0.08)")}
                    >
                      Ignorer
                    </button>
                  )}
                  {r.contentPreview && (
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={isBusy}
                      style={btnStyle("#fff", C.danger)}
                    >
                      Supprimer contenu
                    </button>
                  )}
                  {author && !author.isBanned && (
                    <button
                      onClick={() => handleBan(r)}
                      disabled={isBusy}
                      style={btnStyle("#fff", C.warn)}
                    >
                      Bannir utilisateur
                    </button>
                  )}
                  {author?.isBanned && (
                    <button
                      onClick={() => handleUnban(r)}
                      disabled={isBusy}
                      style={btnStyle("#fff", C.success)}
                    >
                      Débannir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    padding: "0.32rem 0.75rem",
    border: "none",
    borderRadius: 5,
    background: bg,
    color,
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Jost', system-ui, sans-serif",
  };
}
