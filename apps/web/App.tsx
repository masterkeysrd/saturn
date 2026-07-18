import { Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"
import { AuthLayout } from "@/layouts/auth-layout"
import { LoginView } from "@/features/auth/login-view"
import { RegisterView } from "@/features/auth/register-view"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"

export function App() {
  const { user, logoutUser } = useAuth()

  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
      </Route>

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6">
              <div className="w-full max-w-md animate-in overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-8 text-center shadow-2xl backdrop-blur-xl duration-400 zoom-in-95 fade-in dark:bg-card/40">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary to-accent text-white shadow-xl shadow-primary/20">
                    <span className="font-mono text-3xl font-extrabold">S</span>
                  </div>
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome to Saturn
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  You are successfully signed in.
                </p>

                <div className="mt-8 space-y-2.5 rounded-2xl border border-border/40 bg-muted/30 p-4 text-left text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-foreground">
                      {user?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Username</span>
                    <span className="font-medium text-foreground">
                      @{user?.username || "user"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium text-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="max-w-[180px] truncate font-mono text-xs text-foreground/80">
                      {user?.id}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={logoutUser}
                  variant="outline"
                  className="mt-8 w-full cursor-pointer rounded-2xl py-6 font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          }
        />
      </Route>

      {/* Fallback route: redirect unhandled paths */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
