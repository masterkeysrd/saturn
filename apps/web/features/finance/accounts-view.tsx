import { useState, useMemo, useEffect, useCallback } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { accountSchema, type AccountFormValues } from "./schemas/account"
import { transferSchema, type TransferFormValues } from "./schemas/transfer"
import { useSpacePermissions } from "@/features/space/use-space"
import {
  type Account,
  type Account_Type,
  type Institution,
  useListAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useAdjustAccountBalanceMutation,
  useCreateTransferMutation,
  useListTransfersQuery,
  useGetFinanceSettingsQuery,
  useListCurrenciesQuery,
  useListExchangeRatesQuery,
  useListInstitutionsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { useDebounce } from "@/lib/use-debounce"
import { useUrlState } from "@/lib/use-url-state"
import { AccountSelect } from "./components/account-select"
import { AccountHistorySheet } from "./components/account-history-sheet"
import { InstitutionSelect } from "./components/institution-select"
import { getInstitutionLogoUrl } from "./utils"
import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Plus,
  Search,
  ArrowRightLeft,
  Trash2,
  Edit2,
  MoreVertical,
  Check,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Scale,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { formatCents, formatAmount, toCentsString } from "./utils"
import { cn } from "@/lib/utils"

const ACCOUNT_COLORS = [
  {
    name: "Indigo",
    value: "indigo",
    bg: "bg-indigo-500/10 dark:bg-indigo-500/5",
    border: "border-indigo-500/20 hover:border-indigo-500/40",
    text: "text-indigo-500",
    cardBg: "bg-indigo-500/[0.02]",
    badge: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  },
  {
    name: "Emerald",
    value: "emerald",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/5",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    text: "text-emerald-500",
    cardBg: "bg-emerald-500/[0.02]",
    badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  {
    name: "Rose",
    value: "rose",
    bg: "bg-rose-500/10 dark:bg-rose-500/5",
    border: "border-rose-500/20 hover:border-rose-500/40",
    text: "text-rose-500",
    cardBg: "bg-rose-500/[0.02]",
    badge: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  },
  {
    name: "Amber",
    value: "amber",
    bg: "bg-amber-500/10 dark:bg-amber-500/5",
    border: "border-amber-500/20 hover:border-amber-500/40",
    text: "text-amber-500",
    cardBg: "bg-amber-500/[0.02]",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  {
    name: "Sky",
    value: "sky",
    bg: "bg-sky-500/10 dark:bg-sky-500/5",
    border: "border-sky-500/20 hover:border-sky-500/40",
    text: "text-sky-500",
    cardBg: "bg-sky-500/[0.02]",
    badge: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  },
  {
    name: "Violet",
    value: "violet",
    bg: "bg-violet-500/10 dark:bg-violet-500/5",
    border: "border-violet-500/20 hover:border-violet-500/40",
    text: "text-violet-500",
    cardBg: "bg-violet-500/[0.02]",
    badge: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
]

function getAccountColors(colorName: string) {
  return ACCOUNT_COLORS.find((c) => c.value === colorName) || ACCOUNT_COLORS[0]
}

function getCardGradient(colorName: string) {
  switch (colorName) {
    case "emerald":
      return {
        card: "bg-gradient-to-br from-slate-950 via-emerald-950/80 to-slate-900 border-emerald-500/30 shadow-emerald-950/50 hover:border-emerald-400/60",
      }
    case "rose":
      return {
        card: "bg-gradient-to-br from-slate-950 via-rose-950/80 to-slate-900 border-rose-500/30 shadow-rose-950/50 hover:border-rose-400/60",
      }
    case "amber":
      return {
        card: "bg-gradient-to-br from-slate-950 via-amber-950/80 to-slate-900 border-amber-500/30 shadow-amber-950/50 hover:border-amber-400/60",
      }
    case "sky":
      return {
        card: "bg-gradient-to-br from-slate-950 via-sky-950/80 to-slate-900 border-sky-500/30 shadow-sky-950/50 hover:border-sky-400/60",
      }
    case "violet":
      return {
        card: "bg-gradient-to-br from-slate-950 via-violet-950/80 to-slate-900 border-violet-500/30 shadow-violet-950/50 hover:border-violet-400/60",
      }
    case "indigo":
    default:
      return {
        card: "bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 border-indigo-500/30 shadow-indigo-950/50 hover:border-indigo-400/60",
      }
  }
}

function getAccountTypeLabel(type: Account_Type) {
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

function TypeIcon({
  type,
  className,
}: {
  type: Account_Type
  className?: string
}) {
  switch (type) {
    case "BANK":
      return <Landmark className={className} />
    case "CREDIT_CARD":
      return <CreditCard className={className} />
    case "CASH":
      return <Coins className={className} />
    case "DIGITAL_ACCOUNT":
      return <Wallet className={className} />
    default:
      return <Landmark className={className} />
  }
}

function CardAccountItem({
  acc,
  institution,
  isWritable,
  onHistory,
  onAdjust,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  acc: Account
  institution?: Institution
  isWritable: boolean
  onHistory: () => void
  onAdjust: () => void
  onEdit: () => void
  onSetDefault?: () => void
  onDelete: () => void
}) {
  const theme = getCardGradient(acc.color)
  const isCredit = acc.type === "CREDIT_CARD"
  const logoUrl = getInstitutionLogoUrl(
    institution?.domain,
    institution?.name || acc.name
  )

  const rawBal = Number(acc.currentBalance || "0")
  const formattedBal = formatAmount(acc.currentBalance)

  const limit = Number(acc.creditLimit || "0")
  const debtOwed = rawBal > 0 ? rawBal : 0
  const overpayment = rawBal < 0 ? Math.abs(rawBal) : 0
  const availableCents = Math.max(0, limit - debtOwed + overpayment)
  const utilizationPercent =
    limit > 0 ? Math.min(100, Math.max(0, (debtOwed / limit) * 100)) : 0

  const maskNumber = acc.lastFour
    ? `•••• •••• •••• ${acc.lastFour}`
    : `•••• •••• •••• ••••`

  return (
    <div
      key={acc.id}
      onClick={onHistory}
      className={cn(
        "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-3xl border p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl",
        theme.card,
        !acc.isActive && "opacity-50 grayscale"
      )}
    >
      {/* Sheen & Ambient Watermark */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.08] via-transparent to-white/[0.02]" />
      <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-white/[0.03] blur-2xl transition-colors group-hover:bg-white/[0.07]" />

      {/* Top Header: Logo / Bank Name & Options */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-inner backdrop-blur-md">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-5 w-5 object-contain"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = "none"
                }}
              />
            ) : (
              <TypeIcon type={acc.type} className="h-5 w-5 text-white/90" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold tracking-wide text-white/90 uppercase">
              {institution?.name || acc.name}
            </span>
            <span className="text-[10px] font-medium tracking-wider text-white/50 uppercase">
              {getAccountTypeLabel(acc.type)}
            </span>
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {acc.isDefault && (
            <span className="rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 px-2.5 py-0.5 text-[9px] font-black tracking-widest text-amber-300 uppercase shadow-sm backdrop-blur-md">
              Default
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <MoreVertical className="h-4.5 w-4.5" />
                </Button>
              }
            />
            <DropdownMenuContent className="rounded-xl border border-border/50 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
              {isWritable && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onAdjust()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-400 focus:bg-emerald-500/10"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    Adjust Balance
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit Account
                  </DropdownMenuItem>
                  {!acc.isDefault && onSetDefault && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onSetDefault()
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-400 focus:bg-amber-500/10"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Set as Default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="my-1 bg-border/40" />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Account
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Masked Card Number */}
      <div className="relative z-10 my-4">
        <span className="block font-mono text-sm font-bold tracking-[0.22em] text-white/85 drop-shadow-sm">
          {maskNumber}
        </span>
      </div>

      {/* Bottom Footer Section */}
      <div className="relative z-10 space-y-3">
        {/* Upper Footer Row: Account Name & Balance Display */}
        <div className="flex items-end justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <span className="block truncate text-[10px] font-semibold tracking-wider text-white/40 uppercase">
              Account Name
            </span>
            <span className="block truncate text-xs font-bold text-white/90">
              {acc.name}
            </span>
          </div>

          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-semibold tracking-wider text-white/40 uppercase">
              {isCredit
                ? rawBal > 0
                  ? "Balance Owed"
                  : "Current Credit"
                : "Available Balance"}
            </span>
            <div className="flex items-baseline justify-end gap-1">
              <span
                className={cn(
                  "text-xl font-black tracking-tight drop-shadow-sm",
                  isCredit && rawBal > 0
                    ? "text-rose-400"
                    : isCredit && rawBal < 0
                      ? "text-emerald-400"
                      : "text-white"
                )}
              >
                {formattedBal}
              </span>
              <span className="text-[10px] font-bold text-white/60 uppercase">
                {acc.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Divider & Utilization Bar */}
        {isCredit && limit > 0 ? (
          <div className="space-y-1.5 pt-1">
            {/* Integrated Progress Bar Divider Line */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  utilizationPercent > 80
                    ? "bg-rose-500"
                    : utilizationPercent > 50
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                )}
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>

            {/* Subtext Row: Available & Limit */}
            <div className="flex items-center justify-between text-[10px] font-medium text-white/60">
              <span>
                Available:{" "}
                <span className="font-bold text-white">
                  {formatAmount(availableCents, acc.currency)}
                </span>
              </span>
              <span>
                Limit:{" "}
                <span className="font-bold text-white/90">
                  {formatAmount(limit, acc.currency)}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-medium text-white/40">
            <span>{acc.isActive ? "Active Account" : "Inactive Account"}</span>
            <span>{acc.currency}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const ACCOUNTS_FILTER_DEFAULTS = {
  q: "",
  active: false as boolean,
  sort: "_default",
}

export function AccountsView() {
  const { spaceId, isWritable } = useSpacePermissions()

  const { data: settings } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!spaceId }
  )

  const [urlState, setUrlState] = useUrlState(ACCOUNTS_FILTER_DEFAULTS)

  const [searchQuery, setSearchQuery] = useState(urlState.q)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Sync debounced search to URL parameter
  useEffect(() => {
    setUrlState({ q: debouncedSearchQuery })
  }, [debouncedSearchQuery, setUrlState])

  const [prevUrlQ, setPrevUrlQ] = useState(urlState.q)
  if (urlState.q !== prevUrlQ) {
    setPrevUrlQ(urlState.q)
    setSearchQuery(urlState.q)
  }

  const { data: accountsData, refetch: refetchAccounts } = useListAccountsQuery(
    {
      view: "FULL",
      searchQuery: urlState.q || undefined,
      activeOnly: urlState.active || undefined,
      sort:
        urlState.sort === "_default" ? undefined : urlState.sort || undefined,
    },
    { enabled: !!spaceId }
  )

  const { data: transfersData, refetch: refetchTransfers } =
    useListTransfersQuery(
      { pageSize: 30, pageToken: "" },
      { enabled: !!spaceId }
    )

  const deleteAccountMutation = useDeleteAccountMutation()
  const updateAccountMutation = useUpdateAccountMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null)

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null)
  const [targetBalanceStr, setTargetBalanceStr] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const adjustMutation = useAdjustAccountBalanceMutation({
    onSuccess: () => {
      refetchAccounts()
      refetchTransfers()
      setAdjustOpen(false)
      setAdjustingAccount(null)
      setTargetBalanceStr("")
      setAdjustNote("")
      setAdjustError(null)
    },
    onError: (err: unknown) => {
      setAdjustError(
        err instanceof Error ? err.message : "Failed to adjust balance"
      )
    },
  })

  const handleOpenAdjust = (acc: Account) => {
    setAdjustingAccount(acc)
    setTargetBalanceStr((Number(acc.currentBalance || 0) / 100).toFixed(2))
    setAdjustNote("")
    setAdjustError(null)
    setAdjustOpen(true)
  }

  const handleConfirmAdjust = (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustingAccount?.id) return

    const parsedNum = parseFloat(targetBalanceStr)
    if (isNaN(parsedNum)) {
      setAdjustError("Please enter a valid numeric target balance")
      return
    }

    const targetBalanceCents = Math.round(parsedNum * 100)
    setAdjustError(null)
    adjustMutation.mutate({
      account_id: adjustingAccount.id,
      req: {
        accountId: adjustingAccount.id,
        targetBalance: targetBalanceCents.toString(),
        note: adjustNote || undefined,
      },
    })
  }

  const [groupBy, setGroupBy] = useState<"INSTITUTION" | "TYPE" | "FLAT">(
    "INSTITUTION"
  )

  const { data: instsData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const institutions = useMemo(
    () => instsData?.institutions || [],
    [instsData?.institutions]
  )
  const instMap = useMemo(() => {
    const map: Record<string, (typeof institutions)[0]> = {}
    for (const inst of institutions) {
      if (inst.id) {
        map[inst.id] = inst
      }
    }
    return map
  }, [institutions])

  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData])
  const transfers = transfersData?.transfers || []

  const handleSetDefault = (acc: Account) => {
    if (!acc.id) return
    updateAccountMutation.mutate(
      {
        id: acc.id,
        req: {
          id: acc.id,
          account: {
            ...acc,
            isDefault: true,
          },
        },
      },
      {
        onSuccess: () => {
          refetchAccounts()
        },
      }
    )
  }

  const groupedAccounts = useMemo(() => {
    if (groupBy === "FLAT") return []

    const groups: Record<
      string,
      {
        key: string
        title: string
        domain?: string
        color?: string
        type?: Account_Type
        accounts: Account[]
        totalBalanceInBase: number
      }
    > = {}

    for (const acc of accounts) {
      let groupKey = ""
      let groupTitle = ""
      let domain: string | undefined
      let color = "indigo"
      let type: Account_Type | undefined

      if (groupBy === "INSTITUTION") {
        if (acc.institutionId && instMap[acc.institutionId]) {
          const inst = instMap[acc.institutionId]
          groupKey = inst.id || "unassigned"
          groupTitle = inst.name || "Unknown"
          domain = inst.domain
          color = inst.color || "indigo"
        } else {
          groupKey = "unassigned"
          groupTitle = "Uncategorized / Cash"
          domain = ""
          color = "sky"
        }
      } else if (groupBy === "TYPE") {
        groupKey = acc.type
        groupTitle = getAccountTypeLabel(acc.type)
        type = acc.type
        color =
          acc.type === "CREDIT_CARD"
            ? "rose"
            : acc.type === "BANK"
              ? "indigo"
              : "emerald"
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          title: groupTitle,
          domain,
          color,
          type,
          accounts: [],
          totalBalanceInBase: 0,
        }
      }
      groups[groupKey].accounts.push(acc)
      groups[groupKey].totalBalanceInBase += Number(
        acc.conversion?.balance || acc.currentBalance || 0
      )
    }

    return Object.values(groups)
  }, [accounts, groupBy, instMap])

  // Convert accounts to base currency and calculate metrics
  const metrics = useMemo(() => {
    let totalAssets = 0
    let totalLiabilities = 0
    let activeCount = 0
    let defaultAccount: Account | null = null

    accounts.forEach((acc) => {
      if (acc.isActive) {
        activeCount++
        const baseValue = formatCents(
          acc.conversion?.balance || acc.currentBalance
        )

        if (acc.type === "CREDIT_CARD") {
          if (baseValue > 0) {
            totalLiabilities += baseValue // Positive = Credit Debt Owed
          } else {
            totalAssets += Math.abs(baseValue) // Negative = Statement Credit / Overpayment
          }
        } else {
          if (baseValue < 0) {
            totalLiabilities += Math.abs(baseValue) // Bank Overdraft
          } else {
            totalAssets += baseValue // Cash / Checking Asset
          }
        }
      }

      if (acc.isDefault) {
        defaultAccount = acc
      }
    })

    return {
      netWorth: totalAssets - totalLiabilities,
      totalAssets,
      totalLiabilities,
      activeCount,
      defaultAccount,
    }
  }, [accounts])

  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return

    if (acc.isDefault) {
      alert(
        "Cannot delete the default account. Set another account as default first."
      )
      return
    }

    if (
      !confirm(
        `Are you sure you want to delete account "${acc.name}"? This action cannot be undone.`
      )
    ) {
      return
    }

    try {
      await deleteAccountMutation.mutateAsync({
        id,
        req: { id },
      })
      refetchAccounts()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete account.")
    }
  }

  return (
    <FinancePageLayout
      title="Accounts & Cash Flow"
      description="Manage cash, credit, bank accounts, and perform double-entry fund transfers."
      actions={
        isWritable && (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setTransferOpen(true)}
              variant="outline"
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/50 px-4 font-semibold text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted"
            >
              <ArrowRightLeft className="h-4.5 w-4.5" />
              Transfer Funds
            </Button>
            <Button
              onClick={() => {
                setEditingAccount(null)
                setCreateOpen(true)
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
            >
              <Plus className="h-5 w-5" />
              Add Account
            </Button>
          </div>
        )
      }
    >
      <div className="mt-2 animate-in space-y-8 duration-300 fade-in">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Net Liquidity
              </span>
            </div>
            <div className="mt-4">
              <span className="block text-2xl font-black tracking-tight text-foreground">
                {metrics.netWorth.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {settings?.baseCurrency}
                </span>
              </span>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-500/10 p-2.5 text-emerald-500">
                <Coins className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Cash & Bank Assets
              </span>
            </div>
            <div className="mt-4">
              <span className="block text-2xl font-black tracking-tight text-emerald-500 dark:text-emerald-400">
                {metrics.totalAssets.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {settings?.baseCurrency}
                </span>
              </span>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-500/10 p-2.5 text-rose-500">
                <CreditCard className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Credit Liabilities
              </span>
            </div>
            <div className="mt-4">
              <span className="block text-2xl font-black tracking-tight text-rose-500 dark:text-rose-400">
                {metrics.totalLiabilities.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {settings?.baseCurrency}
                </span>
              </span>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-500/10 p-2.5 text-indigo-500">
                <Check className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Default Account
              </span>
            </div>
            <div className="mt-4">
              <span className="block truncate text-lg font-black tracking-tight text-foreground">
                {metrics.defaultAccount
                  ? (metrics.defaultAccount as Account).name
                  : "None Set"}
              </span>
              <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                Used for form pre-fills
              </span>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Accounts List (2 cols) */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight text-foreground uppercase">
                Workspace Accounts
              </h2>

              {/* Grouping Mode Switcher */}
              <div className="flex items-center rounded-xl border border-border/40 bg-card/50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setGroupBy("INSTITUTION")}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                    groupBy === "INSTITUTION"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By Bank
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy("TYPE")}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                    groupBy === "TYPE"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By Type
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy("FLAT")}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                    groupBy === "FLAT"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Flat List
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search accounts by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 rounded-xl border-border/50 bg-background/40 pl-9 placeholder:text-muted-foreground/60 focus-visible:ring-1"
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="view-active-only"
                    checked={urlState.active}
                    onCheckedChange={(checked) =>
                      setUrlState({ active: checked })
                    }
                  />
                  <Label
                    htmlFor="view-active-only"
                    className="cursor-pointer text-xs font-semibold text-foreground"
                  >
                    Active Only
                  </Label>
                </div>

                <Select
                  value={urlState.sort}
                  onValueChange={(val) =>
                    setUrlState({ sort: val || "_default" })
                  }
                >
                  <SelectTrigger className="h-10 w-[160px] rounded-xl border-border/50 bg-background/40 text-xs font-semibold">
                    <SelectValue placeholder="Sort By">
                      {urlState.sort === "name_asc" && "Name (A-Z)"}
                      {urlState.sort === "name_desc" && "Name (Z-A)"}
                      {urlState.sort === "balance_desc" && "Balance (Highest)"}
                      {urlState.sort === "balance_asc" && "Balance (Lowest)"}
                      {urlState.sort === "created_desc" && "Newest"}
                      {urlState.sort === "created_asc" && "Oldest"}
                      {(!urlState.sort || urlState.sort === "_default") &&
                        "Default Sort"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="_default">Default Sort</SelectItem>
                    <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                    <SelectItem value="balance_desc">
                      Balance (Highest)
                    </SelectItem>
                    <SelectItem value="balance_asc">
                      Balance (Lowest)
                    </SelectItem>
                    <SelectItem value="created_desc">Newest</SelectItem>
                    <SelectItem value="created_asc">Oldest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-16 text-center">
                <Landmark className="mb-3 h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm font-semibold text-muted-foreground">
                  {urlState.q || urlState.active
                    ? "No accounts match your active filters."
                    : "No bank or cash accounts setup yet."}
                </p>
                {!urlState.q && !urlState.active && (
                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-primary text-xs font-bold text-white"
                  >
                    Create Your First Account
                  </Button>
                )}
              </div>
            ) : groupBy !== "FLAT" ? (
              /* Grouped View Accordions */
              <div className="space-y-6">
                {groupedAccounts.map((group) => {
                  const logoUrl = getInstitutionLogoUrl(
                    group.domain,
                    group.title
                  )
                  return (
                    <div
                      key={group.key}
                      className="space-y-4 rounded-3xl border border-border/40 bg-card/30 p-5 shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b border-border/30 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-card">
                            {groupBy === "INSTITUTION" && logoUrl ? (
                              <img
                                src={logoUrl}
                                alt=""
                                className="h-5 w-5 object-contain"
                                onError={(e) => {
                                  ;(e.target as HTMLElement).style.display =
                                    "none"
                                }}
                              />
                            ) : (
                              <Landmark className="h-5 w-5 text-indigo-500" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-foreground">
                              {group.title}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {group.accounts.length}{" "}
                              {group.accounts.length === 1
                                ? "account"
                                : "accounts"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            Group Total
                          </span>
                          <span className="text-lg font-black text-foreground">
                            {formatCents(
                              group.totalBalanceInBase
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-xs font-bold text-muted-foreground">
                              {settings?.baseCurrency}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {group.accounts.map((acc) => (
                          <CardAccountItem
                            key={acc.id}
                            acc={acc}
                            institution={instMap[acc.institutionId || ""]}
                            isWritable={isWritable}
                            onHistory={() => {
                              setHistoryAccount(acc)
                              setHistoryOpen(true)
                            }}
                            onAdjust={() => handleOpenAdjust(acc)}
                            onEdit={() => {
                              setEditingAccount(acc)
                              setCreateOpen(true)
                            }}
                            onSetDefault={() => handleSetDefault(acc)}
                            onDelete={() => handleDeleteAccount(acc.id || "")}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {accounts.map((acc) => (
                  <CardAccountItem
                    key={acc.id}
                    acc={acc}
                    institution={instMap[acc.institutionId || ""]}
                    isWritable={isWritable}
                    onHistory={() => {
                      setHistoryAccount(acc)
                      setHistoryOpen(true)
                    }}
                    onAdjust={() => handleOpenAdjust(acc)}
                    onEdit={() => {
                      setEditingAccount(acc)
                      setCreateOpen(true)
                    }}
                    onSetDefault={() => handleSetDefault(acc)}
                    onDelete={() => handleDeleteAccount(acc.id || "")}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Transfers History (1 col) */}
          <div className="space-y-6">
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase">
              Recent Transfers
            </h2>

            {transfers.length === 0 ? (
              <div className="rounded-3xl border border-border/40 bg-card/20 p-8 text-center text-sm text-muted-foreground">
                <ArrowRightLeft className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                No transfers recorded.
              </div>
            ) : (
              <div className="space-y-4">
                {transfers.map((t) => {
                  const srcAcc = accounts.find(
                    (a) => a.id === t.sourceAccountId
                  )
                  const dstAcc = accounts.find(
                    (a) => a.id === t.destinationAccountId
                  )

                  return (
                    <div
                      key={t.id}
                      className="relative rounded-3xl border border-border/30 bg-card/25 p-5 shadow-sm backdrop-blur-sm transition-colors hover:border-border/50"
                    >
                      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {new Date(t.transferDate).toLocaleDateString()}
                        </span>
                        <span className="font-semibold text-primary">
                          Transfer Record
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase">
                              From
                            </span>
                            <span className="truncate text-xs font-bold text-foreground">
                              {srcAcc?.name || "Deleted"}
                            </span>
                          </div>
                          <span className="mt-1 block text-sm font-black text-rose-500">
                            -{formatCents(t.sourceAmount).toLocaleString()}{" "}
                            <span className="text-[10px] text-muted-foreground uppercase">
                              {srcAcc?.currency}
                            </span>
                          </span>
                        </div>

                        <ChevronRight className="h-4.5 w-4.5 shrink-0 text-muted-foreground/45" />

                        <div className="min-w-0 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase">
                              To
                            </span>
                            <span className="truncate text-xs font-bold text-foreground">
                              {dstAcc?.name || "Deleted"}
                            </span>
                          </div>
                          <span className="mt-1 block text-sm font-black text-emerald-500">
                            +{formatCents(t.destinationAmount).toLocaleString()}{" "}
                            <span className="text-[10px] text-muted-foreground uppercase">
                              {dstAcc?.currency}
                            </span>
                          </span>
                        </div>
                      </div>

                      {t.notes && (
                        <p className="mt-3 truncate border-t border-border/20 pt-2.5 text-[10px] text-muted-foreground italic">
                          Note: {t.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sheets / Forms */}
      <CreateAccountSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        spaceId={spaceId}
        baseCurrency={settings?.baseCurrency || "USD"}
        editAccount={editingAccount}
        refetchAccounts={refetchAccounts}
      />

      <CreateTransferSheet
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={accounts}
        refetchAccounts={refetchAccounts}
        refetchTransfers={refetchTransfers}
      />

      <AccountHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        account={historyAccount}
      />

      {/* Adjust Balance Modal */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border/60 bg-background/95 p-6 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Scale className="h-5 w-5 text-emerald-400" />
              Adjust Account Balance
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter the current real-world balance for{" "}
              <span className="font-semibold text-foreground">
                {adjustingAccount?.name}
              </span>
              . Saturn will log a system reconciliation transaction to match.
            </DialogDescription>
          </DialogHeader>

          {adjustingAccount &&
            (() => {
              const currentCents = Number(adjustingAccount.currentBalance || 0)
              const parsedNum = parseFloat(targetBalanceStr)
              const targetCents = isNaN(parsedNum)
                ? currentCents
                : Math.round(parsedNum * 100)
              const deltaCents = targetCents - currentCents

              const currentBalFormatted = formatAmount(
                currentCents,
                adjustingAccount.currency
              )
              const targetBalFormatted = formatAmount(
                targetCents,
                adjustingAccount.currency
              )
              const deltaFormatted = formatAmount(
                Math.abs(deltaCents),
                adjustingAccount.currency
              )

              return (
                <form onSubmit={handleConfirmAdjust} className="space-y-4 pt-2">
                  {/* Current vs Target Card */}
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-muted/20 p-3.5">
                    <div>
                      <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                        Current Saturn Balance
                      </span>
                      <span className="text-sm font-extrabold text-foreground">
                        {currentBalFormatted}{" "}
                        <span className="text-xs font-semibold text-muted-foreground">
                          {adjustingAccount.currency}
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                        Target Real-World Balance
                      </span>
                      <span className="text-sm font-extrabold text-foreground">
                        {targetBalFormatted}{" "}
                        <span className="text-xs font-semibold text-muted-foreground">
                          {adjustingAccount.currency}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Live Preview Delta Callout */}
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-3 text-xs font-semibold transition-all",
                      deltaCents > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : deltaCents < 0
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                          : "border-border/40 bg-muted/20 text-muted-foreground"
                    )}
                  >
                    <span>Adjustment Type</span>
                    <span className="font-bold">
                      {deltaCents > 0
                        ? `+${deltaFormatted} ${adjustingAccount.currency} (Income)`
                        : deltaCents < 0
                          ? `-${deltaFormatted} ${adjustingAccount.currency} (Expense)`
                          : `0.00 ${adjustingAccount.currency} (No Change)`}
                    </span>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">
                      Actual Real-World Balance
                    </Label>
                    <AmountInput
                      value={targetBalanceStr}
                      onValueChange={(val) => setTargetBalanceStr(val)}
                      currency={adjustingAccount.currency}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">
                      Reconciliation Note (Optional)
                    </Label>
                    <Input
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      placeholder="e.g. Monthly statement reconciliation"
                      className="h-11 rounded-xl text-xs"
                    />
                  </div>

                  {adjustError && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{adjustError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAdjustOpen(false)}
                      className="cursor-pointer rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={adjustMutation.isPending || deltaCents === 0}
                      className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary text-white shadow-lg"
                    >
                      {adjustMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Confirm & Adjust Balance
                    </Button>
                  </div>
                </form>
              )
            })()}
        </DialogContent>
      </Dialog>
    </FinancePageLayout>
  )
}

/* --- Create/Edit Account Sheet --- */
interface CreateAccountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  editAccount: Account | null
  refetchAccounts: () => void
}

const ACCOUNT_TYPE_ITEMS = [
  { value: "BANK", label: "Bank / Checking" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CASH", label: "Cash Holdings" },
  { value: "DIGITAL_ACCOUNT", label: "Digital Account" },
]

function CreateAccountSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editAccount,
  refetchAccounts,
}: CreateAccountSheetProps) {
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
  }))

  const createMutation = useCreateAccountMutation()
  const updateMutation = useUpdateAccountMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      lastFour: "",
      type: "BANK",
      currency: baseCurrency || "USD",
      initialBalance: "0",
      creditLimit: "",
      color: "indigo",
      institutionId: "",
      isDefault: false,
      isActive: true,
      notes: "",
    },
  })

  useEffect(() => {
    if (open) {
      if (editAccount) {
        reset({
          name: editAccount.name,
          lastFour: editAccount.lastFour || "",
          type: editAccount.type,
          currency: editAccount.currency,
          initialBalance:
            editAccount.type === "CREDIT_CARD" &&
            Number(editAccount.initialBalance) < 0
              ? formatCents(
                  Math.abs(Number(editAccount.initialBalance))
                ).toString()
              : formatCents(editAccount.initialBalance).toString(),
          creditLimit: editAccount.creditLimit
            ? formatCents(editAccount.creditLimit).toString()
            : "",
          color: editAccount.color || "indigo",
          institutionId: editAccount.institutionId || "",
          isDefault: editAccount.isDefault,
          isActive: editAccount.isActive,
          notes: editAccount.notes || "",
        })
      } else {
        reset({
          name: "",
          lastFour: "",
          type: "BANK",
          currency: baseCurrency || "USD",
          initialBalance: "0",
          creditLimit: "",
          color: "indigo",
          institutionId: "",
          isDefault: false,
          isActive: true,
          notes: "",
        })
      }
    }
  }, [open, editAccount, baseCurrency, reset])

  const accountType = useWatch({ control, name: "type" })
  const currentColor = useWatch({ control, name: "color" })
  const isDefaultValue = useWatch({ control, name: "isDefault" })
  const isActiveValue = useWatch({ control, name: "isActive" })
  const isPending = createMutation.isPending || updateMutation.isPending

  const onSubmit = async (data: AccountFormValues) => {
    let centsStr = toCentsString(data.initialBalance || "0")
    if (data.type === "CREDIT_CARD") {
      const parsedVal = parseFloat(data.initialBalance || "0")
      if (parsedVal > 0) {
        centsStr = `-${centsStr}`
      }
    }

    const limitStr =
      data.type === "CREDIT_CARD" && data.creditLimit
        ? toCentsString(data.creditLimit)
        : "0"

    try {
      if (editAccount) {
        await updateMutation.mutateAsync({
          id: editAccount.id || "",
          req: {
            id: editAccount.id || "",
            account: {
              ...editAccount,
              name: data.name,
              creditLimit: limitStr,
              isDefault: data.isDefault,
              isActive: data.isActive,
              color: data.color,
              notes: data.notes || "",
              lastFour: data.lastFour || "",
              institutionId: data.institutionId || "",
            },
          },
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            id: "",
            name: data.name,
            type: data.type,
            currency: data.currency,
            initialBalance: centsStr,
            currentBalance: "0",
            creditLimit: limitStr,
            isDefault: data.isDefault,
            isActive: true,
            color: data.color,
            notes: data.notes || "",
            lastFour: data.lastFour || "",
            institutionId: data.institutionId || "",
          },
        })
      }
      onOpenChange(false)
      refetchAccounts()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Operation failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editAccount ? "Edit Account" : "Create Account"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Configure ledger entities for liquidity balance adjustments.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="acc-name"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Account Name
            </Label>
            <Input
              id="acc-name"
              placeholder="e.g. Chase Operating, Petty Cash"
              {...register("name")}
              className="h-11 rounded-xl"
            />
            {errors.name && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="acc-last-four"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Last 4 Digits (Optional)
            </Label>
            <Input
              id="acc-last-four"
              placeholder="e.g. 1234"
              {...register("lastFour")}
              className="h-11 rounded-xl"
            />
            {errors.lastFour && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.lastFour.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Financial Institution
            </Label>
            <Controller
              control={control}
              name="institutionId"
              render={({ field }) => (
                <InstitutionSelect
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <FormSelect
            control={control}
            name="type"
            label="Account Type"
            disabled={!!editAccount}
            items={ACCOUNT_TYPE_ITEMS}
          />

          <FormSelect
            control={control}
            name="currency"
            label="Currency"
            disabled={!!editAccount}
            items={currencyItems}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="acc-balance"
                className="text-xs font-bold tracking-wider text-foreground uppercase"
              >
                {accountType === "CREDIT_CARD"
                  ? "Initial Balance Owed"
                  : "Initial Balance"}
              </Label>
              {accountType === "CREDIT_CARD" && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  (Positive = Debt Owed)
                </span>
              )}
            </div>
            <Controller
              control={control}
              name="initialBalance"
              render={({ field }) => (
                <AmountInput
                  id="acc-balance"
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={
                    accountType === "CREDIT_CARD" ? "e.g. 450.00" : "0.00"
                  }
                  className="h-11 rounded-xl"
                  disabled={!!editAccount}
                />
              )}
            />
            <p className="text-[10px] text-muted-foreground">
              {accountType === "CREDIT_CARD"
                ? "Enter the amount currently owed on the card. Saturn will automatically register it as debt."
                : "Enter positive for cash/savings assets, or negative for overdraft."}
            </p>
            {errors.initialBalance && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.initialBalance.message}
              </p>
            )}
          </div>

          {accountType === "CREDIT_CARD" && (
            <div className="animate-in space-y-2 duration-200 slide-in-from-top-2">
              <Label
                htmlFor="acc-limit"
                className="text-xs font-bold tracking-wider text-foreground uppercase"
              >
                Credit Limit
              </Label>
              <Controller
                control={control}
                name="creditLimit"
                render={({ field }) => (
                  <AmountInput
                    id="acc-limit"
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="e.g. 5000.00"
                    className="h-11 rounded-xl"
                  />
                )}
              />
              {errors.creditLimit && (
                <p className="text-[11px] font-semibold text-destructive">
                  {errors.creditLimit.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="mb-2 block text-xs font-bold tracking-wider text-foreground uppercase">
              Card Theme Color
            </Label>
            <div className="flex gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setValue("color", c.value)}
                  className={cn(
                    "h-8 w-8 rounded-full border transition-all hover:scale-110",
                    getAccountColors(c.value).bg,
                    getAccountColors(c.value).border,
                    currentColor === c.value &&
                      "ring-2 ring-primary ring-offset-2 dark:ring-offset-card"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="is-default-switch"
                  className="block text-xs font-bold text-foreground"
                >
                  Set as Default Account
                </Label>
                <span className="block text-[10px] text-muted-foreground">
                  Pre-populates new transaction forms
                </span>
              </div>
              <Switch
                id="is-default-switch"
                checked={isDefaultValue}
                onCheckedChange={(checked) => setValue("isDefault", checked)}
              />
            </div>

            {editAccount && (
              <div className="flex items-center justify-between border-t border-border/20 pt-3">
                <div>
                  <Label
                    htmlFor="is-active-switch"
                    className="block text-xs font-bold text-foreground"
                  >
                    Account Active Status
                  </Label>
                  <span className="block text-[10px] text-muted-foreground">
                    Inactive accounts are hidden from transaction inputs
                  </span>
                </div>
                <Switch
                  id="is-active-switch"
                  checked={isActiveValue}
                  onCheckedChange={(checked) => setValue("isActive", checked)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="acc-notes"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Notes
            </Label>
            <Input
              id="acc-notes"
              placeholder="e.g. Swift codes, secondary card details"
              {...register("notes")}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all"
            >
              {editAccount ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/* --- Create Transfer Sheet --- */
interface CreateTransferSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  refetchAccounts: () => void
  refetchTransfers: () => void
}

function CreateTransferSheet({
  open,
  onOpenChange,
  accounts,
  refetchAccounts,
  refetchTransfers,
}: CreateTransferSheetProps) {
  const activeAccounts = accounts.filter((a) => a.isActive)

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )
  const rates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )
  const createMutation = useCreateTransferMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sourceAccountId: "",
      destinationAccountId: "",
      sourceAmount: "",
      destinationAmount: "",
      transferDate: new Date(),
      notes: "",
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        sourceAccountId: "",
        destinationAccountId: "",
        sourceAmount: "",
        destinationAmount: "",
        transferDate: new Date(),
        notes: "",
      })
    }
  }, [open, reset])

  const srcId = useWatch({ control, name: "sourceAccountId" })
  const dstId = useWatch({ control, name: "destinationAccountId" })
  const srcAmount = useWatch({ control, name: "sourceAmount" })

  const srcAcc = activeAccounts.find((a) => a.id === srcId)
  const dstAcc = activeAccounts.find((a) => a.id === dstId)

  // Autocalculate target amount if currencies match, or apply exchange rate
  const updateTargetAmount = useCallback(
    (amountStr: string, sId: string, dId: string) => {
      const sAcc = activeAccounts.find((a) => a.id === sId)
      const dAcc = activeAccounts.find((a) => a.id === dId)
      if (!sAcc || !dAcc || !amountStr) return

      const srcVal = parseFloat(amountStr)
      if (isNaN(srcVal) || srcVal <= 0) return

      if (sAcc.currency === dAcc.currency) {
        setValue("destinationAmount", amountStr)
      } else {
        const rate = rates
          .filter(
            (r) =>
              r.fromCurrency === sAcc.currency && r.toCurrency === dAcc.currency
          )
          .sort(
            (a, b) =>
              new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
          )[0]

        if (rate) {
          setValue("destinationAmount", (srcVal * rate.rate).toFixed(2))
        }
      }
    },
    [activeAccounts, rates, setValue]
  )

  useEffect(() => {
    if (srcId && dstId && srcAmount) {
      updateTargetAmount(srcAmount, srcId, dstId)
    }
  }, [srcId, dstId, srcAmount, updateTargetAmount])

  const onSubmit = async (data: TransferFormValues) => {
    try {
      await createMutation.mutateAsync({
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        sourceAmount: toCentsString(data.sourceAmount),
        destinationAmount: toCentsString(data.destinationAmount),
        transferDate: data.transferDate.toISOString(),
        notes: data.notes || "",
      })
      onOpenChange(false)
      reset()
      refetchAccounts()
      refetchTransfers()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Transfer failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Perform Fund Transfer
          </SheetTitle>
          <SheetDescription className="text-xs">
            Double-entry ledger entry: deducts from source and credits target.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Account (Withdraw From)
            </Label>
            <AccountSelect
              control={control}
              name="sourceAccountId"
              accounts={activeAccounts.filter((a) => a.id !== dstId)}
              placeholder="Choose source account"
            />
            {errors.sourceAccountId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.sourceAccountId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Destination Account (Deposit To)
            </Label>
            <AccountSelect
              control={control}
              name="destinationAccountId"
              accounts={activeAccounts.filter((a) => a.id !== srcId)}
              placeholder="Choose target account"
            />
            {errors.destinationAccountId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.destinationAccountId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Amount ({srcAcc?.currency || ""})
            </Label>
            <AmountInput
              control={control}
              name="sourceAmount"
              onValueChange={(val) => {
                updateTargetAmount(val, srcId, dstId)
              }}
              currency={srcAcc?.currency}
              placeholder="0.00"
              className="h-11 rounded-xl"
            />
            {errors.sourceAmount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.sourceAmount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Target Amount ({dstAcc?.currency || ""})
            </Label>
            <AmountInput
              control={control}
              name="destinationAmount"
              currency={dstAcc?.currency}
              placeholder="0.00"
              className="h-11 rounded-xl"
            />
            {errors.destinationAmount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.destinationAmount.message}
              </p>
            )}
          </div>

          {srcAcc && dstAcc && srcAcc.currency !== dstAcc.currency && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-[11px] text-amber-500">
              <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
              <div>
                <p className="font-bold">Multi-Currency Transfer</p>
                <p className="mt-0.5 leading-relaxed">
                  Funds will be converted from {srcAcc.currency} to{" "}
                  {dstAcc.currency} using your rates configuration.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="block text-xs font-bold tracking-wider text-foreground uppercase">
              Transfer Date
            </Label>
            <Controller
              control={control}
              name="transferDate"
              render={({ field }) => (
                <DatePicker
                  date={field.value}
                  setDate={(d) => d && field.onChange(d)}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="transfer-notes"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Transfer Notes
            </Label>
            <Input
              id="transfer-notes"
              placeholder="e.g. Monthly savings allocation"
              {...register("notes")}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all hover:scale-[1.01]"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Perform Transfer
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
