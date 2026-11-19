import {
  ArrowLeftRight,
  FileSpreadsheet,
  HandCoins,
  Inbox,
  Landmark,
  PiggyBankIcon,
  ReceiptText,
  RefreshCw,
  TrendingUp,
} from "lucide-react"
import type { FeatureMenu } from "@/lib/navigation"
import { FinanceInboxBadge } from "./components/finance-inbox-badge"

export const menu: FeatureMenu = {
  title: "Finance",
  url: "/finance",
  icon: PiggyBankIcon,
  weight: 40,
  group: "money",
  requiresSpace: true,
  items: [
    {
      title: "Insights",
      url: "/finance",
      icon: TrendingUp,
    },
    {
      title: "Transactions",
      url: "/finance/transactions",
      icon: ReceiptText,
    },
    {
      title: "Review Queue",
      url: "/finance/inbox",
      icon: Inbox,
      badge: FinanceInboxBadge,
    },
    {
      title: "Accounts",
      url: "/finance/accounts",
      icon: Landmark,
    },
    {
      title: "Budgets",
      url: "/finance/budgets",
      icon: PiggyBankIcon,
    },
    {
      title: "Recurring",
      url: "/finance/recurring",
      icon: RefreshCw,
    },
    {
      title: "Borrowings",
      url: "/finance/borrowings",
      icon: HandCoins,
    },
    {
      title: "Reconciliation",
      url: "/finance/reconcile",
      icon: FileSpreadsheet,
    },
    {
      title: "Exchange Rates",
      url: "/finance/rates",
      icon: ArrowLeftRight,
    },
  ],
}
