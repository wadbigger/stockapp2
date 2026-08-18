import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Site } from '../types'

interface SiteStore {
  sites: Site[]
  currentSiteId: string | null
  setSites: (sites: Site[]) => void
  setCurrentSiteId: (id: string) => void
  currentSite: () => Site | undefined
}

export const useSiteStore = create<SiteStore>()(
  persist(
    (set, get) => ({
      sites: [],
      currentSiteId: null,
      setSites: (sites) => {
        set({ sites })
        const current = get().currentSiteId
        if (current === 'all') return
        if (!current || !sites.find((s) => s.id === current)) {
          set({ currentSiteId: sites[0]?.id || null })
        }
      },
      setCurrentSiteId: (id) => set({ currentSiteId: id }),
      currentSite: () => {
        const { sites, currentSiteId } = get()
        return sites.find((s) => s.id === currentSiteId)
      },
    }),
    {
      name: 'site-storage',
      partialize: (state) => ({ currentSiteId: state.currentSiteId }),
    }
  )
)
