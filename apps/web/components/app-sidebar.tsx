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
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  UserIcon,
  ChevronUpIcon,
  LogOutIcon,
  ChevronRightIcon,
  Layers,
  ShieldCheck,
} from "lucide-react"
import { SpaceSelector } from "@/components/space-selector"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  useActiveSpaceContext,
  resolveSpacePath,
} from "@/features/space/use-space"

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
  const { spaceId } = useActiveSpaceContext()
  const { isMobile, setOpenMobile } = useSidebar()
  const [open, setOpen] = useState(() => {
    // Auto-expand if the current path matches any nested submenu link
    if (item.items) {
      return item.items.some((sub) =>
        currentPath.startsWith(
          resolveSpacePath(
            sub.url,
            spaceId,
            sub.requiresSpace ?? item.requiresSpace
          )
        )
      )
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
            {item.items?.map((subItem) => {
              const resolvedUrl = resolveSpacePath(
                subItem.url,
                spaceId,
                subItem.requiresSpace ?? item.requiresSpace
              )
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    render={<Link to={resolvedUrl} />}
                    isActive={resolvedUrl === currentPath}
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false)
                      }
                    }}
                  >
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    )
  }

  const resolvedItemUrl = resolveSpacePath(
    item.url || "/",
    spaceId,
    item.requiresSpace
  )

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={resolvedItemUrl} />}
        tooltip={item.title}
        isActive={resolvedItemUrl === currentPath}
        onClick={() => {
          if (isMobile) {
            setOpenMobile(false)
          }
        }}
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {item.badge && (
        <SidebarMenuBadge>
          <item.badge />
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { user, logoutUser } = useAuth()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()
  const { spaceId } = useActiveSpaceContext()

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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    isActive={location.pathname.startsWith("/settings")}
                    className="cursor-pointer"
                  />
                }
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground shadow-sm select-none">
                  {initials}
                </div>
                <span className="truncate">
                  {user?.name || user?.username || "Profile"}
                </span>
                <ChevronUpIcon className="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={state === "collapsed" ? "right" : "top"}
                align="end"
                sideOffset={8}
                className="w-56"
              >
                <div className="flex items-center gap-2.5 px-2.5 py-2 select-none">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={<Link to="/settings/account" />}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                  className="cursor-pointer"
                >
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span>Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link to="/settings/security/credentials" />}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                  className="cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span>Security &amp; Logins</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link to="/settings/spaces" />}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                  className="cursor-pointer"
                >
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span>Workspaces</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    logoutUser()
                    if (isMobile) setOpenMobile(false)
                  }}
                  className="cursor-pointer"
                >
                  <LogOutIcon className="h-4 w-4" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
export default AppSidebar
