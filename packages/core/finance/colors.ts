export const AVAILABLE_COLORS = [
  "teal",
  "sky",
  "blue",
  "indigo",
  "violet",
  "plum",
  "pink",
  "coral",
  "orange",
  "amber",
  "lime",
  "emerald",
] as const

export type AvailableColor = (typeof AVAILABLE_COLORS)[number]

const COLOR_ALIASES: Record<string, AvailableColor> = {
  rose: "coral",
}

export const COLOR_HEX_MAP: Record<AvailableColor, string> = {
  teal: "#0d9488",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  plum: "#a855f7",
  pink: "#ec4899",
  coral: "#f43f5e",
  orange: "#f97316",
  amber: "#f59e0b",
  lime: "#84cc16",
  emerald: "#10b981",
}

function normalizeColorKey(color?: string | null): AvailableColor {
  if (!color) return "indigo"
  const lower = color.toLowerCase()
  const resolved = COLOR_ALIASES[lower] ?? lower
  if (resolved in COLOR_HEX_MAP) {
    return resolved as AvailableColor
  }
  return "indigo"
}

export function getColorHex(color?: string | null): string {
  return COLOR_HEX_MAP[normalizeColorKey(color)]
}

export interface BudgetColor {
  name: string
  value: AvailableColor
  hex: string
  bg: string
  border: string
  text: string
  bar: string
}

export const BUDGET_COLORS: BudgetColor[] = [
  {
    name: "Teal",
    value: "teal",
    hex: "#0d9488",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    text: "text-teal-600 dark:text-teal-400",
    bar: "bg-teal-500",
  },
  {
    name: "Sky",
    value: "sky",
    hex: "#0ea5e9",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-600 dark:text-sky-400",
    bar: "bg-sky-500",
  },
  {
    name: "Blue",
    value: "blue",
    hex: "#3b82f6",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
  },
  {
    name: "Indigo",
    value: "indigo",
    hex: "#6366f1",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-600 dark:text-indigo-400",
    bar: "bg-indigo-500",
  },
  {
    name: "Violet",
    value: "violet",
    hex: "#8b5cf6",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
  },
  {
    name: "Plum",
    value: "plum",
    hex: "#a855f7",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-600 dark:text-purple-400",
    bar: "bg-purple-500",
  },
  {
    name: "Pink",
    value: "pink",
    hex: "#ec4899",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    text: "text-pink-600 dark:text-pink-400",
    bar: "bg-pink-500",
  },
  {
    name: "Coral",
    value: "coral",
    hex: "#f43f5e",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
  },
  {
    name: "Orange",
    value: "orange",
    hex: "#f97316",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
  },
  {
    name: "Amber",
    value: "amber",
    hex: "#f59e0b",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  {
    name: "Lime",
    value: "lime",
    hex: "#84cc16",
    bg: "bg-lime-500/10",
    border: "border-lime-500/20",
    text: "text-lime-700 dark:text-lime-400",
    bar: "bg-lime-500",
  },
  {
    name: "Emerald",
    value: "emerald",
    hex: "#10b981",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
]

export function getBudgetColors(colorName: string): BudgetColor {
  const key = normalizeColorKey(colorName)
  return (
    BUDGET_COLORS.find((c) => c.value === key) ||
    BUDGET_COLORS.find((c) => c.value === "indigo") ||
    BUDGET_COLORS[0]
  )
}

export interface AccountColor {
  value: AvailableColor
  label: string
  hex: string
  bg: string
  border: string
}

export const ACCOUNT_COLORS: AccountColor[] = BUDGET_COLORS.map((c) => ({
  value: c.value,
  label: c.name,
  hex: c.hex,
  bg: c.bar,
  border: c.bar.replace("bg-", "border-"),
}))

export function getAccountColors(colorName: string): AccountColor {
  const key = normalizeColorKey(colorName)
  return (
    ACCOUNT_COLORS.find((c) => c.value === key) ||
    ACCOUNT_COLORS.find((c) => c.value === "indigo") ||
    ACCOUNT_COLORS[0]
  )
}

export type AccountTypeValue =
  "BANK" | "CREDIT_CARD" | "CASH" | "DIGITAL_ACCOUNT"

export type AccountTypeIconName =
  "landmark" | "credit-card" | "coins" | "wallet"

export interface AccountTypeOption {
  label: string
  value: AccountTypeValue
  iconName: AccountTypeIconName
  description?: string
}

export const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    label: "Bank / Checking",
    value: "BANK",
    iconName: "landmark",
    description: "Checking, savings, or standard deposit account",
  },
  {
    label: "Credit Card",
    value: "CREDIT_CARD",
    iconName: "credit-card",
    description: "Revolving line of credit or card balance",
  },
  {
    label: "Cash Holdings",
    value: "CASH",
    iconName: "coins",
    description: "Physical cash, petty cash, or vault",
  },
  {
    label: "Digital Wallet",
    value: "DIGITAL_ACCOUNT",
    iconName: "wallet",
    description: "PayPal, Apple Cash, crypto, or e-wallet",
  },
]

export function getAccountTypeLabel(type?: string | null): string {
  const match = ACCOUNT_TYPES.find((t) => t.value === type)
  if (match) return match.label
  switch (type) {
    case "BANK":
      return "Bank / Checking"
    case "CREDIT_CARD":
      return "Credit Card"
    case "CASH":
      return "Cash Holdings"
    case "DIGITAL_ACCOUNT":
      return "Digital Wallet"
    default:
      return "Account"
  }
}

export type BudgetIntervalValue = "MONTHLY" | "WEEKLY" | "YEARLY" | "ONE_TIME"

export interface BudgetIntervalOption {
  label: string
  value: BudgetIntervalValue
}

export const BUDGET_INTERVAL_OPTIONS: BudgetIntervalOption[] = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Yearly", value: "YEARLY" },
  { label: "One-Time", value: "ONE_TIME" },
]

export const RECURRING_INTERVAL_OPTIONS: BudgetIntervalOption[] = [
  { label: "Weekly", value: "WEEKLY" },
  { label: "Monthly", value: "MONTHLY" },
  { label: "Yearly", value: "YEARLY" },
]
