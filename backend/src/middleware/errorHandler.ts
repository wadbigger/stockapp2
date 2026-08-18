import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err)
  const status = err.status || 500
  // For unexpected server errors, never forward the raw message (may
  // contain DB/internal details) — only deliberate 4xx errors thrown by
  // route handlers are safe to surface verbatim to the client.
  const message = status >= 500 ? 'Erreur interne du serveur' : (err.message || 'Erreur interne du serveur')
  res.status(status).json({ message })
}
