import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  // Fail closed if the server isn't configured: without this check, an empty
  // PLATFORM_ADMIN_TOKEN combined with an empty bearer token (e.g. header
  // "Authorization: Bearer ") would compare as two equal zero-length
  // buffers below and let the request through.
  const configuredToken = process.env.PLATFORM_ADMIN_TOKEN
  if (!configuredToken) {
    console.error('PLATFORM_ADMIN_TOKEN is not configured; rejecting platform admin request.')
    return res.status(500).json({ message: 'Panneau plateforme non configuré' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ') || authHeader.length <= 7) {
    return res.status(401).json({ message: 'Token plateforme manquant' })
  }
  const token = Buffer.from(authHeader.slice(7))
  const expected = Buffer.from(configuredToken)

  if (token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) {
    return res.status(403).json({ message: 'Token plateforme invalide' })
  }
  next()
}
