import { useState, useMemo } from "react"
import {
  useListInstitutionsQuery,
  type Account,
  type Account_Type,
} from "@/gen/saturn/finance/v1/finance"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { getInstitutionLogoUrl, formatAmount } from "../utils"
import { cn } from "@/lib/utils"
import {
  Building2,
  CreditCard,
  Coins,
  Wallet,
  ChevronsUpDown,
  Check,
} from "lucide-react"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"

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
      control: Control<TFieldValues>
      name: Path<TFieldValues>
      value?: undefined
      onValueChange?: undefined
    })

function renderAccountTypeIcon(type: Account_Type, className?: string) {
  switch (type) {
    case "CREDIT_CARD":
      return <CreditCard className={className} />
    case "CASH":
      return <Coins className={className} />
    case "DIGITAL_ACCOUNT":
      return <Wallet className={className} />
    default:
      return <Building2 className={className} />
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

function AccountItemLogo({
  institutionDomain,
  institutionName,
  accountName,
  type,
  colors,
}: {
  institutionDomain?: string
  institutionName?: string
  accountName: string
  type: Account_Type
  colors: { bg: string; border: string; text: string }
}) {
  const logoUrl = getInstitutionLogoUrl(
    institutionDomain,
    institutionName || accountName
  )
  const [prevLogoUrl, setPrevLogoUrl] = useState(logoUrl)
  const [failed, setFailed] = useState(false)

  if (prevLogoUrl !== logoUrl) {
    setPrevLogoUrl(logoUrl)
    setFailed(false)
  }

  return (
    <div
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg p-0.5",
        logoUrl && !failed
          ? "border border-border/30 bg-card/60"
          : cn("border", colors.bg, colors.text, colors.border)
      )}
    >
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        renderAccountTypeIcon(type, "h-3.5 w-3.5")
      )}
    </div>
  )
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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const { data: instData } = useListInstitutionsQuery({
    pageSize: 100,
    pageToken: "",
  })

  const instMap = useMemo(() => {
    const map: Record<string, { domain?: string; name?: string }> = {}
    if (instData?.institutions) {
      for (const inst of instData.institutions) {
        if (inst.id) {
          map[inst.id] = { domain: inst.domain, name: inst.name }
        }
      }
    }
    return map
  }, [instData])

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === value),
    [accounts, value]
  )
  const selectedColors = useMemo(
    () =>
      selectedAccount ? getAccountColorClasses(selectedAccount.color) : null,
    [selectedAccount]
  )

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((acc) => {
      const nameMatch = (acc.name || "").toLowerCase().includes(q)
      const lastFourMatch = (acc.lastFour || "").toLowerCase().includes(q)
      const currencyMatch = (acc.currency || "").toLowerCase().includes(q)
      return nameMatch || lastFourMatch || currencyMatch
    })
  }, [accounts, search])

  const handleSelect = (accId: string) => {
    onValueChange(accId === "_none" ? "" : accId)
    setOpen(false)
    setSearch("")
  }

  const selectedInst = selectedAccount?.institutionId
    ? instMap[selectedAccount.institutionId]
    : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 text-left font-normal transition-all hover:border-border focus:ring-1 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {selectedAccount && selectedColors ? (
          <div className="flex w-full min-w-0 items-center justify-between pr-1">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <AccountItemLogo
                institutionDomain={selectedInst?.domain}
                institutionName={selectedInst?.name}
                accountName={selectedAccount.name}
                type={selectedAccount.type}
                colors={selectedColors}
              />
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
              {formatAmount(
                selectedAccount.currentBalance,
                selectedAccount.currency
              )}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] rounded-xl border border-border/50 bg-card/95 p-2 shadow-xl backdrop-blur-xl"
        align="start"
      >
        <div className="space-y-2">
          <Input
            placeholder="Search account name, ending digits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-muted/40 text-xs"
            autoFocus
          />

          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
            {allowNone && (
              <button
                type="button"
                onClick={() => handleSelect("_none")}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors",
                  !value
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent/60"
                )}
              >
                <span>No Account (Off-ledger / Cash)</span>
                {!value && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )}

            {filteredAccounts.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No accounts found
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const colors = getAccountColorClasses(acc.color)
                const isSelected = acc.id === value
                const inst = acc.institutionId
                  ? instMap[acc.institutionId]
                  : undefined
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelect(acc.id || "")}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors",
                      isSelected
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-accent/60"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AccountItemLogo
                        institutionDomain={inst?.domain}
                        institutionName={inst?.name}
                        accountName={acc.name}
                        type={acc.type}
                        colors={colors}
                      />
                      <div className="flex min-w-0 flex-col text-left">
                        <span className="truncate text-xs font-semibold">
                          {acc.name}
                        </span>
                        {acc.lastFour && (
                          <span className="text-[9px] text-muted-foreground">
                            Ending in {acc.lastFour}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <span className="text-xs font-bold tabular-nums">
                        {acc.type === "CREDIT_CARD" &&
                          Number(acc.currentBalance || "0") > 0 &&
                          "-"}
                        {formatAmount(acc.currentBalance, acc.currency)}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
