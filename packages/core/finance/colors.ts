export const AVAILABLE_COLORS = [
  "indigo",
  "emerald",
  "rose",
  "amber",
  "sky",
  "violet",
] as const

export type AvailableColor = (typeof AVAILABLE_COLORS)[number]

export const COLOR_HEX_MAP: Record<AvailableColor, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
}

export function getColorHex(color?: string | null): string {
  if (!color) return COLOR_HEX_MAP.indigo
  const key = color.toLowerCase() as AvailableColor
  return COLOR_HEX_MAP[key] || COLOR_HEX_MAP.indigo
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
    name: "Indigo",
    value: "indigo",
    hex: "#6366f1",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-500",
    bar: "bg-indigo-500",
  },
  {
    name: "Emerald",
    value: "emerald",
    hex: "#10b981",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    name: "Rose",
    value: "rose",
    hex: "#f43f5e",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-500",
    bar: "bg-rose-500",
  },
  {
    name: "Amber",
    value: "amber",
    hex: "#f59e0b",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-500",
    bar: "bg-amber-500",
  },
  {
    name: "Sky",
    value: "sky",
    hex: "#0ea5e9",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-500",
    bar: "bg-sky-500",
  },
  {
    name: "Violet",
    value: "violet",
    hex: "#8b5cf6",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-500",
    bar: "bg-violet-500",
  },
]

export function getBudgetColors(colorName: string): BudgetColor {
  return BUDGET_COLORS.find((c) => c.value === colorName) || BUDGET_COLORS[0]
}

export interface AccountColor {
  value: AvailableColor
  label: string
  hex: string
  bg: string
  border: string
}

export const ACCOUNT_COLORS: AccountColor[] = [
  {
    value: "indigo",
    label: "Indigo",
    hex: "#6366f1",
    bg: "bg-indigo-500",
    border: "border-indigo-500",
  },
  {
    value: "emerald",
    label: "Emerald",
    hex: "#10b981",
    bg: "bg-emerald-500",
    border: "border-emerald-500",
  },
  {
    value: "rose",
    label: "Rose",
    hex: "#f43f5e",
    bg: "bg-rose-500",
    border: "border-rose-500",
  },
  {
    value: "amber",
    label: "Amber",
    hex: "#f59e0b",
    bg: "bg-amber-500",
    border: "border-amber-500",
  },
  {
    value: "sky",
    label: "Sky",
    hex: "#0ea5e9",
    bg: "bg-sky-500",
    border: "border-sky-500",
  },
  {
    value: "violet",
    label: "Violet",
    hex: "#8b5cf6",
    bg: "bg-violet-500",
    border: "border-violet-500",
  },
]

export function getAccountColors(colorName: string): AccountColor {
  return ACCOUNT_COLORS.find((c) => c.value === colorName) || ACCOUNT_COLORS[0]
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
