import { PiggyBankIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Finance",
  url: "/finance",
  icon: PiggyBankIcon,
  weight: 20,
  group: "main",
  items: [
    {
      title: "Insights",
      url: "/finance",
    },
    {
      title: "Transactions",
      url: "/finance/transactions",
    },
    {
      title: "Recurring Expenses",
      url: "/finance/recurring",
    },
    {
      title: "Budgets",
      url: "/finance/budgets",
    },
    {
      title: "Exchange Rates",
      url: "/finance/rates",
    },
    {
      title: "Borrowings",
      url: "/finance/borrowings",
    },
    {
      title: "Settings",
      url: "/finance/settings",
    },
  ],
}
