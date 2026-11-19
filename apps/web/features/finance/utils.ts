import {
  PiggyBank,
  Utensils,
  ShoppingBag,
  Car,
  Zap,
  Clapperboard,
  Heart,
  GraduationCap,
  Tv,
  Briefcase,
  Sparkles,
  ShoppingCart,
  Home,
  Plane,
  Gift,
  Umbrella,
  Coins,
  Music,
  Gamepad2,
  Bike,
  Smartphone,
  Monitor,
  Scale,
  Building2,
  Flame,
  Store,
} from "lucide-react"

import type {
  Budget,
  InsightGranularity,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  getEndOfDay,
  getStartOfDay,
  getTimezoneParts,
  MS_PER_DAY,
  parseDate,
} from "@saturn/core"

export * from "@saturn/core"

export function computeBudgetPacePercent(
  budget: Budget,
  now: Date
): number | null {
  if (budget.interval === "ONE_TIME" || budget.status === "CLOSED") {
    return null
  }
  const period = budget.currentPeriod
  if (!period?.startDate || !period?.endDate) {
    return null
  }
  const startMs = new Date(period.startDate).getTime()
  const endMs = new Date(period.endDate).getTime()
  const totalMs = endMs - startMs
  if (isNaN(startMs) || isNaN(endMs) || totalMs <= 0) {
    return null
  }
  const raw = ((now.getTime() - startMs) / totalMs) * 100
  return Math.min(Math.max(raw, 0), 100)
}

export type InsightsDateRangePreset =
  | "THIS_MONTH"
  | "LAST_3M"
  | "LAST_6M"
  | "YTD"
  | "LAST_12M"
  | "ALL_TIME"
  | "CUSTOM"

