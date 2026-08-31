import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Enveloppe un handler async : tout rejet est transmis à next(err) au lieu de
 * devenir un rejet non géré. (Express 5 le fait déjà nativement pour les
 * handlers passés directement à router.*, mais ce wrapper reste utile pour
 * l'adoption explicite et progressive du pattern.)
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

/** Middleware d'erreur global — à monter en dernier, après toutes les routes. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

  if (res.headersSent) return;

  const e = err as HttpError;
  const status = e.status ?? e.statusCode ?? 500;
  const message = status < 500 && e.message ? e.message : "Erreur serveur";

  res.status(status).json({ error: message });
}
