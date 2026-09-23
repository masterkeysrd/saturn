export interface BudgetColor {
  name: string
  value: string
  bg: string
  border: string
  text: string
  bar: string
}

export const BUDGET_COLORS: BudgetColor[] = [
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

export function getBudgetColors(colorName: string): BudgetColor {
  return BUDGET_COLORS.find((c) => c.value === colorName) || BUDGET_COLORS[0]
}

export interface AccountColor {
  value: string
  label: string
  bg: string
  border: string
}

export const ACCOUNT_COLORS: AccountColor[] = [
  {
    value: "indigo",
    label: "Indigo",
    bg: "bg-indigo-500",
    border: "border-indigo-500",
  },
  {
    value: "emerald",
    label: "Emerald",
    bg: "bg-emerald-500",
    border: "border-emerald-500",
  },
  {
    value: "rose",
    label: "Rose",
    bg: "bg-rose-500",
    border: "border-rose-500",
  },
  {
    value: "amber",
    label: "Amber",
    bg: "bg-amber-500",
    border: "border-amber-500",
  },
  { value: "sky", label: "Sky", bg: "bg-sky-500", border: "border-sky-500" },
  {
    value: "violet",
    label: "Violet",
    bg: "bg-violet-500",
    border: "border-violet-500",
  },
]

export function getAccountColors(colorName: string): AccountColor {
  return ACCOUNT_COLORS.find((c) => c.value === colorName) || ACCOUNT_COLORS[0]
}

export function getAccountTypeLabel(type: string): string {
  switch (type) {
    case "BANK":
      return "Bank / Checking"
    case "CREDIT_CARD":
      return "Credit Card"
    case "CASH":
      return "Cash"
    case "DIGITAL_ACCOUNT":
      return "Digital / E-Wallet"
    default:
      return "Account"
  }
}
