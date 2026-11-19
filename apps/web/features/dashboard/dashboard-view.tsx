import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  PenSquare,
  Plus,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react"
import {
  DASHBOARD_WIDGET_MAP,
  normalizeDashboardWidgets,
  type DashboardWidgetId,
} from "@saturn/core"
import { useGetDashboardPreferencesQuery } from "@saturn/api/gen/saturn/space/v1/space"
import { useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { useAuth } from "@/features/auth/use-auth"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { DocumentPage } from "@/components/ui/page-shells"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SaturnMark } from "@/components/ui/saturn-mark"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateTransactionSheet } from "@/features/finance/components/create-transaction-sheet"
import { EventDialog } from "@/features/calendar/components/event-dialog"
import { cn } from "@/lib/utils"
import { DASHBOARD_WIDGET_COMPONENTS } from "./widgets"
import { CustomizeDashboardSheet } from "./components/customize-dashboard-sheet"

export function DashboardView() {
  const { user } = useAuth()
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const navigate = useNavigate()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [previewWidgets, setPreviewWidgets] = useState<
    DashboardWidgetId[] | null
  >(null)
  const [txSheetOpen, setTxSheetOpen] = useState(false)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)

  const formattedDate = tz.formatDate(tz.now(), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const getGreeting = () => {
    const hour = tz.parts()?.hour ?? 12
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const firstName = user?.name?.split(" ")[0] || "User"
  const greetingTitle = `${getGreeting()}, ${firstName}`

  const { data: preferences, isLoading: prefsLoading } =
    useGetDashboardPreferencesQuery({ spaceId }, { enabled: Boolean(spaceId) })

  const activeWidgets = useMemo(
    () => normalizeDashboardWidgets(preferences?.widgets),
    [preferences?.widgets]
  )

  useRegisterCopilotView(
    spaceId
      ? {
          viewId: "dashboard.overview",
          title: "Overview",
          suggestions: [
            "Give me a quick financial and schedule briefing for today",
            "Are there any upcoming bills or overdue items this week?",
            "Check my unread emails for urgent action items",
          ],
        }
      : null
  )

  const displayedWidgets = previewWidgets ?? activeWidgets

  if (!spaceId) {
    return (
      <DocumentPage title={greetingTitle} hideHeader>
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="w-full max-w-lg">
            <div className="mb-6 flex justify-center select-none">
              <SaturnMark variant="badge" size="xl" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {greetingTitle}
            </h1>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {formattedDate}
            </p>

            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Sparkles className="mx-auto size-7 text-primary" />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                Create your first Space
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Saturn organizes your finances, mail, calendar, and automations
                into isolated Spaces. Select an existing Space above or create
                one to get started.
              </p>
              <div className="mt-5 flex justify-center">
                <Link to="/settings/spaces">
                  <Button size="sm" className="cursor-pointer gap-1.5">
                    <span>Manage Spaces</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </DocumentPage>
    )
  }

  return (
    <DocumentPage
      title={greetingTitle}
      description={formattedDate}
      maxWidth="xl"
      actions={
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" className="cursor-pointer gap-1.5">
                  <Plus className="size-4" />
                  <span>Quick Action</span>
                  <ChevronDown className="size-3.5 opacity-75" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setTxSheetOpen(true)}>
                <ReceiptText className="size-4" />
                <span>Record Transaction</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEventDialogOpen(true)}>
                <Calendar className="size-4" />
                <span>Create Event</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/space/${spaceId}/mail?compose=1`)}
              >
                <PenSquare className="size-4" />
                <span>Compose Email</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/space/${spaceId}/workflows/new`)}
              >
                <Workflow className="size-4" />
                <span>New Workflow</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCustomizeOpen(true)}
            className="cursor-pointer gap-1.5"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Customize</span>
          </Button>
        </div>
      }
    >
      {prefsLoading && !preferences ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-20 rounded-xl lg:col-span-2" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {displayedWidgets.map((widgetId) => {
            const meta = DASHBOARD_WIDGET_MAP[widgetId]
            const WidgetComponent = DASHBOARD_WIDGET_COMPONENTS[widgetId]
            return (
              <div
                key={widgetId}
                data-widget-id={widgetId}
                className={cn(
                  meta.span === "wide" ? "lg:col-span-2" : "lg:col-span-1"
                )}
              >
                <WidgetComponent />
              </div>
            )
          })}
        </div>
      )}

      <CustomizeDashboardSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        onPreviewChange={setPreviewWidgets}
        spaceId={spaceId}
        preferences={preferences}
        activeWidgets={activeWidgets}
      />

      <CreateTransactionSheet
        open={txSheetOpen}
        onOpenChange={setTxSheetOpen}
        spaceId={spaceId}
      />

      {eventDialogOpen && (
        <EventDialog
          open={eventDialogOpen}
          onClose={() => setEventDialogOpen(false)}
        />
      )}
    </DocumentPage>
  )
}

export default DashboardView
