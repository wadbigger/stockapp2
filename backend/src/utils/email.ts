// Emails must be compared/stored consistently, otherwise a user who typed
// "Jean@Exemple.com" at signup (or whose phone auto-capitalized it) can no
// longer log in with "jean@exemple.com" (or vice versa) — the #1 real-world
// cause of "je n'arrive pas à me connecter avec mon email" reports.
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

// Login is the authentication identifier (replaces email for that purpose).
// Same normalization rules apply so "Jean.Dupont " and "jean.dupont" resolve
// to the same account.
export function normalizeLogin(login: string): string {
  return (login || '').trim().toLowerCase()
}
