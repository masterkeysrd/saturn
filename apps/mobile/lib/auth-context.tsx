import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import { configureClient } from "@saturn/api/client"
import type { AuthSession } from "@saturn/api/storage"
import { mobileStorage } from "./storage"

interface AuthContextType {
  session: AuthSession | null
  isLoading: boolean
  isAuthenticated: boolean
  activeSpaceId: string | null
  setSessionToken: (token: string) => Promise<void>
  setActiveSpace: (spaceId: string | null) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Initialize Saturn client with mobile storage
configureClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080",
  storage: mobileStorage,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadStoredState() {
      try {
        const [storedSession, storedSpaceId] = await Promise.all([
          mobileStorage.getSession(),
          mobileStorage.getActiveSpaceId(),
        ])
        setSession(storedSession)
        setActiveSpaceId(storedSpaceId)
      } catch (err) {
        console.error("Failed to load auth state from SecureStore", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadStoredState()
  }, [])

  const setSessionToken = async (token: string) => {
    await mobileStorage.setSession(token)
    setSession({ accessToken: token, hasSession: true })
  }

  const setActiveSpace = async (spaceId: string | null) => {
    await mobileStorage.setActiveSpaceId(spaceId)
    setActiveSpaceId(spaceId)
  }

  const logout = async () => {
    await mobileStorage.clearSession()
    await mobileStorage.setActiveSpaceId(null)
    setSession({ accessToken: null, hasSession: false })
    setActiveSpaceId(null)
  }

  const isAuthenticated = Boolean(session?.hasSession && session?.accessToken)

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        isAuthenticated,
        activeSpaceId,
        setSessionToken,
        setActiveSpace,
        logout,
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
