import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
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
import { useTheme } from "@/components/theme-provider"
import { useActiveSpaceContext, useMySpaces } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { OPEN_COMMAND_PALETTE_EVENT } from "@/lib/command-palette-events"
import { resolveNextSpaceRoute } from "@/lib/space-route"

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

  const trimmedQuery = search.trim()

  const navDestinations = useMemo(() => {
    const base = [
      {
        label: "Overview",
        url: "/",
        icon: Home,
        requiresSpace: false,
        keywords: "dashboard home briefing",
      },
      {
        label: "Mail",
        url: spaceId ? `/space/${spaceId}/mail` : "/mail",
        icon: Mail,
        requiresSpace: true,
        keywords: "email inbox threads",
      },
      {
        label: "Calendar",
        url: spaceId ? `/space/${spaceId}/calendar` : "/calendar",
        icon: Calendar,
        requiresSpace: true,
        keywords: "schedule events agenda",
      },
      {
        label: "Copilot",
        url: spaceId ? `/space/${spaceId}/ai/chat` : "/",
        icon: Sparkles,
        requiresSpace: true,
        keywords: "ai assistant chat",
      },
      {
        label: "Finance Insights",
        url: spaceId ? `/space/${spaceId}/finance` : "/",
        icon: TrendingUp,
        requiresSpace: true,
        keywords: "analytics spending cashflow",
      },
      {
        label: "Transactions",
        url: spaceId ? `/space/${spaceId}/finance/transactions` : "/",
        icon: ReceiptText,
        requiresSpace: true,
        keywords: "ledger expenses income",
      },
      {
        label: "Review Queue",
        url: spaceId ? `/space/${spaceId}/finance/inbox` : "/",
        icon: Inbox,
        requiresSpace: true,
        keywords: "triage finance inbox receipts",
      },
      {
        label: "Accounts",
        url: spaceId ? `/space/${spaceId}/finance/accounts` : "/",
        icon: Landmark,
        requiresSpace: true,
        keywords: "banks cards balances",
      },
      {
        label: "Budgets",
        url: spaceId ? `/space/${spaceId}/finance/budgets` : "/",
        icon: PiggyBank,
        requiresSpace: true,
        keywords: "limits categories",
      },
      {
        label: "Recurring",
        url: spaceId ? `/space/${spaceId}/finance/recurring` : "/",
        icon: RefreshCw,
        requiresSpace: true,
        keywords: "subscriptions bills scheduled",
      },
      {
        label: "Borrowings",
        url: spaceId ? `/space/${spaceId}/finance/borrowings` : "/",
        icon: HandCoins,
        requiresSpace: true,
        keywords: "debts loans",
      },
      {
        label: "Reconciliation",
        url: spaceId ? `/space/${spaceId}/finance/reconcile` : "/",
        icon: FileSpreadsheet,
        requiresSpace: true,
        keywords: "statements csv pdf match",
      },
      {
        label: "Exchange Rates",
        url: spaceId ? `/space/${spaceId}/finance/rates` : "/",
        icon: ArrowLeftRight,
        requiresSpace: true,
        keywords: "fx currency conversion",
      },
      {
        label: "Workflows",
        url: spaceId ? `/space/${spaceId}/workflows` : "/",
        icon: Workflow,
        requiresSpace: true,
        keywords: "automation studio flows",
      },
      {
        label: "AI Agents",
        url: spaceId ? `/space/${spaceId}/ai/agents` : "/",
        icon: Bot,
        requiresSpace: true,
        keywords: "studio assistants",
      },
      {
        label: "Models & Providers",
        url: spaceId ? `/space/${spaceId}/ai/models` : "/",
        icon: Cpu,
        requiresSpace: true,
        keywords: "llm openai anthropic",
      },
      {
        label: "MCP Servers",
        url: spaceId ? `/space/${spaceId}/ai/mcp` : "/",
        icon: Plug,
        requiresSpace: true,
        keywords: "tools integrations",
      },
      {
        label: "Execution Runs",
        url: spaceId ? `/space/${spaceId}/ai/runs` : "/",
        icon: History,
        requiresSpace: true,
        keywords: "traces logs history",
      },
      {
        label: "Settings",
        url: "/settings/account",
        icon: Settings,
        requiresSpace: false,
        keywords: "preferences security profile",
      },
    ]

    return base.filter((item) => !item.requiresSpace || Boolean(spaceId))
  }, [spaceId])

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
          placeholder="Search views, actions, workspaces, or ask Saturn Copilot..."
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
            <CommandGroup heading="Quick Actions">
              <CommandItem
                value="Record Transaction expense income"
                onSelect={() =>
                  runAction(() =>
                    navigate(`/space/${spaceId}/finance/transactions`)
                  )
                }
              >
                <Plus />
                <span>Record Transaction</span>
                <CommandShortcut>Finance</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Compose Email send message"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/mail`))
                }
              >
                <PenSquare />
                <span>Compose Email</span>
                <CommandShortcut>Mail</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Create Calendar Event schedule meeting"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/calendar`))
                }
              >
                <Calendar />
                <span>Create Calendar Event</span>
                <CommandShortcut>Calendar</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="New Workflow automation flow"
                onSelect={() =>
                  runAction(() => navigate(`/space/${spaceId}/workflows/new`))
                }
              >
                <Workflow />
                <span>New Workflow</span>
                <CommandShortcut>Studio</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading="Navigate">
            {navDestinations.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.label}
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
              <CommandGroup heading="Switch Workspace">
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
                      {isActive && <CommandShortcut>Active</CommandShortcut>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading="Appearance">
            <CommandItem
              value="Light Theme appearance"
              onSelect={() => runAction(() => setTheme("light"))}
            >
              <Sun />
              <span>Light Theme</span>
            </CommandItem>
            <CommandItem
              value="Dark Theme appearance"
              onSelect={() => runAction(() => setTheme("dark"))}
            >
              <Moon />
              <span>Dark Theme</span>
            </CommandItem>
            <CommandItem
              value="System Theme appearance"
              onSelect={() => runAction(() => setTheme("system"))}
            >
              <Monitor />
              <span>System Theme</span>
            </CommandItem>
          </CommandGroup>

          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
            No matching commands found.
          </CommandEmpty>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
