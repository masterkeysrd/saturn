import { useContext, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { QueryClientContext } from "@tanstack/react-query"
import {
  ArrowLeftRight,
  Bot,
  Calendar,
  Cpu,
  FileSpreadsheet,
  HandCoins,
  History,
  Home,
  Inbox,
  Landmark,
  Languages,
  Layers,
  Mail,
  Monitor,
  Moon,
  PenSquare,
  PiggyBank,
  Plug,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
  Workflow,
} from "lucide-react"
import { SUPPORTED_UI_LOCALES, translate } from "@saturn/i18n"
import { useI18n, useTimezone } from "@saturn/hooks"
import { updateUserPreferences } from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { toast } from "@/components/ui/toast"
import { useTheme } from "@/components/theme-provider"
import { useActiveSpaceContext, useMySpaces } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { OPEN_COMMAND_PALETTE_EVENT } from "@/lib/command-palette-events"
import { resolveNextSpaceRoute } from "@/lib/space-route"
import { setCachedUserPreferences } from "@/lib/user-preferences"

export interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const COPILOT_COMMAND_VALUE = "__ask_saturn_copilot__"

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [search, setSearch] = useState("")
  const navigate = useNavigate()
  const location = useLocation()
  const { setTheme } = useTheme()
  const { user } = useAuth()
  const { spaceId, switchSpace } = useActiveSpaceContext()
  const { spaces } = useMySpaces()
  const { t, locale, language } = useI18n()
  const tz = useTimezone()
  const queryClient = useContext(QueryClientContext)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const setOpen = (next: boolean) => {
    if (!next) {
      setSearch("")
    }
    if (!isControlled) {
      setInternalOpen(next)
    }
    onOpenChange?.(next)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!open)
      }
    }
    const handleOpenEvent = () => {
      setOpen(true)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent)
    }
  })

  const runAction = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  const handleSwitchLanguage = async (nextLocale: string) => {
    const next = setCachedUserPreferences({
      regional: {
        locale: nextLocale,
        hourCycle: tz.hourCycle,
        weekStartsOn: tz.weekStartsOn,
      },
    })
    queryClient?.setQueryData(
      ["/api/v1/identity/users/me/preferences", {}],
      next
    )
    if (user) {
      try {
        const updated = await updateUserPreferences({
          userPreferences: next,
          updateMask: { paths: ["regional.locale"] },
        })
        const normalized = setCachedUserPreferences({
          regional: {
            locale: updated.regional?.locale || next.regional.locale,
            hourCycle: updated.regional?.hourCycle || next.regional.hourCycle,
            weekStartsOn:
              updated.regional?.weekStartsOn ?? next.regional.weekStartsOn,
          },
          mail: {
            autoLoadRemoteContent:
              updated.mail?.autoLoadRemoteContent ??
              next.mail.autoLoadRemoteContent,
          },
          calendar: {
            webView: updated.calendar?.webView || next.calendar.webView,
            mobileView:
              updated.calendar?.mobileView || next.calendar.mobileView,
          },
        })
        queryClient?.setQueryData(
          ["/api/v1/identity/users/me/preferences", {}],
          normalized
        )
      } catch {
        // Ignore API failure if offline or mocked; local cache already updated
      }
    }
    toast.add({
      type: "success",
      title: translate(nextLocale, "settings.regional.saved"),
    })
  }

  const trimmedQuery = search.trim()

  const navDestinations = useMemo(() => {
    const base = [
      {
        label: t("nav.overview"),
        url: "/",
        icon: Home,
        requiresSpace: false,
        keywords: "dashboard home briefing overview resumen",
      },
      {
        label: t("nav.mail"),
        url: spaceId ? `/space/${spaceId}/mail` : "/mail",
        icon: Mail,
        requiresSpace: true,
        keywords: "email inbox threads mail correo",
      },
      {
        label: t("nav.calendar"),
        url: spaceId ? `/space/${spaceId}/calendar` : "/calendar",
        icon: Calendar,
        requiresSpace: true,
        keywords: "schedule events agenda calendar calendario",
      },
      {
        label: t("nav.ai"),
        url: spaceId ? `/space/${spaceId}/ai/chat` : "/",
        icon: Sparkles,
        requiresSpace: true,
        keywords: "ai assistant chat copilot saturn ia",
      },
      {
        label: t("nav.insights"),
        url: spaceId ? `/space/${spaceId}/finance` : "/",
        icon: TrendingUp,
        requiresSpace: true,
        keywords: "analytics spending cashflow finance insights analisis",
      },
      {
        label: t("nav.transactions"),
        url: spaceId ? `/space/${spaceId}/finance/transactions` : "/",
        icon: ReceiptText,
        requiresSpace: true,
        keywords: "ledger expenses income transactions transacciones",
      },
      {
        label: t("nav.inbox"),
        url: spaceId ? `/space/${spaceId}/finance/inbox` : "/",
        icon: Inbox,
        requiresSpace: true,
        keywords: "triage finance inbox receipts review queue cola",
      },
      {
        label: t("nav.accounts"),
        url: spaceId ? `/space/${spaceId}/finance/accounts` : "/",
        icon: Landmark,
        requiresSpace: true,
        keywords: "banks cards balances accounts cuentas",
      },
      {
        label: t("nav.budgets"),
        url: spaceId ? `/space/${spaceId}/finance/budgets` : "/",
        icon: PiggyBank,
        requiresSpace: true,
        keywords: "limits categories budgets presupuestos",
      },
      {
        label: t("nav.recurring"),
        url: spaceId ? `/space/${spaceId}/finance/recurring` : "/",
        icon: RefreshCw,
        requiresSpace: true,
        keywords: "subscriptions bills scheduled recurring recurrentes",
      },
      {
        label: t("nav.borrowing"),
        url: spaceId ? `/space/${spaceId}/finance/borrowings` : "/",
        icon: HandCoins,
        requiresSpace: true,
        keywords: "debts loans borrowings prestamos",
      },
      {
        label: t("nav.reconciliation"),
        url: spaceId ? `/space/${spaceId}/finance/reconcile` : "/",
        icon: FileSpreadsheet,
        requiresSpace: true,
        keywords: "statements csv pdf match reconciliation conciliacion",
      },
      {
        label: t("nav.exchangeRates"),
        url: spaceId ? `/space/${spaceId}/finance/rates` : "/",
        icon: ArrowLeftRight,
        requiresSpace: true,
        keywords: "fx currency conversion exchange rates tasas",
      },
      {
        label: t("nav.workflows"),
        url: spaceId ? `/space/${spaceId}/workflows` : "/",
        icon: Workflow,
        requiresSpace: true,
        keywords: "automation studio flows workflows flujos",
      },
      {
        label: t("nav.agents"),
        url: spaceId ? `/space/${spaceId}/ai/agents` : "/",
        icon: Bot,
        requiresSpace: true,
        keywords: "studio assistants agents agentes",
      },
      {
        label: t("nav.models"),
        url: spaceId ? `/space/${spaceId}/ai/models` : "/",
        icon: Cpu,
        requiresSpace: true,
        keywords: "llm openai anthropic models modelos",
      },
      {
        label: t("nav.mcp"),
        url: spaceId ? `/space/${spaceId}/ai/mcp` : "/",
        icon: Plug,
        requiresSpace: true,
        keywords: "tools integrations mcp conectores",
      },
      {
        label:
          language === "es" ? "Historial de ejecuciones" : "Execution Runs",
        url: spaceId ? `/space/${spaceId}/ai/runs` : "/",
        icon: History,
        requiresSpace: true,
        keywords: "traces logs history runs ejecuciones",
      },
      {
        label: t("nav.settings"),
        url: "/settings/account",
        icon: Settings,
        requiresSpace: false,
        keywords: "preferences security profile settings configuracion",
      },
    ]

    return base.filter((item) => !item.requiresSpace || Boolean(spaceId))
  }, [spaceId, t, language])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Jump to views, switch workspaces, run quick actions, or ask Saturn Copilot."
    >
      <Command shouldFilter={true}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          onKeyDown={(e) => {
            if (e.key === "Enter" && spaceId && trimmedQuery.length > 0) {
              const dialogRoot = e.currentTarget.closest("[cmdk-root]")
              const selectedStatic = dialogRoot?.querySelector(
                `[cmdk-item][data-selected="true"]:not([data-value="${COPILOT_COMMAND_VALUE}"])`
              )
              if (!selectedStatic) {
                e.preventDefault()
                runAction(() =>
                  openAIDrawer({ prompt: trimmedQuery, autoSend: true })
                )
              }
            }
          }}
          placeholder={t("commandPalette.placeholder")}
        />
        <CommandList className="max-h-96">
          {Boolean(spaceId) && trimmedQuery.length > 0 && (
            <CommandGroup forceMount heading="Saturn Copilot">
              <CommandItem
                forceMount
                value={COPILOT_COMMAND_VALUE}
                className="bg-primary/5 data-selected:bg-primary/10"
                onSelect={() =>
                  runAction(() =>
                    openAIDrawer({ prompt: trimmedQuery, autoSend: true })
                  )
                }
              >
                <Sparkles className="text-primary" />
                <span className="truncate font-medium">
                  Ask Saturn Copilot: &ldquo;{trimmedQuery}&rdquo;
                </span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          {spaceId && (
            <CommandGroup heading={t("commandPalette.quickActions")}>
              <CommandItem
                value="Record Transaction expense income registrar transaccion"
                onSelect={() =>
                  runAction(() =>
                    navigate(`/space/${spaceId}/finance/transactions`)
                  )
                }
              >
                <Plus />
                <span>{t("commandPalette.recordTransaction")}</span>
                <CommandShortcut>{t("nav.finance")}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Compose Email send message redactar correo"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/mail`))
                }
              >
                <PenSquare />
                <span>{t("commandPalette.composeMail")}</span>
                <CommandShortcut>{t("nav.mail")}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Create Calendar Event schedule meeting nuevo evento"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/calendar`))
                }
              >
                <Calendar />
                <span>{t("commandPalette.newEvent")}</span>
                <CommandShortcut>{t("nav.calendar")}</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Toggle Saturn Copilot ai drawer asistente"
                onSelect={() => runAction(() => openAIDrawer())}
              >
                <Sparkles />
                <span>{t("commandPalette.toggleCopilot")}</span>
              </CommandItem>
              <CommandItem
                value="New Workflow automation flow nuevo flujo"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/workflows/new`))
                }
              >
                <Workflow />
                <span>
                  {language === "es" ? "Nuevo flujo" : "New Workflow"}
                </span>
                <CommandShortcut>Studio</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading={t("commandPalette.navigation")}>
            {navDestinations.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.url + item.label}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => runAction(() => navigate(item.url))}
                >
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>

          {spaces.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("commandPalette.workspaces")}>
                {spaces.map((space) => {
                  const nextSpaceId = space.id || ""
                  const isActive = nextSpaceId === spaceId
                  return (
                    <CommandItem
                      key={nextSpaceId || space.name}
                      value={`switch workspace space ${space.name}`}
                      onSelect={() =>
                        runAction(() => {
                          if (!nextSpaceId) return
                          const role =
                            user && space.ownerId === user.id ? "owner" : ""
                          switchSpace({
                            spaceId: nextSpaceId,
                            spaceName: space.name || "",
                            spaceRole: role,
                          })
                          const targetRoute = resolveNextSpaceRoute(
                            location.pathname,
                            nextSpaceId
                          )
                          if (targetRoute) {
                            navigate(targetRoute)
                          }
                        })
                      }
                    >
                      <Layers />
                      <span>{space.name}</span>
                      {isActive && (
                        <CommandShortcut>{t("common.active")}</CommandShortcut>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading={t("commandPalette.preferences")}>
            <CommandItem
              value="Light Theme appearance tema claro"
              onSelect={() => runAction(() => setTheme("light"))}
            >
              <Sun />
              <span>{language === "es" ? "Tema claro" : "Light Theme"}</span>
            </CommandItem>
            <CommandItem
              value="Dark Theme appearance tema oscuro"
              onSelect={() => runAction(() => setTheme("dark"))}
            >
              <Moon />
              <span>{language === "es" ? "Tema oscuro" : "Dark Theme"}</span>
            </CommandItem>
            <CommandItem
              value="System Theme appearance tema del sistema"
              onSelect={() => runAction(() => setTheme("system"))}
            >
              <Monitor />
              <span>
                {language === "es" ? "Tema del sistema" : "System Theme"}
              </span>
            </CommandItem>
            {SUPPORTED_UI_LOCALES.map((opt) => {
              const isCurrent = locale === opt.value
              return (
                <CommandItem
                  key={opt.value}
                  value={`language locale switch ${opt.label} ${opt.englishLabel} ${opt.value}`}
                  onSelect={() =>
                    runAction(() => {
                      void handleSwitchLanguage(opt.value)
                    })
                  }
                >
                  <Languages />
                  <span>
                    {t("commandPalette.switchLanguage", {
                      language: opt.label,
                    })}
                  </span>
                  {isCurrent && (
                    <CommandShortcut>{t("common.active")}</CommandShortcut>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>

          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
            {t("commandPalette.noResults")}
          </CommandEmpty>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
