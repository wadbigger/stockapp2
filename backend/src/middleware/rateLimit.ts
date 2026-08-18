import rateLimit from 'express-rate-limit'

// Login/lookup/refresh are brute-force/enumeration targets: 20 attempts per
// 15 minutes per IP is generous for a real user but slows down credential
// stuffing significantly.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de tentatives, veuillez réessayer plus tard.' },
})

// The platform admin token is a long random secret (not brute-forceable in
// practice), but rate-limiting still caps abuse/DoS potential against the
// superadmin API and slows down any leaked-token probing.
export const platformLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de requêtes, veuillez réessayer plus tard.' },
})

// Light baseline protection for the whole API against scripted abuse/DoS.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
})
