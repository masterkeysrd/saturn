import { useState, type ReactNode } from "react"
import {
  loginUser,
  registerUser,
  logout,
} from "@/gen/saturn/identity/v1/identity"
import type {
  LoginUserRequest,
  RegisterUserRequest,
  User,
} from "@/gen/saturn/identity/v1/identity"
import { AuthContext } from "./auth-context"
import { authStorage } from "@/lib/auth-storage"
import { decodeJwt } from "@/lib/jwt"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return authStorage.getSession().accessToken
  })

  const [user, setUser] = useState<Partial<User> | null>(() => {
    const session = authStorage.getSession()
    if (session.user) return session.user
    if (session.accessToken) {
      const decoded = decodeJwt(session.accessToken)
      if (decoded) {
        return {
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name || decoded.username,
        }
      }
    }
    return null
  })

  // Since we initialize state synchronously on load, we are never "loading" session on mount
  const [isLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (req: LoginUserRequest) => {
    setError(null)
    try {
      const res = await loginUser(req)

      // Construct user profile from token & response
      const decoded = decodeJwt(res.accessToken)
      const userProfile: Partial<User> = {
        id: res.userId,
        email: decoded?.email || "",
        name: decoded?.name || decoded?.username || "User",
      }

      // Store using single authStorage gateway
      authStorage.setSession(res.accessToken, res.refreshToken, userProfile)

      setAccessToken(res.accessToken)
      setUser(userProfile)
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

  const logoutUser = async () => {
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
      setUser(null)
      setError(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
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
