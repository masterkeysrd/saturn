let inMemoryAccessToken: string | null = null

const KEYS = {
  HAS_SESSION: "has_session",
} as const

export interface AuthSession {
  accessToken: string | null
  hasSession: boolean
}

export const authStorage = {
  setSession(accessToken: string): void {
    if (typeof window === "undefined") return
    inMemoryAccessToken = accessToken
    localStorage.setItem(KEYS.HAS_SESSION, "true")
  },

  getSession(): AuthSession {
    if (typeof window === "undefined") {
      return { accessToken: null, hasSession: false }
    }
    const hasSession = localStorage.getItem(KEYS.HAS_SESSION) === "true"
    return {
      accessToken: inMemoryAccessToken,
      hasSession,
    }
  },

  clearSession(): void {
    inMemoryAccessToken = null
    if (typeof window === "undefined") return
    localStorage.removeItem(KEYS.HAS_SESSION)
  },
}
