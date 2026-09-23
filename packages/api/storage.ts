let inMemoryAccessToken: string | null = null

export interface AuthSession {
  accessToken: string | null
  hasSession: boolean
}

export interface SyncStorageAdapter {
  getSession(): AuthSession
  setSession(accessToken: string): void
  clearSession(): void
  getActiveSpaceId(): string | null
  setActiveSpaceId(spaceId: string | null): void
  getRefreshToken?(): string | null
  setRefreshToken?(refreshToken: string): void
}

export interface AsyncStorageAdapter {
  getSession(): Promise<AuthSession>
  setSession(accessToken: string): Promise<void>
  clearSession(): Promise<void>
  getActiveSpaceId(): Promise<string | null>
  setActiveSpaceId(spaceId: string | null): Promise<void>
  getRefreshToken?(): Promise<string | null>
  setRefreshToken?(refreshToken: string): Promise<void>
}

export type StorageAdapter = SyncStorageAdapter | AsyncStorageAdapter

export const defaultStorage: SyncStorageAdapter = {
  getSession(): AuthSession {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return {
        accessToken: inMemoryAccessToken,
        hasSession: !!inMemoryAccessToken,
      }
    }
    const hasSession = localStorage.getItem("has_session") === "true"
    return {
      accessToken: inMemoryAccessToken,
      hasSession,
    }
  },

  setSession(accessToken: string): void {
    inMemoryAccessToken = accessToken
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.setItem("has_session", "true")
    }
  },

  clearSession(): void {
    inMemoryAccessToken = null
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.removeItem("has_session")
    }
  },

  getActiveSpaceId(): string | null {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return null
    }
    return localStorage.getItem("active_space_id")
  },

  setActiveSpaceId(spaceId: string | null): void {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return
    }
    if (spaceId) {
      localStorage.setItem("active_space_id", spaceId)
    } else {
      localStorage.removeItem("active_space_id")
    }
  },
}

export const authStorage: SyncStorageAdapter = defaultStorage
