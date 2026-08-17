import { PiggyBankIcon } from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"

export const menu: FeatureMenu = {
  title: "Finance",
  url: "/finance",
  icon: PiggyBankIcon,
  weight: 20,
  group: "main",
  requiresSpace: true,
  items: [
    {
      title: "Insights",
      url: "/finance",
    },
    {
      title: "Accounts",
      url: "/finance/accounts",
    },
    {
      title: "Transactions",
      url: "/finance/transactions",
    },
    {
      title: "Review Queue",
      url: "/finance/inbox",
    },
    {
      title: "Reconciliation",
      url: "/finance/reconcile",
    },
    {
      title: "Recurring Transactions",
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
