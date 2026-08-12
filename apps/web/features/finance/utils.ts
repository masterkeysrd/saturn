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

export function formatAmount(
  cents: string | number | undefined | null,
  currency?: string
): string {
  const amount = formatCents(cents)
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

export function toCentsString(amountStr: string | number): string {
  const val = typeof amountStr === "number" ? amountStr : parseFloat(amountStr)
  return isNaN(val) ? "0" : Math.round(val * 100).toString()
}

export function formatInterval(interval: string | undefined | null): string {
  if (!interval) return "Monthly"
  const clean = interval.replace(/^(INTERVAL_|STATUS_)/i, "").toLowerCase()
  if (!clean) return "Monthly"
  if (clean === "one_time") return "One-Time"
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

export function decodeBase64Utf8(base64: string | undefined | null): string {
  if (!base64) return ""
  try {
    const binString = atob(base64)
    const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    if (decoded && decoded.trim().length > 0) {
      return decoded
    }
  } catch {
    // If not base64 encoded text, return the raw string directly
  }
  return base64
}

export function extractDomainFromUrlOrName(input?: string): string {
  if (!input || !input.trim()) return ""
  let clean = input.trim().toLowerCase()
  if (clean.includes("://")) {
    clean = clean.split("://")[1]
  }
  const pathIdx = clean.search(/[/?#]/)
  if (pathIdx !== -1) {
    clean = clean.substring(0, pathIdx)
  }
  if (clean.startsWith("www.")) {
    clean = clean.substring(4)
  }
  if (clean.includes(".") && !clean.includes(" ")) {
    return clean
  }
  return ""
}

export function getInstitutionLogoUrl(domain?: string, name?: string): string {
  const resolvedDomain =
    extractDomainFromUrlOrName(domain) || extractDomainFromUrlOrName(name)
  if (resolvedDomain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolvedDomain)}&sz=64`
  }
  return ""
}
