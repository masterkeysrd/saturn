import AsyncStorage from "@react-native-async-storage/async-storage"
import Constants from "expo-constants"
import { configureClient } from "@saturn/api/client"

/**
 * Official default production host for Saturn Life OS.
 */
export const DEFAULT_SERVER_URL = "https://saturn.masterkeys.dev"

export const SERVER_URL_STORAGE_KEY = "@saturn/server_url"

let cachedServerUrl: string | null = null

/**
 * Returns the default server URL:
 * 1. Explicit EXPO_PUBLIC_API_URL from .env (for local development)
 * 2. Otherwise default production server (https://saturn.masterkeys.dev)
 */
export function getDefaultServerUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL
  }

  // On physical devices running Expo Go, Constants.expoConfig?.hostUri contains "<computer-ip>:<metro-port>"
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost

  if (hostUri) {
    const hostIp = hostUri.split(":")[0]
    if (hostIp && hostIp !== "localhost" && hostIp !== "127.0.0.1") {
      // Local dev LAN IP when running Expo with Metro
      return `http://${hostIp}:8080`
    }
  }

  return DEFAULT_SERVER_URL
}

/**
 * Synchronous getter for current API base URL.
 */
export function getApiBaseUrl(): string {
  return cachedServerUrl || getDefaultServerUrl()
}

/**
 * Loads the persisted server URL from AsyncStorage into memory and updates the API client.
 */
export async function loadServerUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY)
    if (stored && stored.trim()) {
      cachedServerUrl = stored.trim()
      configureClient({ baseUrl: cachedServerUrl })
      return cachedServerUrl
    }
  } catch {
    // Fall back to default
  }

  cachedServerUrl = getDefaultServerUrl()
  configureClient({ baseUrl: cachedServerUrl })
  return cachedServerUrl
}

/**
 * Validates, normalizes, and persists a new server URL.
 */
export async function setServerUrl(url: string): Promise<string> {
  let cleaned = url.trim()

  // Default to https:// if scheme is missing
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`
  }

  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "")

  cachedServerUrl = cleaned
  await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, cleaned)
  configureClient({ baseUrl: cleaned })
  return cleaned
}

/**
 * Resets the server URL back to the default production instance.
 */
export async function resetServerUrl(): Promise<string> {
  await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY)
  cachedServerUrl = getDefaultServerUrl()
  configureClient({ baseUrl: cachedServerUrl })
  return cachedServerUrl
}
