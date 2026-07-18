import { createContext } from "react"
import type {
  User,
  LoginUserRequest,
  RegisterUserRequest,
} from "@/gen/saturn/identity/v1/identity"

export interface AuthUser extends Partial<User> {
  role?: "admin" | "user"
}

export interface AuthContextType {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (req: LoginUserRequest) => Promise<void>
  register: (req: RegisterUserRequest) => Promise<void>
  logoutUser: () => Promise<void>
  error: string | null
  setError: (err: string | null) => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
