import {
  Fragment,
  lazy,
  Suspense,
  type ReactNode,
  useEffect,
  useRef,
} from "react"
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { AuthLayout } from "@/layouts/auth-layout"
import { LoginView } from "@/features/auth/login-view"
import { RegisterView } from "@/features/auth/register-view"
import { ResetPasswordView } from "@/features/auth/reset-password-view"
import { ProtectedRoute } from "@/components/protected-route"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { SpaceSelector } from "@/components/space-selector"
import { UserMenu } from "@/components/user-menu"
import { CommandPalette } from "@/components/command-palette"
import { openCommandPalette } from "@/lib/command-palette-events"
import type { SaturnRouteObject } from "@/lib/navigation"
import { resolveBreadcrumbs } from "@/lib/breadcrumbs"
import { useActiveSpaceContext, useMySpaces } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { NoSpaceActiveScreen } from "@/components/no-space-active"
import { GlobalAIDrawer } from "@/features/ai/components/global-ai-drawer"

const DevDesignSystemView = import.meta.env.DEV
  ? lazy(() =>
      import("@/features/design-system/design-system-view").then((m) => ({
        default: m.DesignSystemView,
      }))
    )
  : null

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
          const role = user && firstSpace.ownerId === user.id ? "owner" : ""
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
          const role = user && matchedSpace.ownerId === user.id ? "owner" : ""
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

  if (contextSpaceId !== spaceIdParam) {
    return (
      <div className="flex h-svh flex-1 items-center justify-center p-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
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

function ProtectedAppShell() {
  const { spaceId } = useActiveSpaceContext()
  const location = useLocation()
  const breadcrumbs = resolveBreadcrumbs(location.pathname)

  return (
    <SidebarProvider>
      <CommandPalette />
      <div className="flex h-svh w-full overflow-hidden bg-background">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <SidebarTrigger />
              {(spaceId || breadcrumbs.length > 0) && (
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-4 w-px shrink-0 bg-border/70"
                />
              )}
              {spaceId && <SpaceSelector />}
              {breadcrumbs.length > 0 && (
                <nav
                  aria-label="Breadcrumb"
                  className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex"
                >
                  {breadcrumbs.map((segment, index) => {
                    const isLast = index === breadcrumbs.length - 1
                    const showSlash = Boolean(spaceId) || index > 0
                    return (
                      <Fragment key={`${segment.label}-${index}`}>
                        {showSlash && (
                          <span
                            aria-hidden="true"
                            className="text-border select-none"
                          >
                            /
                          </span>
                        )}
                        {segment.to && !isLast ? (
                          <Link
                            to={segment.to}
                            className="truncate text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {segment.label}
                          </Link>
                        ) : (
                          <span className="truncate font-medium text-foreground">
                            {segment.label}
                          </span>
                        )}
                      </Fragment>
                    )
                  })}
                </nav>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCommandPalette()}
                aria-label="Open Command Palette"
                className="h-8 cursor-pointer gap-2 rounded-lg px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <Search className="size-3.5 shrink-0" />
                <span className="hidden md:inline">Search or jump…</span>
                <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
              </Button>
              <GlobalAIDrawer key={spaceId} />
              <UserMenu />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export function App() {
  const queryClient = useQueryClient()
  const { spaceId } = useActiveSpaceContext()
  const prevSpaceIdRef = useRef(spaceId)

  useEffect(() => {
    if (spaceId && prevSpaceIdRef.current !== spaceId) {
      queryClient.resetQueries({
        predicate: (query) => {
          const firstKey = query.queryKey[0]
          return (
            firstKey !== "/api/v1/spaces" &&
            firstKey !== "/api/v1/identity/users/me"
          )
        },
      })
    }
    prevSpaceIdRef.current = spaceId
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
      {import.meta.env.DEV && DevDesignSystemView && (
        <Route
          path="/__design"
          element={
            <Suspense
              fallback={
                <div className="flex h-svh items-center justify-center p-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              <DevDesignSystemView />
            </Suspense>
          }
        />
      )}

      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
        <Route path="/reset-password" element={<ResetPasswordView />} />
      </Route>

      {/* Protected Routes with Sidebar Layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<ProtectedAppShell />}>
          {/* Calendar top-level space redirect */}
          <Route
            path="/calendar"
            element={
              spaceId ? (
                <Navigate to={`/space/${spaceId}/calendar`} replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Mail top-level space redirect */}
          <Route
            path="/mail"
            element={
              spaceId ? (
                <Navigate to={`/space/${spaceId}/mail`} replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Dynamically registered feature routes */}
          {mappedFeatureRoutes.map((route, i) => (
            <Route
              key={i}
              path={route.path}
              element={
                <Suspense
                  fallback={
                    <div className="flex flex-1 items-center justify-center p-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  }
                >
                  {route.requiresSpace ? (
                    <SpaceGuard>{route.element}</SpaceGuard>
                  ) : (
                    route.element
                  )}
                </Suspense>
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
