import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import type { TranslationKey } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/features/auth/use-auth"
import { cn } from "@/lib/utils"
import type { FeatureMenu, SidebarNavGroup } from "@/lib/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronRightIcon, SettingsIcon } from "lucide-react"
import { SaturnMark } from "@/components/ui/saturn-mark"
import {
  useActiveSpaceContext,
  resolveSpacePath,
} from "@/features/space/use-space"

const menuModules = import.meta.glob<{ menu: FeatureMenu | FeatureMenu[] }>(
  "../features/**/menu.ts",
  { eager: true }
)

const allMenus: FeatureMenu[] = Object.values(menuModules).flatMap((module) => {
  return Array.isArray(module.menu) ? module.menu : [module.menu]
})

const NAV_GROUPS: {
  id: SidebarNavGroup
  labelKey: TranslationKey
  match: (group?: SidebarNavGroup) => boolean
}[] = [
  {
    id: "pulse",
    labelKey: "nav.group.pulse",
    match: (g) => !g || g === "pulse" || g === "main",
  },
  {
    id: "money",
    labelKey: "nav.group.money",
    match: (g) => g === "money",
  },
  {
    id: "automation",
    labelKey: "nav.group.automation",
    match: (g) => g === "automation",
  },
  {
    id: "admin",
    labelKey: "nav.group.admin",
    match: (g) => g === "admin",
  },
  {
    id: "docs",
    labelKey: "nav.group.docs",
    match: (g) => g === "docs",
  },
]

const URL_TO_NAV_KEY: Record<string, TranslationKey> = {
  "/": "nav.overview",
  "/mail": "nav.mail",
  "/calendar": "nav.calendar",
  "/space/ai/chat": "nav.ai",
  "/finance/transactions": "nav.transactions",
  "/finance/inbox": "nav.inbox",
  "/finance/accounts": "nav.accounts",
  "/finance/budgets": "nav.budgets",
  "/finance/recurring": "nav.recurring",
  "/finance/borrowings": "nav.borrowing",
  "/finance/reconcile": "nav.reconciliation",
  "/finance/rates": "nav.exchangeRates",
  "/space/ai/agents": "nav.agents",
  "/space/ai/models": "nav.models",
  "/space/ai/mcp": "nav.mcp",
  "/space/ai/runs": "ai.runs.title",
  "/space/workflows": "nav.studio",
  "/space/workflows/runs": "workflows.runHistory",
  "/admin/users": "nav.adminUsers",
  "/admin/scheduler": "nav.adminScheduler",
  "/admin/messages": "nav.adminMessages",
  "/admin/backups": "nav.adminBackups",
  "/admin/security": "nav.adminSecurity",
  "/admin/oauth-clients": "nav.oauthClients",
}

function getLocalizedMenuLabel(
  title: string,
  url: string | undefined,
  t: (key: TranslationKey) => string,
  isSubItem = false
): string {
  if (url === "/finance") {
    return isSubItem ? t("nav.insights") : t("nav.finance")
  }
  if (url && url in URL_TO_NAV_KEY) {
    return t(URL_TO_NAV_KEY[url])
  }
  if (title === "Workflows") return t("nav.workflows")
  if (title === "Admin") return t("nav.group.admin")
  if (title === "AI Studio") return t("nav.aiStudio")
  return title
}

function SidebarNavItem({
  item,
  currentPath,
}: {
  item: FeatureMenu
  currentPath: string
}) {
  const { spaceId } = useActiveSpaceContext()
  const { isMobile, setOpenMobile } = useSidebar()
  const { t } = useI18n()
  const itemLabel = getLocalizedMenuLabel(item.title, item.url, t)
  const [open, setOpen] = useState(() => {
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
          tooltip={itemLabel}
        >
          <item.icon />
          <span>{itemLabel}</span>
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
              const SubBadge = subItem.badge
              const subLabel = getLocalizedMenuLabel(
                subItem.title,
                subItem.url,
                t,
                true
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
                    <span className="truncate">{subLabel}</span>
                    {SubBadge && (
                      <span className="ml-auto">
                        <SubBadge />
                      </span>
                    )}
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
  const isItemActive =
    resolvedItemUrl === "/"
      ? currentPath === "/"
      : currentPath === resolvedItemUrl ||
        currentPath.startsWith(`${resolvedItemUrl}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={resolvedItemUrl} />}
        tooltip={itemLabel}
        isActive={isItemActive}
        onClick={() => {
          if (isMobile) {
            setOpenMobile(false)
          }
        }}
      >
        <item.icon />
        <span>{itemLabel}</span>
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
  const { user } = useAuth()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()
  const { spaceId } = useActiveSpaceContext()
  const { t } = useI18n()
  const isCollapsed = state === "collapsed" && !isMobile

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    label: t(group.labelKey),
    items: allMenus
      .filter(
        (item) =>
          group.match(item.group) &&
          (!item.adminOnly || user?.role === "admin") &&
          (!item.requiresSpace || !!spaceId)
      )
      .sort((a, b) => a.weight - b.weight),
  })).filter((group) => group.items.length > 0)

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="h-12 shrink-0 justify-center border-b border-sidebar-border/60 p-0 px-2">
        <Link
          to="/"
          aria-label={`Saturn ${t("nav.overview")}`}
          onClick={() => {
            if (isMobile) {
              setOpenMobile(false)
            }
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-lg py-1 transition-colors select-none hover:bg-sidebar-accent/60",
            isCollapsed ? "justify-center px-0" : "px-2"
          )}
        >
          <SaturnMark variant="badge" size="sm" />
          {!isCollapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Saturn
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.title}
                    item={item}
                    currentPath={location.pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/settings/account" />}
              tooltip={t("nav.settings")}
              isActive={location.pathname.startsWith("/settings")}
              onClick={() => {
                if (isMobile) {
                  setOpenMobile(false)
                }
              }}
            >
              <SettingsIcon />
              <span>{t("nav.settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
