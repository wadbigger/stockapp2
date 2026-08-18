const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface BrandingInput {
  name?: string
  logo_url?: string
  primary_color?: string
}

// Branding-only white-label (Phase 1): applies logo/name/accent color at
// runtime. Does not retheme the whole app or touch the PWA manifest/subdomain
// (out of scope — see plan for the multi-tenant SaaS foundation).
export function applyBranding({ name, logo_url, primary_color }: BrandingInput) {
  if (primary_color) {
    document.documentElement.style.setProperty('--brand-primary', primary_color)
  }
  if (name) {
    document.title = `${name} - Gestion de Stock`
  }
  if (logo_url) {
    const href = logo_url.startsWith('http') ? logo_url : `${API_URL}${logo_url}`
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
  }
}

export function resolveLogoSrc(logo_url?: string): string {
  if (!logo_url) return ''
  return logo_url.startsWith('http') ? logo_url : `${API_URL}${logo_url}`
}
