import type { Account, Account_Type } from "@/gen/saturn/finance/v1/finance"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Building2, CreditCard, Coins, Wallet } from "lucide-react"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"

// Formatting helper
const formatCents = (cents: string | number) => {
  return Number(cents) / 100
}

interface BaseAccountSelectProps {
  accounts: Account[]
  placeholder?: string
  disabled?: boolean
  className?: string
  allowNone?: boolean
}

type AccountSelectProps<TFieldValues extends FieldValues = FieldValues> =
  | (BaseAccountSelectProps & {
      control?: undefined
      name?: undefined
      value: string
      onValueChange: (value: string) => void
    })
  | (BaseAccountSelectProps & {
      control: Control<TFieldValues, any, any>
      name: Path<TFieldValues>
      value?: undefined
      onValueChange?: undefined
    })

function getAccountTypeIcon(type: Account_Type) {
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
        bg: "bg-rose-500/10 dark:bg-rose-500/20",
        border: "border-rose-500/20 dark:border-rose-500/30",
        text: "text-rose-600 dark:text-rose-400",
      }
    case "amber":
    case "yellow":
    case "orange":
      return {
        bg: "bg-amber-500/10 dark:bg-amber-500/20",
        border: "border-amber-500/20 dark:border-amber-500/30",
        text: "text-amber-600 dark:text-amber-400",
      }
    case "emerald":
    case "green":
      return {
        bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
        border: "border-emerald-500/20 dark:border-emerald-500/30",
        text: "text-emerald-600 dark:text-emerald-400",
      }
    case "sky":
    case "blue":
    case "cyan":
      return {
        bg: "bg-sky-500/10 dark:bg-sky-500/20",
        border: "border-sky-500/20 dark:border-sky-500/30",
        text: "text-sky-600 dark:text-sky-400",
      }
    case "violet":
    case "purple":
      return {
        bg: "bg-violet-500/10 dark:bg-violet-500/20",
        border: "border-violet-500/20 dark:border-violet-500/30",
        text: "text-violet-600 dark:text-violet-400",
      }
    case "indigo":
    default:
      return {
        bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
        border: "border-indigo-500/20 dark:border-indigo-500/30",
        text: "text-indigo-600 dark:text-indigo-400",
      }
  }
}

export function AccountSelect<TFieldValues extends FieldValues = FieldValues>(
  props: AccountSelectProps<TFieldValues>
) {
  if ("control" in props && props.control && props.name) {
    const {
      control,
      name,
      accounts,
      placeholder,
      disabled,
      className,
      allowNone,
    } = props
    return (
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <div>
            <AccountSelectInner
              value={field.value || ""}
              onValueChange={field.onChange}
              accounts={accounts}
              placeholder={placeholder}
              disabled={disabled}
              className={className}
              allowNone={allowNone}
            />
            {fieldState.error && (
              <p className="mt-1 text-[11px] font-semibold text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
    )
  }

  const controlledProps = props as BaseAccountSelectProps & {
    value: string
    onValueChange: (value: string) => void
  }

  return (
    <AccountSelectInner
      value={controlledProps.value}
      onValueChange={controlledProps.onValueChange}
      accounts={controlledProps.accounts}
      placeholder={controlledProps.placeholder}
      disabled={controlledProps.disabled}
      className={controlledProps.className}
      allowNone={controlledProps.allowNone}
    />
  )
}

function AccountSelectInner({
  value,
  onValueChange,
  accounts,
  placeholder = "Select an account...",
  disabled = false,
  className,
  allowNone = false,
}: BaseAccountSelectProps & {
  value: string
  onValueChange: (value: string) => void
}) {
  const selectedAccount = accounts.find((a) => a.id === value)
  const SelectedIcon = selectedAccount
    ? getAccountTypeIcon(selectedAccount.type)
    : null
  const selectedColors = selectedAccount
    ? getAccountColorClasses(selectedAccount.color)
    : null

  const handleValueChange = (val: string | null) => {
    if (!val || val === "_none") {
      onValueChange("")
    } else {
      onValueChange(val)
    }
  }

  const selectValue = allowNone && !value ? "_none" : value

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "!h-11 w-full rounded-xl border-border/60 bg-background/50 text-left transition-all hover:border-border focus:ring-1 focus:ring-primary/20",
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {selectedAccount && SelectedIcon && selectedColors ? (
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div
                  className={cn(
                    "shrink-0 rounded-lg border p-1",
                    selectedColors.bg,
                    selectedColors.text,
                    selectedColors.border
                  )}
                >
                  <SelectedIcon className="h-3.5 w-3.5" />
                </div>
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
