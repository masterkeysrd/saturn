import { Routes, Route, Navigate, Outlet } from "react-router-dom"
import { AuthLayout } from "@/layouts/auth-layout"
import { LoginView } from "@/features/auth/login-view"
import { RegisterView } from "@/features/auth/register-view"
import { ProtectedRoute } from "@/components/protected-route"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import type { RouteObject } from "react-router-dom"

const routeModules = import.meta.glob<{ routes: RouteObject[] }>(
  "./features/**/routes.tsx",
  { eager: true }
)

const featureRoutes = Object.values(routeModules).flatMap(
  (module) => module.routes || []
)

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
                  <div className="flex h-14 shrink-0 items-center border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger />
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
