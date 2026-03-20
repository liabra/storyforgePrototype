export interface PresenceUser {
  userId: string;
  username: string;
  color?: string | null;
}

export function scenePresenceLabel(users: PresenceUser[]): string {
  if (users.length === 0) return "";
  if (users.length === 1) return `${users[0].username} est dans cette scène`;
  if (users.length === 2)
    return `${users[0].username} et ${users[1].username} sont dans cette scène`;
  if (users.length === 3)
    return `${users[0].username}, ${users[1].username} et ${users[2].username} sont dans cette scène`;
  return `${users.length} personnes présentes`;
}
