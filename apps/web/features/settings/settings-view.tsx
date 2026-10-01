import { useEffect, useMemo } from "react"
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useSearchParams,
} from "react-router-dom"
import {
  Settings,
  UserIcon,
  Building2Icon,
  LaptopIcon,
  KeyRoundIcon,
  ActivityIcon,
  Sliders,
  Blocks,
} from "lucide-react"
import { PageLayout } from "@/components/ui/page-layout"
import { cn } from "@/lib/utils"
import { useAuth } from "@/features/auth/use-auth"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { AccountSettingsView } from "./account-settings-view"
import { CredentialsSettingsView } from "./credentials-settings-view"
import { SessionsDevicesSettingsView } from "./sessions-devices-settings-view"
import { ActivityLogSettingsView } from "./activity-log-settings-view"
import { SpaceSettings } from "./components/space-settings"
import { SpacePreferences } from "./components/space-preferences"
import { IntegrationSettings } from "./components/integration-settings"

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

export function SettingsView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { spaceRole } = useActiveSpaceContext()

  const isWorkspaceAdmin =
    user?.role === "admin" ||
    spaceRole?.toLowerCase() === "owner" ||
    spaceRole?.toLowerCase() === "admin"

  const navSections: NavSection[] = useMemo(
    () => [
      {
        title: "Personal Account",
        items: [
          {
            to: "/settings/account",
            label: "Profile & Identity",
            icon: UserIcon,
          },
        ],
      },
      {
        title: "Access & Security",
        items: [
          {
            to: "/settings/security/credentials",
            label: "Credentials & Auth",
            icon: KeyRoundIcon,
          },
          {
            to: "/settings/security/devices",
            label: "Sessions & Devices",
            icon: LaptopIcon,
          },
          {
            to: "/settings/security/activity",
            label: "Security Activity Log",
            icon: ActivityIcon,
          },
        ],
      },
      {
        title: "Workspace",
        items: [
          {
            to: "/settings/spaces",
            label: "Workspaces",
            icon: Building2Icon,
          },
          ...(isWorkspaceAdmin
            ? [
                {
                  to: "/settings/preferences",
                  label: "Preferences",
                  icon: Sliders,
                },
              ]
            : []),
          {
            to: "/settings/integrations",
            label: "Integrations",
            icon: Blocks,
          },
        ],
      },
    ],
    [isWorkspaceAdmin]
  )

  // Backward-compatibility: redirect old query param links (?tab=...) to slash paths
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab) {
      if (tab === "security")
        navigate("/settings/security/credentials", { replace: true })
      else if (tab === "account")
        navigate("/settings/account", { replace: true })
      else if (tab === "spaces") navigate("/settings/spaces", { replace: true })
      else if (tab === "preferences")
        navigate("/settings/preferences", { replace: true })
      else if (tab === "integrations")
        navigate("/settings/integrations", { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <PageLayout
      title="Settings"
      description="Manage your account profile, security credentials, active sessions, and workspace."
      icon={Settings}
      className="max-w-6xl py-4"
    >
      {/* Mobile Horizontal Navigation Pills */}
      <div className="flex scrollbar-none gap-1 overflow-x-auto border-b border-border/40 pb-2 select-none md:hidden">
        {navSections
          .flatMap((s) => s.items)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {/* Desktop Sticky Left Sidebar Menu */}
        <aside className="sticky top-6 hidden w-56 shrink-0 space-y-6 self-start select-none md:block">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn(
                        "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                        isActive
                          ? "bg-muted font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Content Panel Area driven by React Router Routes */}
        <main className="min-w-0 flex-1">
          <Routes>
            <Route
              index
              element={<Navigate to="/settings/account" replace />}
            />
            <Route path="account" element={<AccountSettingsView />} />

            {/* Access & Security Sections */}
            <Route
              path="security"
              element={<Navigate to="/settings/security/credentials" replace />}
            />
            <Route
              path="security/credentials"
              element={<CredentialsSettingsView />}
            />
            <Route
              path="security/devices"
              element={<SessionsDevicesSettingsView />}
            />
            <Route
              path="security/activity"
              element={<ActivityLogSettingsView />}
            />

            {/* Backwards-compatibility aliases */}
            <Route
              path="security/sessions"
              element={<Navigate to="/settings/security/devices" replace />}
            />
            <Route
              path="security/password"
              element={<Navigate to="/settings/security/credentials" replace />}
            />
            <Route
              path="security/two-factor"
              element={<Navigate to="/settings/security/credentials" replace />}
            />

            {/* Workspaces, Preferences & Integrations */}
            <Route path="spaces" element={<SpaceSettings />} />
            <Route path="preferences" element={<SpacePreferences />} />
            <Route path="integrations" element={<IntegrationSettings />} />
            <Route
              path="workspace"
              element={<Navigate to="/settings/preferences" replace />}
            />

            {/* Fallback */}
            <Route
              path="*"
              element={<Navigate to="/settings/account" replace />}
            />
          </Routes>
        </main>
      </div>
    </PageLayout>
  )
}
