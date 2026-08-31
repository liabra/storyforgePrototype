import rateLimit from "express-rate-limit";

// Endpoints IA/image (Gemini, Cloudflare) : coûteux à chaque appel, mais un usage
// normal en enchaîne plusieurs par session — plus généreux que les limiteurs d'auth.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessaie dans quelques minutes." },
});
