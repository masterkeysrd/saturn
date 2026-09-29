import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import * as LocalAuthentication from "expo-local-authentication"
import { useQueryClient } from "@tanstack/react-query"
import { configureClient } from "@saturn/api/client"
import type { AuthSession } from "@saturn/api/storage"
import {
  loginUser,
  registerUser,
  logout as apiLogout,
  useGetCurrentUserQuery,
  type LoginUserRequest,
  type LoginUserResponse,
  type RegisterUserRequest,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  mobileStorage,
  isBiometricEnabled,
  setBiometricEnabled,
  getStoredUserProfile,
  setStoredUserProfile,
  clearDeviceEnrollment,
} from "./storage"
import {
  checkBiometricStatus,
  isDeviceBiometricsReady,
  checkDeviceEnrolled,
  loginWithBiometrics as apiLoginWithBiometrics,
  enrollDeviceBiometrics,
} from "./biometrics"
import { decodeJwt, isTokenExpired } from "./jwt"
import {
  getApiBaseUrl,
  loadServerUrl,
  setServerUrl as setConfigServerUrl,
  resetServerUrl as resetConfigServerUrl,
} from "./config"

// Configure client storage and base URL synchronously at module load
configureClient({
  baseUrl: getApiBaseUrl(),
  storage: mobileStorage,
})

export interface AuthUser {
  id: string
  email: string
  name: string
  username?: string
  role?: string
  avatarUrl?: string
}

