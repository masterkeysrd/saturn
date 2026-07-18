import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-gradient-to-tr from-primary to-accent duration-700" />
        </div>
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
