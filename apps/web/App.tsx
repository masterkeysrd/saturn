import { type ReactNode, useEffect } from "react"
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useParams,
  useNavigate,
} from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { AuthLayout } from "@/layouts/auth-layout"
import { LoginView } from "@/features/auth/login-view"
import { RegisterView } from "@/features/auth/register-view"
import { ProtectedRoute } from "@/components/protected-route"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useTheme } from "@/components/theme-provider"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SaturnRouteObject } from "@/lib/navigation"
import { useActiveSpaceContext, useMySpaces } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { NoSpaceActiveScreen } from "@/components/no-space-active"

function SpaceGuard({ children }: { children: ReactNode }) {
  const { spaceId: spaceIdParam } = useParams<{ spaceId: string }>()
  const { spaceId: contextSpaceId, switchSpace } = useActiveSpaceContext()
  const { spaces, isLoading: spacesLoading } = useMySpaces()
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (spaceIdParam) {
      if (spaces.length === 0) return

      if (spaceIdParam === "default") {
        const firstSpace = spaces[0]
        if (firstSpace?.id) {
          const role =
            user && firstSpace.ownerId === user.id ? "owner" : "member"
          switchSpace({
            spaceId: firstSpace.id,
            spaceName: firstSpace.name || "",
            spaceRole: role,
          })
        }
        navigate("/", { replace: true })
        return
      }

      const matchedSpace = spaces.find((s) => s.id === spaceIdParam)
      if (matchedSpace) {
        if (spaceIdParam !== contextSpaceId) {
          const role =
            user && matchedSpace.ownerId === user.id ? "owner" : "member"
          switchSpace({
            spaceId: spaceIdParam,
            spaceName: matchedSpace.name || "",
            spaceRole: role,
          })
        }
      } else {
        navigate("/", { replace: true })
      }
    }
  }, [spaceIdParam, contextSpaceId, switchSpace, spaces, user, navigate])

  if (spacesLoading) {
    return (
      <div className="flex h-svh flex-1 items-center justify-center p-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!spaceIdParam || spaces.length === 0) {
    return <NoSpaceActiveScreen />
  }

  return <>{children}</>
}

const routeModules = import.meta.glob<{ routes: SaturnRouteObject[] }>(
  "./features/**/routes.tsx",
  { eager: true }
)

const featureRoutes = Object.values(routeModules).flatMap(
  (module) => module.routes || []
)

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-8 w-8 cursor-pointer rounded-full hover:bg-muted/80"
      title="Toggle Theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-500" />
      ) : (
        <Moon className="h-4 w-4 text-foreground" />
      )}
    </Button>
  )
}

export function App() {
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()

  useEffect(() => {
    if (spaceId) {
      queryClient.resetQueries()
    }
  }, [spaceId, queryClient])

  const mappedFeatureRoutes = featureRoutes.map((route) => {
    if (route.requiresSpace && route.path) {
      let rest = route.path
      if (rest.startsWith("/space/")) {
        rest = rest.slice(7)
      } else if (rest.startsWith("/")) {
        rest = rest.slice(1)
      }
      return {
        ...route,
        path: `/space/:spaceId/${rest}`,
      }
    }
    return route
  })

  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
      </Route>

      {/* Protected Routes with Sidebar Layout */}
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <SidebarProvider>
              <div className="flex h-svh w-full overflow-hidden bg-background">
                <AppSidebar />
                <main className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger />
                    <ThemeToggle />
                  </div>
                  <div className="flex flex-1 flex-col overflow-y-auto p-6">
                    <Outlet />
                  </div>
                </main>
              </div>
            </SidebarProvider>
          }
        >
          {/* Dynamically registered feature routes */}
          {mappedFeatureRoutes.map((route, i) => (
            <Route
              key={i}
              path={route.path}
              element={
                route.requiresSpace ? (
                  <SpaceGuard>{route.element}</SpaceGuard>
                ) : (
                  route.element
                )
              }
            />
          ))}
        </Route>
      </Route>

      {/* Fallback route: redirect unhandled paths */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
