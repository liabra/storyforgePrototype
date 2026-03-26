import { useEffect, useRef } from "react";

export interface ToastItem {
  id: number;
  type: "contribution" | "scene" | "error";
  message: string;
}

const C = {
  surface: "rgba(252,244,215,0.97)",
  border: "rgba(75,35,5,0.28)",
  text: "#180b01",
  textMuted: "rgba(75,35,5,0.58)",
  success: "#194820",
  accent: "#3c1e6a",
  error: "#b91c1c",
  ui: "'Cinzel', 'Jost', serif",
  sans: "'Jost', system-ui, sans-serif",
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 4200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  const dot = item.type === "error"
    ? { color: C.error, label: "erreur" }
    : item.type === "scene"
    ? { color: C.success, label: "scène" }
    : { color: C.accent, label: "contribution" };

  return (
    <div className="sf-toast" style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${dot.color}`,
      borderRadius: 6,
      boxShadow: "0 4px 20px rgba(75,35,5,0.18), 0 1px 4px rgba(75,35,5,0.10)",
      padding: "0.65rem 0.75rem",
      maxWidth: 300, minWidth: 220,
      pointerEvents: "all",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: dot.color, flexShrink: 0, marginTop: 5,
      }} />
      <span style={{
        flex: 1, fontSize: 13, color: C.text,
        fontFamily: C.sans, lineHeight: 1.45,
      }}>
        {item.message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: C.textMuted, fontSize: 12, lineHeight: 1, padding: "1px 0 0",
          flexShrink: 0,
        }}
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "8.5rem",
      right: "1.5rem",
      display: "flex",
      flexDirection: "column-reverse",
      gap: "0.5rem",
      zIndex: 9990,
      pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <Toast key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
