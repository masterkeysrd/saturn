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

export * from "@saturn/core"

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
    case "emerald":
      return {
        card: "bg-gradient-to-br from-slate-950 via-emerald-950/80 to-slate-900 border-emerald-500/30 shadow-emerald-950/50 hover:border-emerald-400/60",
      }
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
