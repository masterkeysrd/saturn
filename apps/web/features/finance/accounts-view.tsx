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
  useListAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useCreateTransferMutation,
  useListTransfersQuery,
  useGetFinanceSettingsQuery,
  useListCurrenciesQuery,
  useListExchangeRatesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { useDebounce } from "@/lib/use-debounce"
import { useUrlState } from "@/lib/use-url-state"
import { AccountSelect } from "./components/account-select"
import { AccountHistorySheet } from "./components/account-history-sheet"
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
  Info,
  ChevronRight,
  History,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { formatCents, toCentsString } from "./utils"
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

function getAccountTypeIcon(type: Account_Type) {
  switch (type) {
    case "BANK":
      return Landmark
    case "CREDIT_CARD":
      return CreditCard
    case "CASH":
      return Coins
    case "DIGITAL_ACCOUNT":
      return Wallet
    default:
      return Landmark
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

  const [createOpen, setCreateOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null)

  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData])
  const transfers = transfersData?.transfers || []

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
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase">
              Workspace Accounts
            </h2>

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
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {accounts.map((acc) => {
                  const colors = getAccountColors(acc.color)
                  const Icon = getAccountTypeIcon(acc.type)
                  const isCredit = acc.type === "CREDIT_CARD"

                  return (
                    <div
                      key={acc.id}
                      className={cn(
                        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 transition-all duration-300 hover:border-border/60 hover:shadow-xl",
                        !acc.isActive && "bg-card/20 opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "rounded-2xl border p-2.5",
                              colors.bg,
                              colors.text,
                              colors.border
                            )}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                          </div>
                          <div>
                            <h3 className="flex max-w-[200px] items-center gap-1.5 truncate text-sm font-bold text-foreground">
                              <span>{acc.name}</span>
                              {acc.lastFour && (
                                <span className="shrink-0 text-[10px] font-normal text-muted-foreground/80">
                                  •••• {acc.lastFour}
                                </span>
                              )}
                            </h3>
                            <span className="text-[10px] leading-none text-muted-foreground">
                              {getAccountTypeLabel(acc.type)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {acc.isDefault && (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[8px] font-black tracking-wider text-primary uppercase">
                              Default
                            </span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full hover:bg-muted"
                                >
                                  <MoreVertical className="h-4.5 w-4.5 text-muted-foreground" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                              <DropdownMenuItem
                                onClick={() => {
                                  setHistoryAccount(acc)
                                  setHistoryOpen(true)
                                }}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                              >
                                <History className="h-3.5 w-3.5" />
                                View Ledger
                              </DropdownMenuItem>

                              {isWritable && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingAccount(acc)
                                      setCreateOpen(true)
                                    }}
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Edit Account
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleDeleteAccount(acc.id || "")
                                    }
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

                      <div className="mt-6 flex items-baseline justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                              Balance
                            </span>
                            {isCredit && (
                              <span
                                className={cn(
                                  "py-0.2 rounded border px-1.5 text-[9px] font-extrabold uppercase",
                                  Number(acc.currentBalance || "0") > 0
                                    ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                    : Number(acc.currentBalance || "0") < 0
                                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                      : "border-border/30 bg-muted/20 text-muted-foreground"
                                )}
                              >
                                {Number(acc.currentBalance || "0") > 0
                                  ? "Balance Owed"
                                  : Number(acc.currentBalance || "0") < 0
                                    ? "Statement Credit"
                                    : "Zero Balance"}
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-2xl font-black tracking-tight",
                              isCredit && Number(acc.currentBalance || "0") > 0
                                ? "text-rose-500 dark:text-rose-400"
                                : isCredit &&
                                    Number(acc.currentBalance || "0") < 0
                                  ? "text-emerald-500 dark:text-emerald-400"
                                  : "text-foreground"
                            )}
                          >
                            {formatCents(acc.currentBalance).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}{" "}
                            <span className="text-xs leading-none font-bold text-muted-foreground uppercase">
                              {acc.currency}
                            </span>
                          </span>
                        </div>
                      </div>

                      {isCredit && (
                        <div className="mt-5 space-y-2 border-t border-border/30 pt-4">
                          {(() => {
                            const limit = Number(acc.creditLimit || "0")
                            const rawBal = Number(acc.currentBalance || "0")
                            const debtOwed = rawBal > 0 ? rawBal : 0
                            const overpayment =
                              rawBal < 0 ? Math.abs(rawBal) : 0
                            const availableCents = Math.max(
                              0,
                              limit - debtOwed + overpayment
                            )
                            const isOverLimit = limit > 0 && debtOwed > limit
                            const overLimitCents = isOverLimit
                              ? debtOwed - limit
                              : 0

                            const utilizationPercent =
                              limit > 0
                                ? Math.min(
                                    100,
                                    Math.max(0, (debtOwed / limit) * 100)
                                  )
                                : 0

                            let barColor = "bg-emerald-500"
                            if (utilizationPercent > 85 || isOverLimit) {
                              barColor = "bg-rose-500"
                            } else if (utilizationPercent > 50) {
                              barColor = "bg-amber-500"
                            }

                            return (
                              <>
                                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                                  <span>
                                    Limit: {formatCents(limit).toLocaleString()}{" "}
                                    {acc.currency}
                                  </span>
                                  <span>
                                    Available:{" "}
                                    <span className="font-bold text-foreground">
                                      {formatCents(
                                        availableCents
                                      ).toLocaleString()}{" "}
                                      {acc.currency}
                                    </span>
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <div className="h-2 w-full overflow-hidden rounded-full border border-border/20 bg-muted">
                                    <div
                                      className={cn(
                                        "h-full transition-all duration-500",
                                        barColor
                                      )}
                                      style={{
                                        width: `${utilizationPercent}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[9px] font-black text-muted-foreground/70 uppercase">
                                    <span>
                                      {utilizationPercent.toFixed(0)}%
                                      Utilization
                                    </span>
                                    {isOverLimit && (
                                      <span className="font-bold text-rose-400">
                                        Over Limit by{" "}
                                        {formatCents(
                                          overLimitCents
                                        ).toLocaleString()}{" "}
                                        {acc.currency}
                                      </span>
                                    )}
                                    {overpayment > 0 && (
                                      <span className="font-bold text-emerald-400">
                                        +{formatCents(overpayment).toFixed(2)}{" "}
                                        Overpaid
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {acc.notes && (
                        <div className="mt-4 flex items-start gap-1.5 border-t border-border/30 pt-3 text-[11px] text-muted-foreground">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          <p className="line-clamp-2">{acc.notes}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
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
            },
          },
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            id: "",
            spaceId,
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
            <Input
              id="acc-balance"
              type="number"
              step="0.01"
              placeholder={
                accountType === "CREDIT_CARD" ? "e.g. 450.00" : "0.00"
              }
              {...register("initialBalance")}
              className="h-11 rounded-xl"
              disabled={!!editAccount}
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
              <Input
                id="acc-limit"
                type="number"
                step="0.01"
                placeholder="e.g. 5000.00"
                {...register("creditLimit")}
                className="h-11 rounded-xl"
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
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("sourceAmount", {
                onChange: (e) =>
                  updateTargetAmount(e.target.value, srcId, dstId),
              })}
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
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("destinationAmount")}
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
