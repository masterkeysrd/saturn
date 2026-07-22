import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import {
  loginUser,
  registerUser,
  logout,
  refreshSession,
  useGetCurrentUserQuery,
} from "@/gen/saturn/identity/v1/identity"
import type {
  LoginUserRequest,
  RegisterUserRequest,
} from "@/gen/saturn/identity/v1/identity"
import { AuthContext, type AuthUser } from "./auth-context"
import { authStorage } from "@/lib/auth-storage"
import { decodeJwt } from "@/lib/jwt"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return false
    return authStorage.getSession().hasSession
  })
  const [error, setError] = useState<string | null>(null)

  // Silent refresh session initialization on boot
  useEffect(() => {
    const initSession = async () => {
      const session = authStorage.getSession()
      if (session.hasSession) {
        try {
          const res = await refreshSession({ refreshToken: "" })
          authStorage.setSession(res.accessToken)
          setAccessToken(res.accessToken)
        } catch {
          authStorage.clearSession()
        } finally {
          setIsLoading(false)
        }
      } else {
        setIsLoading(false)
      }
    }
    initSession()
  }, [])

  // Fetch user profile from API when accessToken is present
  const { data: apiUser } = useGetCurrentUserQuery(
    {},
    {
      enabled: !!accessToken,
      refetchOnWindowFocus: false,
    }
  )

  // Extract role claim from token and combine with API profile details
  const user = useMemo<AuthUser | null>(() => {
    if (!accessToken) return null
    const decoded = decodeJwt(accessToken)
    const role = decoded?.role || "user"

    if (apiUser) {
      return {
        ...apiUser,
        role,
      }
    }

    return {
      id: decoded?.sub || "",
      email: decoded?.email || "",
      name: decoded?.name || decoded?.username || "User",
      role,
    }
  }, [accessToken, apiUser])

  const login = async (req: LoginUserRequest) => {
    setError(null)
    try {
      const res = await loginUser(req)

      // Store tokens only — user profile is fetched from API
      authStorage.setSession(res.accessToken)

      setAccessToken(res.accessToken)
    } catch (err) {
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
          identifier: req.email,
          password: req.password,
        },
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to register account"
      setError(message)
      throw err
    }
  }

  const logoutUser = useCallback(async () => {
    const session = authStorage.getSession()
    try {
      if (session.hasSession) {
        await logout({ refreshToken: "" })
      }
    } catch {
      // Proceed with local logout even if server revocation fails
    } finally {
      authStorage.clearSession()
      setAccessToken(null)
      setError(null)
    }
  }, [])

  useEffect(() => {
    const handleUnauthorized = () => {
      logoutUser()
    }
    const handleRefreshed = (e: Event) => {
      const customEvent = e as CustomEvent<{ accessToken: string }>
      setAccessToken(customEvent.detail.accessToken)
    }
    window.addEventListener("auth:unauthorized", handleUnauthorized)
    window.addEventListener("auth:refreshed", handleRefreshed)
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized)
      window.removeEventListener("auth:refreshed", handleRefreshed)
    }
  }, [logoutUser])

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
        register,
        logoutUser,
        error,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
