import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import { useI18n, useTimezone, invalidateFinanceQueries } from "@saturn/hooks"
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

type MonthDescKey =
  | "settings.finance.monthDescCalendar"
  | "settings.finance.monthDescRetail"
  | "settings.finance.monthDescCustom"
  | "settings.finance.monthDescCommonwealth"
  | "settings.finance.monthDescOceania"
  | "settings.finance.monthDescUsFederal"

const FISCAL_MONTH_DESCRIPTION_KEYS: Record<string, MonthDescKey> = {
  "Calendar Year (Default)": "settings.finance.monthDescCalendar",
  "Retail 4-5-4 Calendar": "settings.finance.monthDescRetail",
  "Custom Fiscal Cycle": "settings.finance.monthDescCustom",
  "United Kingdom, India, Japan, Canada":
    "settings.finance.monthDescCommonwealth",
  "Australia, New Zealand, Academic": "settings.finance.monthDescOceania",
  "United States Federal": "settings.finance.monthDescUsFederal",
}

function formatMonthName(month: number, language: string): string {
  const date = new Date(2000, month - 1, 1)
  const name = new Intl.DateTimeFormat(language, { month: "long" }).format(date)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function FinanceSettings() {
  const { t, language } = useI18n()
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
      await invalidateFinanceQueries(queryClient)
      setSelectedMonth(null)
      const monthOption = FISCAL_YEAR_MONTHS.find(
        (m) => m.month === activeMonth
      )
      toast.add({
        type: "success",
        title: t("settings.finance.saveOk"),
        description: t("settings.finance.saveOkDesc", {
          month: monthOption
            ? formatMonthName(monthOption.month, language)
            : String(activeMonth),
        }),
      })
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: t("settings.finance.saveFailedToast"),
        description:
          err instanceof Error
            ? err.message
            : t("settings.finance.saveFailedDefault"),
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
          {t("settings.finance.noWorkspace")}
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
            : t("settings.finance.loadFailed")}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t("common.retry")}
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
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {t("settings.finance.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("settings.finance.desc")}
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
                {t("settings.finance.baseCurrencyLabel")}
              </Label>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {t("settings.finance.lockedSetup")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.finance.baseCurrencyDesc")}
            </p>
            <div className="flex h-11 items-center rounded-2xl border border-border/60 bg-muted/20 px-4 font-mono text-sm font-medium text-foreground">
              {settings?.baseCurrency || "USD"}
            </div>
          </div>

          {/* Row 2: Fiscal Year Start Month */}
          <div className="space-y-3 py-6">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t("settings.finance.fiscalStartLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.finance.fiscalStartDesc")}
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
                  {formatMonthName(activeMonth, language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 rounded-2xl border border-border/50 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
                {FISCAL_YEAR_MONTHS.map((option) => (
                  <SelectItem key={option.month} value={String(option.month)}>
                    <div className="flex flex-col py-0.5">
                      <span className="font-medium text-foreground">
                        {formatMonthName(option.month, language)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(
                          FISCAL_MONTH_DESCRIPTION_KEYS[option.description] ??
                            "settings.finance.monthDescCustom"
                        )}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground">
              {t("settings.finance.activeCycle", { label: bounds.label })} (
              {tz.formatDate(bounds.startDate, { dateStyle: "medium" })} –{" "}
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
              {t("settings.spacePrefs.reset")}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? t("common.saving")
                : t("settings.finance.saveChanges")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
