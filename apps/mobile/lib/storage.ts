import * as SecureStore from "expo-secure-store"
import type { StorageAdapter, AuthSession } from "@saturn/api/storage"

let inMemoryToken: string | null = null

const KEYS = {
  ACCESS_TOKEN: "saturn_access_token",
  REFRESH_TOKEN: "saturn_refresh_token",
  ACTIVE_SPACE_ID: "saturn_active_space_id",
  BIOMETRIC_ENABLED: "saturn_biometric_enabled",
  USER_PROFILE: "saturn_user_profile",
} as const

export const mobileStorage: StorageAdapter = {
  async getSession(): Promise<AuthSession> {
    if (inMemoryToken) {
      return { accessToken: inMemoryToken, hasSession: true }
    }
    try {
      const storedToken = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN)
      if (storedToken) {
        inMemoryToken = storedToken
        return { accessToken: storedToken, hasSession: true }
      }
    } catch {
      // Fallback if secure store is unavailable
    }
    return { accessToken: null, hasSession: false }
  },

  async setSession(accessToken: string): Promise<void> {
    inMemoryToken = accessToken
    try {
      await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken)
    } catch {
      // Fallback
    }
  },

  async clearSession(): Promise<void> {
    inMemoryToken = null
    try {
      await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN)
      await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN)
      await SecureStore.deleteItemAsync(KEYS.USER_PROFILE)
    } catch {
      // Fallback
    }
  },

  async getActiveSpaceId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.ACTIVE_SPACE_ID)
    } catch {
      return null
    }
  },

  async setActiveSpaceId(spaceId: string | null): Promise<void> {
    try {
      if (spaceId) {
        await SecureStore.setItemAsync(KEYS.ACTIVE_SPACE_ID, spaceId)
      } else {
        await SecureStore.deleteItemAsync(KEYS.ACTIVE_SPACE_ID)
      }
    } catch {
      // Fallback
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN)
    } catch {
      return null
    }
  },

  async setRefreshToken(refreshToken: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken)
    } catch {
      // Fallback
    }
  },
}

export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN)
  } catch {
    return null
  }
}

export async function setStoredRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token)
  } catch {
    // Fallback
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(KEYS.BIOMETRIC_ENABLED)
    return val === "true"
  } catch {
    return false
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(KEYS.BIOMETRIC_ENABLED, "true")
    } else {
      await SecureStore.deleteItemAsync(KEYS.BIOMETRIC_ENABLED)
    }
  } catch {
    // Fallback
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
    const raw = await SecureStore.getItemAsync(KEYS.USER_PROFILE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function setStoredUserProfile(
  user: StoredUserProfile | null
): Promise<void> {
  try {
    if (user) {
      await SecureStore.setItemAsync(KEYS.USER_PROFILE, JSON.stringify(user))
    } else {
      await SecureStore.deleteItemAsync(KEYS.USER_PROFILE)
    }
  } catch {
    // Fallback
  }
}
