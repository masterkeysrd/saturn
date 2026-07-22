import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  UserIcon,
  ChevronUpIcon,
  LogOutIcon,
  ChevronRightIcon,
  SettingsIcon,
} from "lucide-react"
import { SpaceSelector } from "@/components/space-selector"
import { useActiveSpaceContext } from "@/features/space/use-space"

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

// Custom component to handle collapsible submenus
function SidebarNavItem({
  item,
  currentPath,
}: {
  item: FeatureMenu
  currentPath: string
}) {
  const [open, setOpen] = useState(() => {
    // Auto-expand if the current path matches any nested submenu link
    if (item.items) {
      return item.items.some((sub) => currentPath.startsWith(sub.url))
    }
    return false
  })

  const hasSubmenu = !!item.items && item.items.length > 0

  if (hasSubmenu) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setOpen(!open)}
          className="cursor-pointer"
          tooltip={item.title}
        >
          <item.icon />
          <span>{item.title}</span>
          <ChevronRightIcon
            className={cn(
              "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              open && "rotate-90"
            )}
          />
        </SidebarMenuButton>

        {open && (
          <SidebarMenuSub>
            {item.items?.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  render={<Link to={subItem.url} />}
                  isActive={subItem.url === currentPath}
                >
                  {subItem.icon && <subItem.icon />}
                  <span>{subItem.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={item.url || "/"} />}
        tooltip={item.title}
        isActive={item.url === currentPath}
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { user, logoutUser } = useAuth()
  const { state } = useSidebar()
  const location = useLocation()
  const { spaceId } = useActiveSpaceContext()
  const [profileOpen, setProfileOpen] = useState(false)

  // Filter items inside the component based on role and active space requirements
  const filteredMainNavItems = mainNavItems.filter(
    (item) =>
      (!item.adminOnly || user?.role === "admin") &&
      (!item.requiresSpace || !!spaceId)
  )

  const filteredDocsItems = docsItems.filter(
    (item) =>
      (!item.adminOnly || user?.role === "admin") &&
      (!item.requiresSpace || !!spaceId)
  )

  // Get initials for the user avatar
  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <div
          className={cn(
            "flex items-center gap-2.5 pt-3 pb-1 transition-all duration-200 select-none",
            state === "collapsed" ? "justify-center" : "flex-row px-3"
          )}
        >
          <img
            src="/saturn_logo.jpg"
            alt="Saturn Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-md shadow-primary/25"
          />
          {state !== "collapsed" && (
            <span className="animate-in text-base font-semibold tracking-tight text-foreground duration-200 fade-in">
              Saturn
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex flex-col pt-1 pb-2 transition-all duration-200",
            state === "collapsed" ? "items-center" : "px-0"
          )}
        >
          <SpaceSelector />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {filteredMainNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Main</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMainNavItems.map((item) => (
                  <SidebarNavItem
                    key={item.title}
                    item={item}
                    currentPath={location.pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredDocsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Docs</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredDocsItems.map((item) => (
                  <SidebarNavItem
                    key={item.title}
                    item={item}
                    currentPath={location.pathname}
                  />
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
              isActive={location.pathname === "/settings"}
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
                to="/settings?tab=account"
                onClick={() => setProfileOpen(false)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>Account</span>
              </Link>

              <Link
                to="/settings?tab=spaces"
                onClick={() => setProfileOpen(false)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                <span>Spaces</span>
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
export default AppSidebar
