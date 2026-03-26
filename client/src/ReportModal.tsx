import { useState } from "react";
import { api } from "./api";

interface ReportModalProps {
  targetType: "CONTRIBUTION" | "BATTLE_MOVE" | "STORY";
  targetId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (err: unknown) => void;
}

const C = {
  surface: "rgba(252,244,215,0.98)",
  border: "rgba(75,35,5,0.22)",
  text: "#180b01",
  textMuted: "rgba(75,35,5,0.55)",
  accent: "#3c1e6a",
  sans: "'Jost', system-ui, sans-serif",
};

export function ReportModal({ targetType, targetId, onClose, onSuccess, onError }: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.reports.create({
        targetType,
        targetId,
        reason: reason.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      onError(err);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(24,11,1,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10010,
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(75,35,5,0.25)",
        padding: "1.5rem",
        width: "100%",
        maxWidth: 380,
        fontFamily: C.sans,
      }}>
        <h3 style={{ margin: "0 0 0.25rem", fontSize: "1rem", fontWeight: 600, color: C.text }}>
          🚩 Signaler ce contenu
        </h3>
        <p style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: C.textMuted, lineHeight: 1.45 }}>
          Indiquez optionnellement la raison de votre signalement.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Raison (optionnelle)…"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "0.55rem 0.65rem",
              fontSize: "0.88rem",
              fontFamily: C.sans,
              color: C.text,
              background: "rgba(255,248,220,0.6)",
              resize: "vertical",
              marginBottom: "1rem",
            }}
            disabled={submitting}
            autoFocus
          />
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "0.45rem 1rem",
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                background: "transparent",
                color: C.textMuted,
                fontSize: "0.85rem",
                cursor: "pointer",
                fontFamily: C.sans,
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "0.45rem 1rem",
                border: "none",
                borderRadius: 5,
                background: C.accent,
                color: "#fff",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: C.sans,
              }}
            >
              {submitting ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
