import { useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  useSpacePermissions,
  resolveSpacePath,
} from "@/features/space/use-space"
import {
  type Account,
  type Account_Type,
  useListAccountsQuery,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useListTransfersQuery,
  useGetFinanceSettingsQuery,
  useListInstitutionsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { useDebounce } from "@/lib/use-debounce"
import { useUrlState } from "@/lib/use-url-state"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { cn } from "@/lib/utils"
import { CardAccountItem } from "./components/card-account-item"
import { CreateAccountSheet } from "./components/create-account-sheet"
import { CreateTransferSheet } from "./components/create-transfer-sheet"
import { AdjustBalanceModal } from "./components/adjust-balance-modal"
import { AccountHistorySheet } from "./components/account-history-sheet"
import { getInstitutionLogoUrl, formatAmount, formatCents } from "./utils"
import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Plus,
  Search,
  ArrowRightLeft,
  Check,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

const ACCOUNTS_FILTER_DEFAULTS = {
  q: "",
  active: false as boolean,
  sort: "_default",
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

export function AccountsView() {
  const navigate = useNavigate()
  const { spaceId, isWritable } = useSpacePermissions()
  const [urlState, setUrlState] = useUrlState(ACCOUNTS_FILTER_DEFAULTS)
  const [searchQuery, setSearchQuery] = useState(urlState.q || "")

  const debouncedSearch = useDebounce(searchQuery, 300)

  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!spaceId }
  )
  const settings = settingsData

  const { data: accountsData, refetch: refetchAccounts } = useListAccountsQuery(
    {
      searchQuery: debouncedSearch || undefined,
      activeOnly: urlState.active ? true : undefined,
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

  const handleOpenAdjust = (acc: Account) => {
    setAdjustingAccount(acc)
    setAdjustOpen(true)
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

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: !!spaceId,
    baseCurrency: settings?.baseCurrency,
  })

  const getAccountBaseCents = useCallback(
    (acc: Account): number => {
      const rawCents = Number(acc.currentBalance || 0)
      const baseCurr = settings?.baseCurrency || "USD"
      if (!acc.currency || acc.currency === baseCurr) {
        return rawCents
      }
      if (acc.conversion?.balance) {
        return Number(acc.conversion.balance)
      }
      const preview = getConversionPreview(
        formatCents(rawCents).toString(),
        acc.currency
      )
      if (
        preview &&
        "amount" in preview &&
        typeof preview.amount === "number"
      ) {
        return Math.round(preview.amount * 100)
      }
      return rawCents
    },
    [settings?.baseCurrency, getConversionPreview]
  )

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
        }
      }
      groups[groupKey].accounts.push(acc)
    }

    return Object.values(groups).map((group) => {
      const groupCurrency = settings?.baseCurrency || "USD"

      let totalCents = 0
      group.accounts.forEach((acc) => {
        const baseCents = getAccountBaseCents(acc)
        if (acc.type === "CREDIT_CARD") {
          totalCents -= baseCents // Debt owed is a negative contribution
        } else {
          totalCents += baseCents
        }
      })

      return {
        ...group,
        totalCents,
        groupCurrency,
      }
    })
  }, [accounts, groupBy, instMap, settings?.baseCurrency, getAccountBaseCents])

  // Convert accounts to base currency and calculate metrics
  const metrics = useMemo(() => {
    let totalAssets = 0
    let totalLiabilities = 0
    let activeCount = 0
    let defaultAccount: Account | null = null

    accounts.forEach((acc) => {
      if (acc.isActive) {
        activeCount++
        const baseValue = formatCents(getAccountBaseCents(acc))

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
  }, [accounts, getAccountBaseCents])

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

        {/* Navigation Tabs */}
        <Tabs defaultValue="accounts" className="w-full space-y-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <TabsList className="h-11 rounded-2xl border border-border/40 bg-card/40 p-1 backdrop-blur-md">
              <TabsTrigger
                value="accounts"
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <Wallet className="h-4 w-4" />
                <span>Accounts ({accounts.length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="transfers"
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span>Transfers ({transfers.length})</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="accounts"
            className="space-y-6 focus-visible:outline-none"
          >
            {/* Filter Bar & Grouping Mode */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search accounts by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 rounded-xl border-border/50 bg-background/40 pl-9 placeholder:text-muted-foreground/60 focus-visible:ring-1"
                />
              </div>

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
                            ) : group.type === "CREDIT_CARD" ? (
                              <CreditCard className="h-5 w-5 text-rose-500" />
                            ) : group.type === "DIGITAL_ACCOUNT" ? (
                              <Coins className="h-5 w-5 text-amber-500" />
                            ) : group.type === "CASH" ? (
                              <Wallet className="h-5 w-5 text-emerald-500" />
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
                            {group.type === "CREDIT_CARD"
                              ? group.totalCents < 0
                                ? "Total Debt"
                                : "Net Credit"
                              : "Group Total"}
                          </span>
                          <span
                            className={cn(
                              "text-lg font-black",
                              group.type === "CREDIT_CARD" &&
                                group.totalCents < 0
                                ? "text-rose-500"
                                : group.type === "CREDIT_CARD" &&
                                    group.totalCents > 0
                                  ? "text-emerald-500"
                                  : "text-foreground"
                            )}
                          >
                            {formatAmount(
                              group.totalCents,
                              group.groupCurrency
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                            onReconcile={() =>
                              navigate(
                                resolveSpacePath(
                                  `/finance/reconcile?accountId=${acc.id}`,
                                  spaceId,
                                  true
                                )
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    onReconcile={() =>
                      navigate(
                        resolveSpacePath(
                          `/finance/reconcile?accountId=${acc.id}`,
                          spaceId,
                          true
                        )
                      )
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Transfers History */}
          <TabsContent
            value="transfers"
            className="space-y-6 focus-visible:outline-none"
          >
            {isWritable && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setTransferOpen(true)}
                  size="sm"
                  className="rounded-xl font-bold"
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  New Transfer
                </Button>
              </div>
            )}

            {transfers.length === 0 ? (
              <div className="rounded-3xl border border-border/40 bg-card/20 p-12 text-center text-sm text-muted-foreground">
                <ArrowRightLeft className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                No fund transfers recorded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                            -{formatAmount(t.sourceAmount, srcAcc?.currency)}
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
                            +
                            {formatAmount(
                              t.destinationAmount,
                              dstAcc?.currency
                            )}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Sheets / Forms / Modals */}
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

      <AdjustBalanceModal
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        account={adjustingAccount}
        refetchAccounts={refetchAccounts}
        refetchTransfers={refetchTransfers}
      />
    </FinancePageLayout>
  )
}
