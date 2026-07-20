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

export function formatCents(centsStr: string): number {
  return parseFloat(centsStr) / 100
}

export function toCentsString(amountStr: string): string {
  const val = parseFloat(amountStr)
  return isNaN(val) ? "0" : Math.round(val * 100).toString()
}
