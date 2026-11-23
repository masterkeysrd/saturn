import { useMemo, useState } from "react"
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { formatShortMonth, parseDate } from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  formatYm,
  parseYm,
  resolveFinancePeriodBounds,
  shiftYearMonth,
  toYmdInTimezone,
  type FinancePeriodPreset,
  type FinancePeriodUpdate,
  type FinancePeriodValue,
} from "../period-bounds"

export type {
  FinancePeriodBounds,
  FinancePeriodPreset,
  FinancePeriodUpdate,
  FinancePeriodValue,
} from "../period-bounds"

const PRESET_OPTIONS: {
  value: Exclude<FinancePeriodPreset, "month">
  labelKey: TranslationKey
}[] = [
  { value: "this_month", labelKey: "finance.period.thisMonth" },
  { value: "last_month", labelKey: "finance.period.lastMonth" },
  { value: "3m", labelKey: "finance.period.last3" },
  { value: "6m", labelKey: "finance.period.last6" },
  { value: "ytd", labelKey: "finance.period.ytd" },
  { value: "12m", labelKey: "finance.period.last12" },
  { value: "all", labelKey: "finance.period.allTime" },
  { value: "custom", labelKey: "finance.period.custom" },
]

export interface FinancePeriodPickerProps {
  value: FinancePeriodValue
  onChange: (next: FinancePeriodUpdate) => void
  className?: string
}

export function FinancePeriodPicker({
  value,
  onChange,
  className,
}: FinancePeriodPickerProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const now = tz.now()
  const nowParts = tz.parts(now)
  const nowYear = nowParts?.year ?? now.getUTCFullYear()
  const nowMonth = nowParts?.month ?? now.getUTCMonth() + 1
  const currentMonthYm = formatYm(nowYear, nowMonth)

  const bounds = useMemo(
    () => resolveFinancePeriodBounds(value, now, tz.timezone, tz.locale),
    [value, now, tz.timezone, tz.locale]
  )

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    const active = parseYm(bounds.activeMonth)
    return active ? active.year : nowYear
  })
  const [customExpanded, setCustomExpanded] = useState(
    bounds.period === "custom"
  )

  const shortMonthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        label: formatShortMonth(
          new Date(Date.UTC(2026, idx, 15, 12, 0, 0)),
          "UTC",
          tz.locale
        ),
      })),
    [tz.locale]
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const active = parseYm(bounds.activeMonth)
      setViewYear(active ? active.year : nowYear)
      setCustomExpanded(bounds.period === "custom")
    }
    setOpen(nextOpen)
  }

  const handleStepMonth = (delta: -1 | 1) => {
    const active = parseYm(bounds.activeMonth)
    const baseYear = active ? active.year : nowYear
    const baseMonth = active ? active.month : nowMonth
    const next = shiftYearMonth(baseYear, baseMonth, delta)
    const nextYm = formatYm(next.year, next.month)
    onChange({
      period: "month",
      month: nextYm,
      dateFrom: "",
      dateTo: "",
    })
  }

  const handleSelectMonth = (monthNum: number) => {
    const ym = formatYm(viewYear, monthNum)
    setCustomExpanded(false)
    onChange({
      period: "month",
      month: ym,
      dateFrom: "",
      dateTo: "",
    })
    setOpen(false)
  }

  const handleSelectPreset = (
    preset: Exclude<FinancePeriodPreset, "month">
  ) => {
    if (preset === "custom") {
      setCustomExpanded(true)
      onChange({
        period: "custom",
        month: "",
        dateFrom: value.dateFrom || bounds.ymdFrom,
        dateTo: value.dateTo || bounds.ymdTo,
      })
      return
    }
    setCustomExpanded(false)
    onChange({
      period: preset,
      month: "",
      dateFrom: "",
      dateTo: "",
    })
    setOpen(false)
  }

  const fromDateObj = value.dateFrom
    ? (parseDate(value.dateFrom, tz.timezone) ?? undefined)
    : bounds.period === "custom" && bounds.ymdFrom
      ? (parseDate(bounds.ymdFrom, tz.timezone) ?? undefined)
      : undefined
  const toDateObj = value.dateTo
    ? (parseDate(value.dateTo, tz.timezone) ?? undefined)
    : bounds.period === "custom" && bounds.ymdTo
      ? (parseDate(bounds.ymdTo, tz.timezone) ?? undefined)
      : undefined

  return (
    <div
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-control shadow-2xs",
        className
      )}
    >
      <button
        type="button"
        aria-label={t("datePicker.prevMonth")}
        onClick={() => handleStepMonth(-1)}
        className="flex h-full w-8 cursor-pointer items-center justify-center rounded-l-lg border-r border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
      </button>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          type="button"
          aria-label={t("finance.period.selectPeriod")}
          className="flex h-full cursor-pointer items-center gap-2 px-3 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted/40"
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span>{bounds.label}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 rounded-xl border border-border bg-popover p-3 shadow-xl"
        >
          <div className="space-y-0">
            <div className="flex items-center justify-between pb-2.5">
              <button
                type="button"
                aria-label={t("finance.period.prevYear")}
                onClick={() => setViewYear((y) => y - 1)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {viewYear}
              </span>
              <button
                type="button"
                aria-label={t("finance.period.nextYear")}
                onClick={() => setViewYear((y) => y + 1)}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {shortMonthNames.map((item) => {
                const cellYm = formatYm(viewYear, item.month)
                const isActive = bounds.activeMonth === cellYm
                const isCurrentCalendarMonth = cellYm === currentMonthYm
                return (
                  <button
                    key={cellYm}
                    type="button"
                    data-month={cellYm}
                    aria-pressed={isActive}
                    onClick={() => handleSelectMonth(item.month)}
                    className={cn(
                      "relative flex h-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : isCurrentCalendarMonth
                          ? "bg-muted/50 text-foreground ring-1 ring-primary/40 hover:bg-muted"
                          : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="my-2.5 border-t border-border/60" />

            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_OPTIONS.map((preset) => {
                const isSelected =
                  preset.value === "custom"
                    ? bounds.period === "custom" || customExpanded
                    : !customExpanded && bounds.period === preset.value
                return (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectPreset(preset.value)}
                    className={cn(
                      "flex h-7 cursor-pointer items-center justify-start rounded-md px-2 text-xs font-medium transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    {t(preset.labelKey)}
                  </button>
                )
              })}
            </div>

            {(customExpanded || bounds.period === "custom") && (
              <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2.5">
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {t("common.from")}
                  </span>
                  <DatePicker
                    date={fromDateObj}
                    setDate={(d) =>
                      onChange({
                        period: "custom",
                        month: "",
                        dateFrom: d ? toYmdInTimezone(d, tz.timezone) : "",
                        dateTo: value.dateTo || bounds.ymdTo,
                      })
                    }
                    placeholder={t("finance.period.startDate")}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {t("common.to")}
                  </span>
                  <DatePicker
                    date={toDateObj}
                    setDate={(d) =>
                      onChange({
                        period: "custom",
                        month: "",
                        dateFrom: value.dateFrom || bounds.ymdFrom,
                        dateTo: d ? toYmdInTimezone(d, tz.timezone) : "",
                      })
                    }
                    placeholder={t("finance.period.endDate")}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label={t("datePicker.nextMonth")}
        onClick={() => handleStepMonth(1)}
        className="flex h-full w-8 cursor-pointer items-center justify-center rounded-r-lg border-l border-border/70 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}
