import { Routes, Route, Navigate, Outlet } from "react-router-dom"
import { AuthLayout } from "@/layouts/auth-layout"
import { LoginView } from "@/features/auth/login-view"
import { RegisterView } from "@/features/auth/register-view"
import { ProtectedRoute } from "@/components/protected-route"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useTheme } from "@/components/theme-provider"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RouteObject } from "react-router-dom"

const routeModules = import.meta.glob<{ routes: RouteObject[] }>(
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
          {featureRoutes.map((route, i) => (
            <Route key={i} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>

      {/* Fallback route: redirect unhandled paths */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