function toYmd(
  date: Date | string | number | null | undefined,
  timeZone: string
): string {
  const parts = getTimezoneParts(date, timeZone)
  if (!parts) return ""
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

export function computeInsightsQueryBounds(
  range: InsightsDateRangePreset,
  customFrom: string,
  customTo: string,
  now: Date,
  timeZone: string
): {
  startDate: string
  endDate: string
  ymdFrom: string
  ymdTo: string
  recommendedGranularity: InsightGranularity
} {
  if (range === "ALL_TIME") {
    return {
      startDate: "",
      endDate: "",
      ymdFrom: "",
      ymdTo: "",
      recommendedGranularity: "MONTHLY",
    }
  }

  const parts = getTimezoneParts(now, timeZone)
  const year = parts?.year ?? now.getUTCFullYear()
  const month = parts?.month ?? now.getUTCMonth() + 1

  if (range === "CUSTOM") {
    const startDate = customFrom
      ? getStartOfDay(customFrom, timeZone).toISOString()
      : ""
    const endDate = customTo
      ? getEndOfDay(customTo, timeZone).toISOString()
      : ""

    let recommendedGranularity: InsightGranularity = "MONTHLY"
    if (customFrom && customTo) {
      const s = parseDate(customFrom, timeZone)
      const e = parseDate(customTo, timeZone)
      if (s && e) {
        const days = Math.max(
          1,
          Math.round((e.getTime() - s.getTime()) / MS_PER_DAY)
        )
        recommendedGranularity =
          days <= 31
            ? "DAILY"
            : days <= 120
              ? "WEEKLY"
              : days <= 730
                ? "MONTHLY"
                : "YEARLY"
      }
    }

    return {
      startDate,
      endDate,
      ymdFrom: customFrom,
      ymdTo: customTo,
      recommendedGranularity,
    }
  }

  let startAnchor: Date | string
  let recommendedGranularity: InsightGranularity

  switch (range) {
    case "THIS_MONTH":
      startAnchor = `${year}-${String(month).padStart(2, "0")}-01`
      recommendedGranularity = "DAILY"
      break
    case "YTD":
      startAnchor = `${year}-01-01`
      recommendedGranularity = "MONTHLY"
      break
    case "LAST_3M":
      startAnchor = new Date(Date.UTC(year, month - 3, 1, 12, 0, 0))
      recommendedGranularity = "WEEKLY"
      break
    case "LAST_12M":
      startAnchor = new Date(Date.UTC(year, month - 12, 1, 12, 0, 0))
      recommendedGranularity = "MONTHLY"
      break
    case "LAST_6M":
    default:
      startAnchor = new Date(Date.UTC(year, month - 6, 1, 12, 0, 0))
      recommendedGranularity = "MONTHLY"
      break
  }

  const startDt = getStartOfDay(startAnchor, timeZone)
  const endDt = getEndOfDay(now, timeZone)

  return {
    startDate: startDt.toISOString(),
    endDate: endDt.toISOString(),
    ymdFrom: toYmd(startDt, timeZone),
    ymdTo: toYmd(endDt, timeZone),
    recommendedGranularity,
  }
}

export function getPeriodDateBounds(
  startDateStr: string,
  granularity: InsightGranularity,
  timeZone: string
): { dateFrom: string; dateTo: string } {
  const parts = getTimezoneParts(startDateStr, timeZone)
  if (!parts) return { dateFrom: "", dateTo: "" }
  const ymdFrom = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`

  if (granularity === "DAILY") {
    return { dateFrom: ymdFrom, dateTo: ymdFrom }
  }
  if (granularity === "WEEKLY") {
    const startDt = parseDate(startDateStr, timeZone)
    if (!startDt) return { dateFrom: ymdFrom, dateTo: ymdFrom }
    const endDt = new Date(startDt.getTime() + 6 * MS_PER_DAY)
    return { dateFrom: ymdFrom, dateTo: toYmd(endDt, timeZone) }
  }
  if (granularity === "YEARLY") {
    return {
      dateFrom: `${parts.year}-01-01`,
      dateTo: `${parts.year}-12-31`,
    }
  }
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  return {
    dateFrom: `${parts.year}-${String(parts.month).padStart(2, "0")}-01`,
    dateTo: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  }
}

export const BUDGET_ICONS = [
  { value: "piggy-bank", label: "General", icon: PiggyBank },
  { value: "utensils", label: "Dining", icon: Utensils },
  { value: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { value: "shopping-cart", label: "Groceries", icon: ShoppingCart },
  { value: "home", label: "Housing", icon: Home },
  { value: "car", label: "Travel", icon: Car },
  { value: "plane", label: "Flights", icon: Plane },
  { value: "zap", label: "Bills", icon: Zap },
  { value: "flame", label: "Utilities", icon: Flame },
  { value: "umbrella", label: "Insurance", icon: Umbrella },
  { value: "smartphone", label: "Phone & Internet", icon: Smartphone },
  { value: "clapperboard", label: "Leisure", icon: Clapperboard },
  { value: "heart", label: "Health", icon: Heart },
  { value: "graduation-cap", label: "Education", icon: GraduationCap },
  { value: "tv", label: "SaaS", icon: Tv },
  { value: "monitor", label: "Subscriptions", icon: Monitor },
  { value: "music", label: "Music", icon: Music },
  { value: "gamepad-2", label: "Gaming", icon: Gamepad2 },
  { value: "briefcase", label: "Business", icon: Briefcase },
  { value: "coins", label: "Investments", icon: Coins },
  { value: "scale", label: "Taxes", icon: Scale },
  { value: "building-2", label: "Real Estate", icon: Building2 },
  { value: "store", label: "Retail", icon: Store },
  { value: "gift", label: "Gifts & Donations", icon: Gift },
  { value: "bike", label: "Cycling", icon: Bike },
  { value: "sparkles", label: "Special", icon: Sparkles },
]

export function getBudgetIcon(iconName: string) {
  return BUDGET_ICONS.find((i) => i.value === iconName)?.icon || PiggyBank
}

export function getCardGradient(colorName: string) {
  switch (colorName) {
    case "teal":
      return {
        card: "bg-gradient-to-br from-slate-950 via-teal-950/80 to-slate-900 border-teal-500/30 shadow-teal-950/50 hover:border-teal-400/60",
      }
    case "blue":
      return {
        card: "bg-gradient-to-br from-slate-950 via-blue-950/80 to-slate-900 border-blue-500/30 shadow-blue-950/50 hover:border-blue-400/60",
      }
    case "plum":
      return {
        card: "bg-gradient-to-br from-slate-950 via-purple-950/80 to-slate-900 border-purple-500/30 shadow-purple-950/50 hover:border-purple-400/60",
      }
    case "pink":
      return {
        card: "bg-gradient-to-br from-slate-950 via-pink-950/80 to-slate-900 border-pink-500/30 shadow-pink-950/50 hover:border-pink-400/60",
      }
    case "orange":
      return {
        card: "bg-gradient-to-br from-slate-950 via-orange-950/80 to-slate-900 border-orange-500/30 shadow-orange-950/50 hover:border-orange-400/60",
      }
    case "lime":
      return {
        card: "bg-gradient-to-br from-slate-950 via-lime-950/80 to-slate-900 border-lime-500/30 shadow-lime-950/50 hover:border-lime-400/60",
      }
    case "emerald":
      return {
        card: "bg-gradient-to-br from-slate-950 via-emerald-950/80 to-slate-900 border-emerald-500/30 shadow-emerald-950/50 hover:border-emerald-400/60",
      }
    case "coral":
    case "rose":
      return {
        card: "bg-gradient-to-br from-slate-950 via-rose-950/80 to-slate-900 border-rose-500/30 shadow-rose-950/50 hover:border-rose-400/60",
      }
    case "amber":
      return {
        card: "bg-gradient-to-br from-slate-950 via-amber-950/80 to-slate-900 border-amber-500/30 shadow-amber-950/50 hover:border-amber-400/60",
      }
    case "sky":
      return {
        card: "bg-gradient-to-br from-slate-950 via-sky-950/80 to-slate-900 border-sky-500/30 shadow-sky-950/50 hover:border-sky-400/60",
      }
    case "violet":
      return {
        card: "bg-gradient-to-br from-slate-950 via-violet-950/80 to-slate-900 border-violet-500/30 shadow-violet-950/50 hover:border-violet-400/60",
      }
    case "indigo":
    default:
      return {
        card: "bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 border-indigo-500/30 shadow-indigo-950/50 hover:border-indigo-400/60",
      }
  }
}
