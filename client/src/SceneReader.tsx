import { useEffect } from "react";
import type { Scene } from "./api";

interface Props {
  scene: Scene;
  chapterTitle?: string;
  storyTitle?: string;
  onClose: () => void;
}

const R = {
  bg: "#f7f3eb",
  text: "#2c2116",
  textMuted: "#7a6a55",
  border: "rgba(75,35,5,0.12)",
  accent: "#6b4c2a",
};

function authorLabel(contrib: Scene["contributions"][number]): string {
  if (contrib.character?.name) return contrib.character.name;
  if (contrib.character?.nickname) return contrib.character.nickname;
  if (contrib.user?.displayName) return contrib.user.displayName;
  if (contrib.user?.email) return contrib.user.email.split("@")[0];
  return "Anonyme";
}

export default function SceneReader({ scene, chapterTitle, storyTitle, onClose }: Props) {
  const contribs = scene.contributions ?? [];

  // Fermer avec Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Bloquer le scroll du body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: R.bg, color: R.text,
      overflowY: "auto",
      fontFamily: "'Georgia', serif",
    }}>
      {/* Bouton Quitter — fixé en haut à droite */}
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: "1.25rem", right: "1.5rem",
          background: "rgba(75,35,5,0.08)", border: "1px solid rgba(75,35,5,0.18)",
          borderRadius: 6, padding: "0.4rem 0.85rem",
          color: R.accent, fontSize: "0.82rem", cursor: "pointer",
          fontFamily: "inherit", fontWeight: 600,
          zIndex: 1001,
        }}
      >
        ✕ Quitter
      </button>

      {/* Contenu centré */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "3.5rem 1.5rem 8rem" }}>

        {/* Fil d'Ariane */}
        {(storyTitle || chapterTitle) && (
          <p style={{ fontSize: "0.78rem", color: R.textMuted, margin: "0 0 0.5rem", letterSpacing: "0.06em" }}>
            {storyTitle}
            {storyTitle && chapterTitle && " · "}
            {chapterTitle}
          </p>
        )}

        {/* Titre de la scène */}
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0 0 0.5rem", lineHeight: 1.25, color: R.text }}>
          {scene.title}
        </h1>

        {/* Description */}
        {scene.description && (
          <p style={{ fontSize: "0.95rem", color: R.textMuted, margin: "0 0 1rem", fontStyle: "italic", lineHeight: 1.6 }}>
            {scene.description}
          </p>
        )}

        {/* Séparateur */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.5rem 0 2rem" }}>
          <div style={{ flex: 1, height: 1, background: R.border }} />
          <span style={{ color: R.textMuted, fontSize: "0.9rem" }}>✦</span>
          <div style={{ flex: 1, height: 1, background: R.border }} />
        </div>

        {/* Contributions */}
        {contribs.length === 0 ? (
          <p style={{ color: R.textMuted, fontStyle: "italic", textAlign: "center" as const }}>
            Aucune contribution pour l'instant.
          </p>
        ) : (
          <div>
            {contribs.map((contrib, i) => (
              <div key={contrib.id} style={{ marginBottom: "1.75rem" }}>
                {/* Auteur discret */}
                <p style={{
                  fontSize: "0.72rem", color: R.textMuted,
                  margin: "0 0 0.35rem", letterSpacing: "0.07em",
                  textTransform: "uppercase" as const, fontFamily: "ui-sans-serif, system-ui, sans-serif",
                }}>
                  {authorLabel(contrib)}
                </p>
                {/* Texte */}
                <p style={{
                  margin: 0, fontSize: "1.05rem", lineHeight: 1.85,
                  color: R.text, whiteSpace: "pre-wrap" as const,
                }}>
                  {contrib.content}
                </p>
                {/* Micro-séparateur entre contributions (sauf la dernière) */}
                {i < contribs.length - 1 && (
                  <div style={{ height: 1, background: R.border, margin: "1.75rem 0 0" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Ornement de fin */}
        {contribs.length > 0 && (
          <div style={{ textAlign: "center" as const, marginTop: "3rem", color: R.textMuted, fontSize: "1rem", letterSpacing: "0.3em" }}>
            · · ·
          </div>
        )}
      </div>
    </div>
  );
}
