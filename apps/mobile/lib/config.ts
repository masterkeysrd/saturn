import Constants from "expo-constants"

/**
 * Resolves the backend API base URL:
 * 1. Explicit EXPO_PUBLIC_API_URL from .env
 * 2. Host computer LAN IP automatically detected by Expo on physical devices (e.g. http://<computer-ip>:8080)
 * 3. Fallback to http://localhost:8080 (for web or simulator)
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL
  }

  // On physical devices, Constants.expoConfig?.hostUri contains "<computer-ip>:<metro-port>"
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost

  if (hostUri) {
    const hostIp = hostUri.split(":")[0]
    if (hostIp) {
      return `http://${hostIp}:8080`
    }
  }

  return "http://localhost:8080"
}
