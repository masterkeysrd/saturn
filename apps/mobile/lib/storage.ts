import * as SecureStore from "expo-secure-store"
import type { StorageAdapter, AuthSession } from "@saturn/api/storage"

let inMemoryToken: string | null = null

const KEYS = {
  ACCESS_TOKEN: "saturn_access_token",
  ACTIVE_SPACE_ID: "saturn_active_space_id",
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
}
