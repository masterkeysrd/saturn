import { Navigate } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
