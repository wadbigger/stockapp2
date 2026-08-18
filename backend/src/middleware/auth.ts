import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import platformPool from '../db/platformPool'
import { getTenantPool } from '../db/tenantPoolManager'
import { runWithTenant } from '../db/tenantContext'

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email: string; login?: string; tenantId: string }
  siteId?: string
  tenantSlug?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant' })
  }
  const token = authHeader.slice(7)
  let payload: any
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as any
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' })
  }

  if (!payload.tenantId) {
    return res.status(401).json({ message: 'Token invalide (tenant manquant)' })
  }

  try {
    const { rows } = await platformPool.query(
      'SELECT id, slug, db_name, status FROM tenants WHERE id = $1',
      [payload.tenantId]
    )
    const tenant = rows[0]
    if (!tenant || tenant.status !== 'active') {
      return res.status(403).json({ message: 'Compte suspendu ou introuvable' })
    }

    req.user = { id: payload.id, role: payload.role, email: payload.email, login: payload.login, tenantId: tenant.id }
    req.tenantSlug = tenant.slug
    const tenantPool = getTenantPool(tenant)
    const rawSiteId = req.headers['x-site-id'] as string | undefined

    if (payload.role === 'superadmin' || payload.role === 'admin') {
      req.siteId = (rawSiteId === 'all') ? undefined : (rawSiteId || undefined)
    } else {
      // Non-admin roles (vendeur/gestionnaire/comptable) are restricted to
      // their assigned sites. Never trust the client-supplied x-site-id
      // blindly here — an unvalidated header would let any user read other
      // sites' invoices/stock/clients by sending an arbitrary site id, or
      // see every site's data by omitting the header entirely (routes treat
      // an unset req.siteId as "no filter").
      const { rows: allowedSites } = await tenantPool.query(
        'SELECT site_id FROM user_sites WHERE user_id = $1',
        [payload.id]
      )
      const allowedIds: string[] = allowedSites.map((r: any) => r.site_id)
      if (allowedIds.length === 0) {
        return res.status(403).json({ message: 'Aucun site assigné à ce compte' })
      }
      req.siteId = (rawSiteId && allowedIds.includes(rawSiteId)) ? rawSiteId : allowedIds[0]
    }

    runWithTenant({ pool: tenantPool, tenantId: tenant.id, slug: tenant.slug }, () => next())
  } catch (err) {
    next(err)
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(403).json({ message: 'Accès non autorisé' })
    if (req.user.role === 'superadmin') return next()
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès non autorisé' })
    }
    next()
  }
}

export function isSuperAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'superadmin'
}

export function isAdminOrSuper(req: AuthRequest): boolean {
  return req.user?.role === 'superadmin' || req.user?.role === 'admin'
}
