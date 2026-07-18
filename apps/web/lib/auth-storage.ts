const KEYS = {
  AUTH_TOKEN: "auth_token",
  REFRESH_TOKEN: "refresh_token",
} as const

export interface AuthSession {
  accessToken: string | null
  refreshToken: string | null
}

export const authStorage = {
  setSession(accessToken: string, refreshToken: string): void {
    if (typeof window === "undefined") return
    localStorage.setItem(KEYS.AUTH_TOKEN, accessToken)
    localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken)
  },

  getSession(): AuthSession {
    if (typeof window === "undefined") {
      return { accessToken: null, refreshToken: null }
    }
    const accessToken = localStorage.getItem(KEYS.AUTH_TOKEN)
    const refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN)

    return { accessToken, refreshToken }
  },

  clearSession(): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(KEYS.AUTH_TOKEN)
    localStorage.removeItem(KEYS.REFRESH_TOKEN)
  },
}
