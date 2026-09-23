import type { ComponentType } from "react"
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
  type LucideProps,
} from "lucide-react-native"

export const BUDGET_ICONS: Record<string, ComponentType<LucideProps>> = {
  "piggy-bank": PiggyBank,
  utensils: Utensils,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  home: Home,
  car: Car,
  plane: Plane,
  zap: Zap,
  flame: Flame,
  umbrella: Umbrella,
  smartphone: Smartphone,
  clapperboard: Clapperboard,
  heart: Heart,
  "graduation-cap": GraduationCap,
  tv: Tv,
  monitor: Monitor,
  music: Music,
  "gamepad-2": Gamepad2,
  briefcase: Briefcase,
  coins: Coins,
  scale: Scale,
  "building-2": Building2,
  store: Store,
  gift: Gift,
  bike: Bike,
  sparkles: Sparkles,
}

/**
 * Returns the matching Lucide icon component for a budget by its icon slug or name.
 */
export function getBudgetIcon(
  iconName?: string,
  budgetName?: string
): ComponentType<LucideProps> {
  if (iconName && BUDGET_ICONS[iconName]) {
    return BUDGET_ICONS[iconName]
  }

  // Keyword-based fallback based on budget name
  if (budgetName) {
    const lower = budgetName.toLowerCase()
    if (
      lower.includes("food") ||
      lower.includes("din") ||
      lower.includes("restaur") ||
      lower.includes("cafe") ||
      lower.includes("coffee")
    ) {
      return Utensils
    }
    if (
      lower.includes("grocer") ||
      lower.includes("market") ||
      lower.includes("super")
    ) {
      return ShoppingCart
    }
    if (
      lower.includes("shop") ||
      lower.includes("cloth") ||
      lower.includes("retail")
    ) {
      return ShoppingBag
    }
    if (
      lower.includes("transport") ||
      lower.includes("car") ||
      lower.includes("gas") ||
      lower.includes("fuel") ||
      lower.includes("auto")
    ) {
      return Car
    }
    if (
      lower.includes("travel") ||
      lower.includes("flight") ||
      lower.includes("trip")
    ) {
      return Plane
    }
    if (
      lower.includes("rent") ||
      lower.includes("hous") ||
      lower.includes("home") ||
      lower.includes("mortgage")
    ) {
      return Home
    }
    if (
      lower.includes("bill") ||
      lower.includes("electr") ||
      lower.includes("util") ||
      lower.includes("power")
    ) {
      return Zap
    }
    if (
      lower.includes("health") ||
      lower.includes("med") ||
      lower.includes("doctor") ||
      lower.includes("gym") ||
      lower.includes("fit")
    ) {
      return Heart
    }
    if (
      lower.includes("fun") ||
      lower.includes("entertain") ||
      lower.includes("movie") ||
      lower.includes("cinema")
    ) {
      return Clapperboard
    }
    if (
      lower.includes("tech") ||
      lower.includes("sub") ||
      lower.includes("soft") ||
      lower.includes("stream")
    ) {
      return Tv
    }
    if (lower.includes("game") || lower.includes("play")) {
      return Gamepad2
    }
    if (
      lower.includes("invest") ||
      lower.includes("sav") ||
      lower.includes("crypto")
    ) {
      return Coins
    }
    if (
      lower.includes("educat") ||
      lower.includes("school") ||
      lower.includes("learn") ||
      lower.includes("course")
    ) {
      return GraduationCap
    }
  }

  return PiggyBank
}
