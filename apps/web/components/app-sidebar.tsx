import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"
import { cn } from "@/lib/utils"
import type { FeatureMenu } from "@/lib/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { UserIcon, ChevronUpIcon, LogOutIcon } from "lucide-react"

// Discover all menu configurations dynamically at compile time
const menuModules = import.meta.glob<{ menu: FeatureMenu | FeatureMenu[] }>(
  "../features/**/menu.ts",
  { eager: true }
)

// Flatten and collect all discovered menu configurations
const allMenus: FeatureMenu[] = Object.values(menuModules).flatMap((module) => {
  return Array.isArray(module.menu) ? module.menu : [module.menu]
})

// Sort and filter menu configurations into groups
const mainNavItems = allMenus
  .filter((item) => !item.group || item.group === "main")
  .sort((a, b) => a.weight - b.weight)

const docsItems = allMenus
  .filter((item) => item.group === "docs")
  .sort((a, b) => a.weight - b.weight)

export function AppSidebar() {
  const { user, logoutUser } = useAuth()
  const { state } = useSidebar()
  const [profileOpen, setProfileOpen] = useState(false)

  // Get initials for the user avatar
  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col items-center gap-2 px-2 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/20">
            <span className="font-mono text-xl font-bold">S</span>
          </div>
          <span className="text-sm font-semibold text-foreground">Saturn</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {mainNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Main</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={item.url === window.location.pathname}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {docsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Docs</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {docsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link to={item.url} />}
                      tooltip={item.title}
                      isActive={item.url === window.location.pathname}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="relative">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Profile"
              isActive={window.location.pathname === "/profile"}
              onClick={() => setProfileOpen(!profileOpen)}
              className="cursor-pointer"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-accent text-[10px] font-bold text-white shadow-md shadow-primary/10 select-none">
                {initials}
              </div>
              <span className="truncate">
                {user?.name || user?.username || "Profile"}
              </span>
              <ChevronUpIcon className="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {profileOpen && (
          <>
            {/* Backdrop overlay to close when clicking outside */}
            <div
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setProfileOpen(false)}
            />
            {/* Dropdown Menu Container */}
            <div
              className={cn(
                "absolute z-50 w-52 animate-in rounded-2xl border border-border/50 bg-card/90 p-1.5 shadow-2xl backdrop-blur-xl duration-200 fade-in slide-in-from-bottom-2 dark:bg-card/85",
                state === "collapsed"
                  ? "bottom-2 left-14"
                  : "right-2 bottom-14 left-2"
              )}
            >
              {/* User Identity Info */}
              <div className="mb-1.5 flex items-center gap-2.5 border-b border-border/40 px-3 py-2.5 pb-3 select-none">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-accent text-sm font-bold text-white shadow-md shadow-primary/10">
                  {initials}
                </div>
                <div className="flex flex-col overflow-hidden text-left">
                  <span className="mb-1 truncate text-sm leading-none font-semibold text-foreground">
                    {user?.name || user?.username || "User"}
                  </span>
                  <span className="truncate text-[10px] leading-none text-muted-foreground">
                    {user?.email || "No email"}
                  </span>
                </div>
              </div>

              {/* Menu Items */}
              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>Account Details</span>
              </Link>

              <button
                onClick={() => {
                  setProfileOpen(false)
                  logoutUser()
                }}
                className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOutIcon className="h-4 w-4 text-destructive" />
                <span>Log Out</span>
              </button>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
