import type { PresenceUser } from "./presence";

/** Dérive une teinte HSL stable depuis une chaîne de caractères. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

interface Props {
  user: PresenceUser;
  size?: number;
}

/**
 * Petit avatar circulaire affichant l'initiale de l'utilisateur.
 * Utilise la couleur de profil si disponible, sinon dérive une couleur
 * stable depuis le username.
 */
export function PresenceAvatar({ user, size = 26 }: Props) {
  const initial = user.username.charAt(0).toUpperCase();
  const bg = user.color ?? `hsl(${hueFromString(user.username)}, 48%, 38%)`;

  return (
    <div
      title={user.username}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        border: "2px solid rgba(255,235,170,0.35)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
        flexShrink: 0,
        userSelect: "none",
        cursor: "default",
      }}
    >
      {initial}
    </div>
  );
}
