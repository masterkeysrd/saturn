import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-primary duration-700" />
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Outlet />
  }

  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const loginTarget =
    returnTo && returnTo !== "/"
      ? `/login?return_to=${encodeURIComponent(returnTo)}`
      : "/login"

  return <Navigate to={loginTarget} replace />
}
