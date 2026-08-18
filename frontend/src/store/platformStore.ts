import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PlatformStore {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

export const usePlatformStore = create<PlatformStore>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: null }),
    }),
    { name: 'platform-admin-storage' }
  )
)
