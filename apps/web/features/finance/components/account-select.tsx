import type { Account, AccountType } from "@/gen/saturn/finance/v1/finance"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Building2, CreditCard, Coins, Wallet } from "lucide-react"

// Formatting helper
const formatCents = (cents: string | number) => {
  return Number(cents) / 100
}

interface AccountSelectProps {
  value: string
  onValueChange: (value: string) => void
  accounts: Account[]
  placeholder?: string
  disabled?: boolean
  className?: string
  allowNone?: boolean
}

function getAccountTypeIcon(type: AccountType) {
  switch (type) {
    case "CREDIT_CARD":
      return CreditCard
    case "CASH":
      return Coins
    case "DIGITAL_ACCOUNT":
      return Wallet
    default:
      return Building2
  }
}

function getAccountColorClasses(colorName: string) {
  const c = colorName.toLowerCase()
  switch (c) {
    case "rose":
    case "red":
      return {
        bg: "bg-rose-500/10 dark:bg-rose-500/15",
        text: "text-rose-500 dark:text-rose-400",
        border: "border-rose-500/20 dark:border-rose-500/30",
        solidBg: "bg-rose-500",
      }
    case "emerald":
    case "green":
      return {
        bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
        text: "text-emerald-500 dark:text-emerald-400",
        border: "border-emerald-500/20 dark:border-emerald-500/30",
        solidBg: "bg-emerald-500",
      }
    case "amber":
    case "orange":
    case "yellow":
      return {
        bg: "bg-amber-500/10 dark:bg-amber-500/15",
        text: "text-amber-500 dark:text-amber-400",
        border: "border-amber-500/20 dark:border-amber-500/30",
        solidBg: "bg-amber-500",
      }
    case "blue":
    case "sky":
      return {
        bg: "bg-blue-500/10 dark:bg-blue-500/15",
        text: "text-blue-500 dark:text-blue-400",
        border: "border-blue-500/20 dark:border-blue-500/30",
        solidBg: "bg-blue-500",
      }
    case "purple":
    case "violet":
      return {
        bg: "bg-purple-500/10 dark:bg-purple-500/15",
        text: "text-purple-500 dark:text-purple-400",
        border: "border-purple-500/20 dark:border-purple-500/30",
        solidBg: "bg-purple-500",
      }
    default: // indigo or fallback
      return {
        bg: "bg-indigo-500/10 dark:bg-indigo-500/15",
        text: "text-indigo-500 dark:text-indigo-400",
        border: "border-indigo-500/20 dark:border-indigo-500/30",
        solidBg: "bg-indigo-500",
      }
  }
}

export function AccountSelect({
  value,
  onValueChange,
  accounts,
  placeholder = "Select account",
  disabled = false,
  className,
  allowNone = false,
}: AccountSelectProps) {
  const selectedAccount =
    value && value !== "_none" ? accounts.find((a) => a.id === value) : null

  return (
    <Select
      value={selectedAccount ? value : allowNone ? "_none" : ""}
      onValueChange={(val: string | null) => {
        onValueChange(val === "_none" || !val ? "" : val)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "!h-12 w-full rounded-xl border border-border/50 bg-background/50 text-left transition-all hover:bg-background/80 focus:ring-1 focus:ring-ring",
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {selectedAccount ? (
            <div className="flex w-full items-center justify-between pr-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {(() => {
                  const Icon = getAccountTypeIcon(selectedAccount.type)
                  const colors = getAccountColorClasses(selectedAccount.color)
                  return (
                    <div
                      className={cn(
                        "shrink-0 rounded-lg border p-1",
                        colors.bg,
                        colors.text,
                        colors.border
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  )
                })()}
                <span className="truncate text-xs font-semibold text-foreground">
                  {selectedAccount.name}
                  {selectedAccount.lastFour && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      •••• {selectedAccount.lastFour}
                    </span>
                  )}
                </span>
              </div>
              <span className="ml-2 shrink-0 text-[10px] font-bold text-muted-foreground tabular-nums">
                {selectedAccount.type === "CREDIT_CARD" &&
                  Number(selectedAccount.currentBalance || "0") > 0 &&
                  "-"}
                {formatCents(
                  selectedAccount.currentBalance || "0"
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {selectedAccount.currency}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px] rounded-xl border border-border/50 bg-card/95 p-1 shadow-xl backdrop-blur-xl">
        {allowNone && (
          <SelectItem
            value="_none"
            className="cursor-pointer rounded-lg py-2 pr-8 pl-3 text-xs font-semibold text-muted-foreground focus:bg-accent/80 focus:text-accent-foreground"
          >
            None / No Account
          </SelectItem>
        )}
        {accounts.map((acc) => {
          const Icon = getAccountTypeIcon(acc.type)
          const colors = getAccountColorClasses(acc.color)
          return (
            <SelectItem
              key={acc.id}
              value={acc.id}
              className="cursor-pointer rounded-lg py-2.5 pr-8 pl-3 focus:bg-accent/80 focus:text-accent-foreground"
            >
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={cn(
                      "shrink-0 rounded-lg border p-1",
                      colors.bg,
                      colors.text,
                      colors.border
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col text-left">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {acc.name}
                    </span>
                    {acc.lastFour && (
                      <span className="text-[9px] text-muted-foreground">
                        Ending in {acc.lastFour}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs font-bold text-foreground tabular-nums">
                    {acc.type === "CREDIT_CARD" &&
                      Number(acc.currentBalance || "0") > 0 &&
                      "-"}
                    {formatCents(acc.currentBalance || "0").toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}{" "}
                    <span className="text-[9px] text-muted-foreground uppercase">
                      {acc.currency}
                    </span>
                  </span>
                </div>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
