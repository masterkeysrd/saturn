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
  type RegisterUserRequest,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  mobileStorage,
  isBiometricEnabled,
  setBiometricEnabled,
  getStoredUserProfile,
  setStoredUserProfile,
} from "./storage"
import { decodeJwt } from "./jwt"
import { getApiBaseUrl } from "./config"

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
  activeSpaceId: string | null
  error: string | null
  login: (req: LoginUserRequest) => Promise<void>
  register: (req: RegisterUserRequest) => Promise<void>
  logout: () => Promise<void>
  switchSpace: (spaceId: string | null) => Promise<void>
  setActiveSpace: (spaceId: string | null) => Promise<void>
  toggleBiometrics: (enabled: boolean) => Promise<boolean>
  authenticateWithBiometrics: () => Promise<boolean>
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

  // Configure API client with mobile storage & unauthorized listener
  useEffect(() => {
    configureClient({
      baseUrl: getApiBaseUrl(),
      storage: mobileStorage,
      onUnauthorized: () => {
        mobileStorage.clearSession()
        setStoredUserProfile(null)
        setCachedUser(null)
        setSession({ accessToken: null, hasSession: false })
        setAccessToken(null)
      },
    })
  }, [])

  // Check hardware biometric capabilities
  useEffect(() => {
    async function checkBiometrics() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync()
        const isEnrolled = await LocalAuthentication.isEnrolledAsync()
        setIsBiometricSupported(hasHardware && isEnrolled)

        const enabled = await isBiometricEnabled()
        setIsBiometricActive(enabled)
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
        const [storedSession, storedSpaceId, bioEnabled, storedProfile] =
          await Promise.all([
            mobileStorage.getSession(),
            mobileStorage.getActiveSpaceId(),
            isBiometricEnabled(),
            getStoredUserProfile(),
          ])

        if (storedProfile) {
          setCachedUser(storedProfile)
        }

        if (storedSession.hasSession && storedSession.accessToken) {
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

          setSession(storedSession)
          setAccessToken(storedSession.accessToken)
          setActiveSpaceId(storedSpaceId)
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

  const login = async (req: LoginUserRequest) => {
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
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to authenticate"
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

  const toggleBiometrics = async (enabled: boolean): Promise<boolean> => {
    if (enabled && isBiometricSupported) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to enable Biometric Unlock",
      })
      if (!result.success) {
        return false
      }
    }

    await setBiometricEnabled(enabled)
    setIsBiometricActive(enabled)
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
        activeSpaceId,
        error,
        login,
        register,
        logout,
        switchSpace,
        setActiveSpace: switchSpace,
        toggleBiometrics,
        authenticateWithBiometrics,
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
