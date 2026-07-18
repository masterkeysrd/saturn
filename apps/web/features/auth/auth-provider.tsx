import { useState, useEffect, useCallback, type ReactNode } from "react"
import {
  loginUser,
  registerUser,
  logout,
  useGetCurrentUserQuery,
} from "@/gen/saturn/identity/v1/identity"
import type {
  LoginUserRequest,
  RegisterUserRequest,
} from "@/gen/saturn/identity/v1/identity"
import { AuthContext } from "./auth-context"
import { authStorage } from "@/lib/auth-storage"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return authStorage.getSession().accessToken
  })

  const [isLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch user profile from API when accessToken is present
  const { data: user } = useGetCurrentUserQuery(
    {},
    {
      enabled: !!accessToken,
      refetchOnWindowFocus: false,
    }
  )

  const login = async (req: LoginUserRequest) => {
    setError(null)
    try {
      const res = await loginUser(req)

      // Store tokens only — user profile is fetched from API
      authStorage.setSession(res.accessToken, res.refreshToken)

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
      if (session.refreshToken) {
        await logout({ refreshToken: session.refreshToken })
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
    window.addEventListener("auth:unauthorized", handleUnauthorized)
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized)
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