export interface AuthContextType {
  user: AuthUser | null
  session: AuthSession | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isBiometricSupported: boolean
  isBiometricActive: boolean
  isDeviceEnrolled: boolean
  biometricLabel: string
  activeSpaceId: string | null
  serverUrl: string
  error: string | null
  login: (req: LoginUserRequest) => Promise<LoginUserResponse>
  loginWithBiometrics: () => Promise<LoginUserResponse>
  enrollBiometrics: (
    deviceName?: string,
    totpCode?: string
  ) => Promise<{ deviceId: string }>
  unenrollBiometrics: () => Promise<void>
  register: (req: RegisterUserRequest) => Promise<void>
  logout: () => Promise<void>
  switchSpace: (spaceId: string | null) => Promise<void>
  setActiveSpace: (spaceId: string | null) => Promise<void>
  toggleBiometrics: (enabled: boolean, totpCode?: string) => Promise<boolean>
  authenticateWithBiometrics: () => Promise<boolean>
  updateServerUrl: (url: string) => Promise<string>
  resetServerUrl: () => Promise<string>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [cachedUser, setCachedUser] = useState<AuthUser | null>(null)
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isBiometricSupported, setIsBiometricSupported] = useState(false)
  const [isBiometricActive, setIsBiometricActive] = useState(false)
  const [isDeviceEnrolled, setIsDeviceEnrolled] = useState(false)
  const [biometricLabel, setBiometricLabel] = useState("Biometrics")

  const [serverUrl, setServerUrl] = useState<string>(getApiBaseUrl())

  // Configure API client with onRefreshed and onUnauthorized handlers
  useEffect(() => {
    async function initClient() {
      const activeUrl = await loadServerUrl()
      setServerUrl(activeUrl)
      configureClient({
        baseUrl: activeUrl,
        storage: mobileStorage,
        onRefreshed: (newAccessToken: string) => {
          setAccessToken(newAccessToken)
          setSession({ accessToken: newAccessToken, hasSession: true })
        },
        onUnauthorized: () => {
          clearDeviceEnrollment().catch(() => {})
          setIsDeviceEnrolled(false)
          setIsBiometricActive(false)
          mobileStorage.clearSession()
          setStoredUserProfile(null)
          setCachedUser(null)
          setSession({ accessToken: null, hasSession: false })
          setAccessToken(null)
        },
      })
    }
    initClient()
  }, [])

  // Check hardware biometric capabilities and device enrollment
  useEffect(() => {
    async function checkBiometrics() {
      try {
        const [status, ready, enrolled] = await Promise.all([
          checkBiometricStatus(),
          isDeviceBiometricsReady(),
          checkDeviceEnrolled(),
        ])
        setIsBiometricSupported(status.hasHardware && status.isEnrolled)
        setBiometricLabel(status.label)
        setIsDeviceEnrolled(enrolled)
        setIsBiometricActive(ready)
      } catch {
        setIsBiometricSupported(false)
      }
    }

    checkBiometrics()
  }, [])

  // Cold start session restoration
  useEffect(() => {
    async function initSession() {
      try {
        const [
          storedSession,
          storedSpaceId,
          bioEnabled,
          storedProfile,
          storedRefreshToken,
        ] = await Promise.all([
          mobileStorage.getSession(),
          mobileStorage.getActiveSpaceId(),
          isBiometricEnabled(),
          getStoredUserProfile(),
          mobileStorage.getRefreshToken?.() || null,
        ])

        if (storedProfile) {
          setCachedUser(storedProfile)
        }

        let validAccessToken = storedSession.accessToken
        let hasActiveSession = storedSession.hasSession

        // Proactively refresh expired or nearly expired access tokens
        if (validAccessToken && isTokenExpired(validAccessToken)) {
          if (storedRefreshToken) {
            try {
              const refreshUrl = `${getApiBaseUrl()}/api/v1/identity/sessions:refresh`
              const res = await fetch(refreshUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: storedRefreshToken }),
              })

              if (res.ok) {
                const data = await res.json()
                if (data.accessToken) {
                  validAccessToken = data.accessToken
                  hasActiveSession = true
                  await mobileStorage.setSession(data.accessToken)
                  if (data.refreshToken && mobileStorage.setRefreshToken) {
                    await mobileStorage.setRefreshToken(data.refreshToken)
                  }
                } else {
                  hasActiveSession = false
                }
              } else {
                hasActiveSession = false
              }
            } catch {
              hasActiveSession = false
            }
          } else {
            hasActiveSession = false
          }
        }

        if (hasActiveSession && validAccessToken) {
          // If biometric unlock is enabled, prompt user before unlocking data
          if (bioEnabled) {
            const authResult = await LocalAuthentication.authenticateAsync({
              promptMessage: "Unlock Saturn",
              cancelLabel: "Cancel",
              fallbackLabel: "Use PIN",
            })

            if (!authResult.success) {
              setIsLoading(false)
              return
            }
          }

          setSession({ accessToken: validAccessToken, hasSession: true })
          setAccessToken(validAccessToken)
          setActiveSpaceId(storedSpaceId)
        } else if (!hasActiveSession && storedSession.hasSession) {
          // Session could not be restored or refreshed; cleanly reset
          await mobileStorage.clearSession()
          setStoredUserProfile(null)
          setCachedUser(null)
          setSession({ accessToken: null, hasSession: false })
          setAccessToken(null)
        }
      } catch (err) {
        console.error("Failed to restore session from SecureStore", err)
      } finally {
        setIsLoading(false)
      }
    }

    initSession()
  }, [])

  // Fetch full user profile from API when accessToken is present
  const { data: apiUser } = useGetCurrentUserQuery(
    {},
    {
      enabled: !!accessToken,
      refetchOnWindowFocus: false,
    }
  )

  // Sync fresh profile to local secure storage
  useEffect(() => {
    if (apiUser && accessToken) {
      const decoded = decodeJwt(accessToken)
      const role = decoded?.role || "user"
      const profile: AuthUser = {
        id: apiUser.id || decoded?.sub || "",
        email: apiUser.email || decoded?.email || "",
        name:
          apiUser.name ||
          apiUser.username ||
          decoded?.name ||
          decoded?.username ||
          "User",
        username: apiUser.username || decoded?.username,
        role,
        avatarUrl: apiUser.avatarUrl,
      }
      setStoredUserProfile(profile)
    }
  }, [apiUser, accessToken])

  // Derive the active user, preferring API profile, then cached profile, then JWT claims
  const user = useMemo<AuthUser | null>(() => {
    if (!accessToken) return null
    const decoded = decodeJwt(accessToken)
    const role = decoded?.role || "user"

    if (apiUser) {
      return {
        id: apiUser.id || decoded?.sub || "",
        email: apiUser.email || decoded?.email || "",
        name:
          apiUser.name ||
          apiUser.username ||
          decoded?.name ||
          decoded?.username ||
          "User",
        username: apiUser.username || decoded?.username,
        role,
        avatarUrl: apiUser.avatarUrl,
      }
    }

    if (cachedUser) {
      return cachedUser
    }

    return {
      id: decoded?.sub || "",
      email: decoded?.email || "",
      name: decoded?.name || decoded?.username || "User",
      username: decoded?.username,
      role,
    }
  }, [accessToken, apiUser, cachedUser])

  const login = async (req: LoginUserRequest): Promise<LoginUserResponse> => {
    setError(null)
    try {
      const res = await loginUser(req)
      if (res.accessToken) {
        await mobileStorage.setSession(res.accessToken)
        if (res.refreshToken && mobileStorage.setRefreshToken) {
          await mobileStorage.setRefreshToken(res.refreshToken)
        }

        setAccessToken(res.accessToken)
        setSession({ accessToken: res.accessToken, hasSession: true })
      }
      return res
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to authenticate"
      setError(message)
      throw err
    }
  }

  const loginWithBiometrics = async (): Promise<LoginUserResponse> => {
    setError(null)
    try {
      const res = await apiLoginWithBiometrics()
      if (res.accessToken) {
        await mobileStorage.setSession(res.accessToken)
        if (res.refreshToken && mobileStorage.setRefreshToken) {
          await mobileStorage.setRefreshToken(res.refreshToken)
        }

        setAccessToken(res.accessToken)
        setSession({ accessToken: res.accessToken, hasSession: true })
      }
      return res
    } catch (err: unknown) {
      const ready = await isDeviceBiometricsReady().catch(() => false)
      if (!ready) {
        setIsDeviceEnrolled(false)
        setIsBiometricActive(false)
      }
      const message =
        err instanceof Error
          ? err.message
          : "Failed to authenticate with biometrics"
      setError(message)
      throw err
    }
  }

  const enrollBiometrics = async (
    deviceName?: string,
    totpCode?: string
  ): Promise<{ deviceId: string }> => {
    setError(null)
    try {
      const res = await enrollDeviceBiometrics({ deviceName, totpCode })
      setIsDeviceEnrolled(true)
      setIsBiometricActive(true)
      return res
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to enroll device"
      setError(message)
      throw err
    }
  }

  const unenrollBiometrics = async (): Promise<void> => {
    setError(null)
    try {
      await clearDeviceEnrollment()
      setIsDeviceEnrolled(false)
      setIsBiometricActive(false)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to unenroll device"
      setError(message)
      throw err
    }
  }

  const register = async (req: RegisterUserRequest) => {
    setError(null)
    try {
      await registerUser(req)
      // Automatically log in after registration
      await login({
        userPassword: {
          identifier: req.email || req.username,
          password: req.password,
        },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to register"
      setError(message)
      throw err
    }
  }

  const logout = async () => {
    const refreshToken = (await mobileStorage.getRefreshToken?.()) || ""
    try {
      if (refreshToken) {
        await apiLogout({ refreshToken })
      }
    } catch {
      // Local logout proceeds even if remote server revocation fails
    } finally {
      await clearDeviceEnrollment()
      setIsDeviceEnrolled(false)
      setIsBiometricActive(false)
      await mobileStorage.clearSession()
      await mobileStorage.setActiveSpaceId(null)
      await setStoredUserProfile(null)
      setCachedUser(null)
      setSession({ accessToken: null, hasSession: false })
      setAccessToken(null)
      setActiveSpaceId(null)
      queryClient.clear()
    }
  }

  const switchSpace = async (spaceId: string | null) => {
    await mobileStorage.setActiveSpaceId(spaceId)
    setActiveSpaceId(spaceId)
    queryClient.invalidateQueries()
  }

  const toggleBiometrics = async (
    enabled: boolean,
    totpCode?: string
  ): Promise<boolean> => {
    if (!enabled) {
      await setBiometricEnabled(false)
      setIsBiometricActive(false)
      return true
    }

    if (!isBiometricSupported) return false

    const enrolled = isDeviceEnrolled || (await checkDeviceEnrolled())
    if (enrolled) {
      await setBiometricEnabled(true)
      setIsDeviceEnrolled(true)
      setIsBiometricActive(true)
      return true
    }

    await enrollBiometrics(undefined, totpCode)
    return true
  }

  const authenticateWithBiometrics = async (): Promise<boolean> => {
    if (!isBiometricSupported) return false
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Saturn",
      cancelLabel: "Cancel",
    })
    return res.success
  }

  const updateServerUrl = async (url: string): Promise<string> => {
    const updated = await setConfigServerUrl(url)
    setServerUrl(updated)
    queryClient.clear()
    return updated
  }

  const resetServerUrl = async (): Promise<string> => {
    const reset = await resetConfigServerUrl()
    setServerUrl(reset)
    queryClient.clear()
    return reset
  }

  const isAuthenticated = Boolean(session?.hasSession && accessToken)

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken,
        isLoading,
        isAuthenticated,
        isBiometricSupported,
        isBiometricActive,
        isDeviceEnrolled,
        biometricLabel,
        activeSpaceId,
        serverUrl,
        error,
        login,
        loginWithBiometrics,
        enrollBiometrics,
        unenrollBiometrics,
        register,
        logout,
        switchSpace,
        setActiveSpace: switchSpace,
        toggleBiometrics,
        authenticateWithBiometrics,
        updateServerUrl,
        resetServerUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
