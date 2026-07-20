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
      title: "Budgets",
      url: "/finance/budgets",
    },
    {
      title: "Exchange Rates",
      url: "/finance/rates",
    },
    {
      title: "Transactions",
      url: "/finance/transactions",
    },
    {
      title: "Settings",
      url: "/finance/settings",
    },
  ],
}
