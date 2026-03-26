import { Request, Response } from "express";
import * as userService from "../services/user.service";
import { moderateText, MOD_REFUSED } from "../services/moderation.service";

const isValidHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await userService.getProfile(req.user!.id);
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }
    res.json(user);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const { displayName, color, bio, notifBattleEnabled, notifInvitesEnabled, notifGeneralEnabled } = req.body;

  if (color !== undefined && color !== null && !isValidHex(color)) {
    res.status(400).json({ error: "La couleur doit être au format #rrggbb" });
    return;
  }
  if (displayName && !moderateText(displayName, "user.displayName").isAllowed) {
    res.status(400).json({ error: MOD_REFUSED });
    return;
  }
  if (bio && !moderateText(bio, "user.bio").isAllowed) {
    res.status(400).json({ error: MOD_REFUSED });
    return;
  }

  const data: {
    displayName?: string | null;
    color?: string | null;
    bio?: string | null;
    notifBattleEnabled?: boolean;
    notifInvitesEnabled?: boolean;
    notifGeneralEnabled?: boolean;
  } = {};

  if (displayName !== undefined)
    data.displayName = typeof displayName === "string" ? displayName.trim() || null : null;
  if (color !== undefined)
    data.color = typeof color === "string" ? color.trim() || null : null;
  if (bio !== undefined)
    data.bio = typeof bio === "string" ? bio.trim() || null : null;
  if (typeof notifBattleEnabled === "boolean") data.notifBattleEnabled = notifBattleEnabled;
  if (typeof notifInvitesEnabled === "boolean") data.notifInvitesEnabled = notifInvitesEnabled;
  if (typeof notifGeneralEnabled === "boolean") data.notifGeneralEnabled = notifGeneralEnabled;

  try {
    const user = await userService.updateProfile(req.user!.id, data);
    res.json(user);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};
