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
} from "lucide-react"

export const BUDGET_COLORS = [
  {
    name: "Indigo",
    value: "indigo",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-500",
    bar: "bg-indigo-500",
  },
  {
    name: "Emerald",
    value: "emerald",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    name: "Rose",
    value: "rose",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-500",
    bar: "bg-rose-500",
  },
  {
    name: "Amber",
    value: "amber",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-500",
    bar: "bg-amber-500",
  },
  {
    name: "Sky",
    value: "sky",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-500",
    bar: "bg-sky-500",
  },
  {
    name: "Violet",
    value: "violet",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-500",
    bar: "bg-violet-500",
  },
]

export const BUDGET_ICONS = [
  { value: "piggy-bank", label: "General", icon: PiggyBank },
  { value: "utensils", label: "Dining", icon: Utensils },
  { value: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { value: "car", label: "Travel", icon: Car },
  { value: "zap", label: "Bills", icon: Zap },
  { value: "clapperboard", label: "Leisure", icon: Clapperboard },
  { value: "heart", label: "Health", icon: Heart },
  { value: "graduation-cap", label: "Education", icon: GraduationCap },
  { value: "tv", label: "SaaS", icon: Tv },
  { value: "briefcase", label: "Business", icon: Briefcase },
  { value: "sparkles", label: "Special", icon: Sparkles },
]

export function getBudgetColors(colorName: string) {
  return BUDGET_COLORS.find((c) => c.value === colorName) || BUDGET_COLORS[0]
}

export function getBudgetIcon(iconName: string) {
  return BUDGET_ICONS.find((i) => i.value === iconName)?.icon || PiggyBank
}

export function formatCents(cents: string | number | undefined | null): number {
  if (cents === undefined || cents === null) return 0
  const val = typeof cents === "number" ? cents : parseFloat(cents)
  return isNaN(val) ? 0 : val / 100
}

export function toCentsString(amountStr: string | number): string {
  const val = typeof amountStr === "number" ? amountStr : parseFloat(amountStr)
  return isNaN(val) ? "0" : Math.round(val * 100).toString()
}

export function formatInterval(interval: string | undefined | null): string {
  if (!interval) return "Monthly"
  const clean = interval.replace(/^(INTERVAL_|STATUS_)/i, "").toLowerCase()
  if (!clean) return "Monthly"
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export function formatNextDueDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "N/A"
  const d = new Date(dateStr)
  if (isNaN(d.getTime()) || d.getFullYear() <= 1970) return "N/A"
  const now = new Date()
  const showYear = d.getFullYear() !== now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
    timeZone: "UTC",
  })
}

export function formatStatus(status: string | undefined | null): string {
  if (!status) return "Active"
  const clean = status
    .replace(/^(STATUS_|RECURRING_EXPENSE_STATUS_)/i, "")
    .toLowerCase()
  if (!clean || clean === "unspecified") return "Active"
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export function isStatusActive(status: string | undefined | null): boolean {
  if (!status) return true
  const clean = status
    .replace(/^(STATUS_|RECURRING_EXPENSE_STATUS_)/i, "")
    .toUpperCase()
  return clean === "ACTIVE" || clean === "UNSPECIFIED"
}

export function formatSourceType(
  sourceType: string | undefined | null
): string {
  if (!sourceType) return "Scheduled Payment"
  const clean = sourceType
    .replace(/^SOURCE_TYPE_/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
  if (!clean || clean === "unspecified") return "Scheduled Payment"
  if (clean === "recurrent expense" || clean === "recurring expense")
    return "Recurring Expense"
  return clean
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function decodeBase64Utf8(base64: string): string {
  try {
    const binString = atob(base64)
    const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ""
  }
}
