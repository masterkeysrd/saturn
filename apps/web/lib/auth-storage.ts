import type { User } from "@/gen/saturn/identity/v1/identity"

const KEYS = {
  AUTH_TOKEN: "auth_token",
  REFRESH_TOKEN: "refresh_token",
  USER_PROFILE: "user_profile",
} as const

export interface AuthSession {
  accessToken: string | null
  refreshToken: string | null
  user: Partial<User> | null
}

export const authStorage = {
  setSession(
    accessToken: string,
    refreshToken: string,
    user: Partial<User>
  ): void {
    if (typeof window === "undefined") return
    localStorage.setItem(KEYS.AUTH_TOKEN, accessToken)
    localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken)
    localStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(user))
  },

  getSession(): AuthSession {
    if (typeof window === "undefined") {
      return { accessToken: null, refreshToken: null, user: null }
    }
    const accessToken = localStorage.getItem(KEYS.AUTH_TOKEN)
    const refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN)
    const savedUser = localStorage.getItem(KEYS.USER_PROFILE)

    let user: Partial<User> | null = null
    if (savedUser) {
      try {
        user = JSON.parse(savedUser) as Partial<User>
      } catch {
        // Ignored, handled by caller
      }
    }

    return { accessToken, refreshToken, user }
  },

  clearSession(): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(KEYS.AUTH_TOKEN)
    localStorage.removeItem(KEYS.REFRESH_TOKEN)
    localStorage.removeItem(KEYS.USER_PROFILE)
  },
}
