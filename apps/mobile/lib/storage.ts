import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import type { StorageAdapter, AuthSession } from "@saturn/api/storage"

let inMemoryToken: string | null = null

const KEYS = {
  ACCESS_TOKEN: "saturn_access_token",
  REFRESH_TOKEN: "saturn_refresh_token",
  ACTIVE_SPACE_ID: "saturn_active_space_id",
  BIOMETRIC_ENABLED: "saturn_biometric_enabled",
  USER_PROFILE: "saturn_user_profile",
  REMEMBERED_IDENTIFIER: "saturn_remembered_identifier",
} as const

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key)
      }
    } catch {
      return null
    }
    return null
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value)
      }
    } catch {}
    return
  }
  try {
    await SecureStore.setItemAsync(key, value)
  } catch {}
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key)
      }
    } catch {}
    return
  }
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {}
}

export const mobileStorage: StorageAdapter = {
  async getSession(): Promise<AuthSession> {
    if (inMemoryToken) {
      return { accessToken: inMemoryToken, hasSession: true }
    }
    try {
      const storedToken = await secureGet(KEYS.ACCESS_TOKEN)
      if (storedToken) {
        inMemoryToken = storedToken
        return { accessToken: storedToken, hasSession: true }
      }
    } catch {
      // Fallback
    }
    return { accessToken: null, hasSession: false }
  },

  async setSession(accessToken: string): Promise<void> {
    inMemoryToken = accessToken
    await secureSet(KEYS.ACCESS_TOKEN, accessToken)
  },

  async clearSession(): Promise<void> {
    inMemoryToken = null
    await Promise.all([
      secureDelete(KEYS.ACCESS_TOKEN),
      secureDelete(KEYS.REFRESH_TOKEN),
      secureDelete(KEYS.USER_PROFILE),
    ])
  },

  async getActiveSpaceId(): Promise<string | null> {
    return secureGet(KEYS.ACTIVE_SPACE_ID)
  },

  async setActiveSpaceId(spaceId: string | null): Promise<void> {
    if (spaceId) {
      await secureSet(KEYS.ACTIVE_SPACE_ID, spaceId)
    } else {
      await secureDelete(KEYS.ACTIVE_SPACE_ID)
    }
  },

  async getRefreshToken(): Promise<string | null> {
    return secureGet(KEYS.REFRESH_TOKEN)
  },

  async setRefreshToken(refreshToken: string): Promise<void> {
    await secureSet(KEYS.REFRESH_TOKEN, refreshToken)
  },
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return secureGet(KEYS.REFRESH_TOKEN)
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  await secureSet(KEYS.REFRESH_TOKEN, token)
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await secureGet(KEYS.BIOMETRIC_ENABLED)
  return val === "true"
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await secureSet(KEYS.BIOMETRIC_ENABLED, "true")
  } else {
    await secureDelete(KEYS.BIOMETRIC_ENABLED)
  }
}

export interface StoredUserProfile {
  id: string
  email: string
  name: string
  username?: string
  role?: string
  avatarUrl?: string
}

export async function getStoredUserProfile(): Promise<StoredUserProfile | null> {
  try {
    const raw = await secureGet(KEYS.USER_PROFILE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function setStoredUserProfile(
  user: StoredUserProfile | null
): Promise<void> {
  if (user) {
    await secureSet(KEYS.USER_PROFILE, JSON.stringify(user))
  } else {
    await secureDelete(KEYS.USER_PROFILE)
  }
}

export async function getRememberedIdentifier(): Promise<string | null> {
  return secureGet(KEYS.REMEMBERED_IDENTIFIER)
}

export async function setRememberedIdentifier(
  identifier: string | null
): Promise<void> {
  if (identifier && identifier.trim()) {
    await secureSet(KEYS.REMEMBERED_IDENTIFIER, identifier.trim())
  } else {
    await secureDelete(KEYS.REMEMBERED_IDENTIFIER)
  }
}
