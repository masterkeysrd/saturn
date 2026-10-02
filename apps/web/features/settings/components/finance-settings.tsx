import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { useTimezone } from "@saturn/hooks"
import { FISCAL_YEAR_MONTHS, getFiscalYearBounds } from "@saturn/core"
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { Landmark, Loader2, Lock, RotateCcw } from "lucide-react"

export function FinanceSettings() {
  const { spaceId, spaceRole } = useActiveSpaceContext()
  const { user } = useAuth()
  const tz = useTimezone()
  const queryClient = useQueryClient()

  const canManage =
    user?.role === "admin" ||
    spaceRole?.toLowerCase() === "owner" ||
    spaceRole?.toLowerCase() === "admin"

  const {
    data: settings,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetSettingsQuery({}, { enabled: !!spaceId })

  const currentMonth = settings?.fiscalYearStartMonth || 1
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const activeMonth = selectedMonth ?? currentMonth
  const isDirty = selectedMonth !== null && selectedMonth !== currentMonth

  const bounds = getFiscalYearBounds(new Date(), tz.timezone, activeMonth)

  const updateMutation = useUpdateSettingsMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/settings"],
      })
      setSelectedMonth(null)
      const monthOption = FISCAL_YEAR_MONTHS.find(
        (m) => m.month === activeMonth
      )
      toast.add({
        type: "success",
        title: "Finance Settings Saved",
        description: `Fiscal year start month updated to ${monthOption?.name || activeMonth}.`,
      })
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: "Failed to Update Settings",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      })
    },
  })

  const handleSave = () => {
    if (!settings) return
    updateMutation.mutate({
      settings: {
        ...settings,
        fiscalYearStartMonth: activeMonth,
      },
      updateMask: {
        paths: ["fiscal_year_start_month"],
      },
    })
  }

  const handleReset = () => {
    setSelectedMonth(null)
  }

  if (!spaceId) {
    return (
      <div className="rounded-3xl border border-border/40 bg-card/45 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Please select or activate a workspace first to manage its finance
          settings.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-border/40 bg-card/45 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4 rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load finance settings."}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6 duration-300 fade-in">
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
        {/* Section Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/20">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Finance & Accounting
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure base reporting currency and annual fiscal year
                boundaries.
              </p>
            </div>
          </div>
        </div>

        {/* Settings Form Rows */}
        <div className="divide-y divide-border/40">
          {/* Row 1: Base Currency */}
          <div className="space-y-2 py-6">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Base Reporting Currency
              </Label>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Locked at workspace setup
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Primary currency for all budgets, transactions, and financial
              insights.
            </p>
            <div className="flex h-11 items-center rounded-2xl border border-border/60 bg-muted/20 px-4 font-mono text-sm font-medium text-foreground">
              {settings?.baseCurrency || "USD"}
            </div>
          </div>

          {/* Row 2: Fiscal Year Start Month */}
          <div className="space-y-3 py-6">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Fiscal Year Start Month
            </Label>
            <p className="text-xs text-muted-foreground">
              Starting month of your annual fiscal cycle. Annual budgets and
              spending limits will align to this period.
            </p>
            <Select
              value={String(activeMonth)}
              onValueChange={(val) => {
                if (val && canManage) setSelectedMonth(Number(val))
              }}
              disabled={!canManage}
            >
              <SelectTrigger className="!h-11 w-full rounded-2xl border-border/60 bg-background/50 text-left">
                <SelectValue>
                  {
                    FISCAL_YEAR_MONTHS.find((m) => m.month === activeMonth)
                      ?.name
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 rounded-2xl border border-border/50 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
                {FISCAL_YEAR_MONTHS.map((option) => (
                  <SelectItem key={option.month} value={String(option.month)}>
                    <div className="flex flex-col py-0.5">
                      <span className="font-medium text-foreground">
                        {option.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground">
              Active cycle:{" "}
              <span className="font-semibold text-foreground">
                {bounds.label}
              </span>{" "}
              ({tz.formatDate(bounds.startDate, { dateStyle: "medium" })} –{" "}
              {tz.formatDate(bounds.endDate, { dateStyle: "medium" })})
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {isDirty && canManage && (
          <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={updateMutation.isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
