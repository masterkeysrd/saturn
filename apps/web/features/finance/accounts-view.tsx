import { useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useSpacePermissions,
  resolveSpacePath,
} from "@/features/space/use-space"
import {
  useDebounce,
  useTimezone,
  useI18n,
  invalidateFinanceQueries,
} from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { toast } from "@/components/ui/toast"
import {
  type Account,
  type Account_Type,
  useListAccountsQuery,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useListTransfersQuery,
  useGetSettingsQuery,
  useListInstitutionsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

const ACCOUNT_SORT_LABEL_KEYS = {
  _default: "finance.accounts.sortDefault",
  name_asc: "finance.accounts.sortNameAsc",
  name_desc: "finance.accounts.sortNameDesc",
  balance_desc: "finance.accounts.sortBalanceDesc",
  balance_asc: "finance.accounts.sortBalanceAsc",
  created_desc: "finance.accounts.sortNewest",
  created_asc: "finance.accounts.sortOldest",
} as const

export function AccountsView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const [urlState, setUrlState] = useUrlState(ACCOUNTS_FILTER_DEFAULTS)
  const [searchQuery, setSearchQuery] = useState(urlState.q || "")

  const debouncedSearch = useDebounce(searchQuery, 300)

  const { data: settingsData } = useGetSettingsQuery({}, { enabled: !!spaceId })
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
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)

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

  useRegisterCopilotView({
    viewId: "finance.accounts",
    title: t("finance.accounts.copilotTitle"),
    suggestions: [
      t("finance.accounts.suggestion.liquidVsDebt"),
      t("finance.accounts.suggestion.creditUtilization"),
      t("finance.accounts.suggestion.recentTransfers"),
    ],
  })

  const handleSetDefault = (acc: Account) => {
    if (!acc.id) return
    updateAccountMutation.mutate(
      {
        id: acc.id,
        req: {
          id: acc.id,
          version: acc.version,
          updateMask: { paths: ["is_default"] },
          account: {
            ...acc,
            isDefault: true,
          },
        },
      },
      {
        onSuccess: async () => {
          await invalidateFinanceQueries(queryClient)
          refetchAccounts()
        },
        onError: (err) => {
          toast.add({
            title: t("finance.accounts.setDefaultFailedTitle"),
            description: err.message,
            type: "error",
          })
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
          groupTitle = inst.name || t("finance.accounts.unknownInstitution")
          domain = inst.domain
          color = inst.color || "indigo"
        } else {
          groupKey = "unassigned"
          groupTitle = t("finance.accounts.uncategorized")
          domain = ""
          color = "sky"
        }
      } else if (groupBy === "TYPE") {
        groupKey = acc.type
        groupTitle = getLocalizedEnumLabel(
          "finance",
          "accountType",
          acc.type,
          language
        )
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
  }, [
    accounts,
    groupBy,
    instMap,
    settings?.baseCurrency,
    getAccountBaseCents,
    t,
    language,
  ])

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

  const handleDeleteAccount = (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return

    if (acc.isDefault) {
      toast.add({
        type: "warning",
        title: t("finance.accounts.cannotDeleteDefaultTitle"),
        description: t("finance.accounts.cannotDeleteDefaultDescription"),
      })
      return
    }

    setDeleteTarget(acc)
  }

  const handleConfirmDeleteAccount = async () => {
    if (!deleteTarget?.id) return
    try {
      await deleteAccountMutation.mutateAsync({
        id: deleteTarget.id,
        req: { id: deleteTarget.id },
      })
      toast.add({
        type: "success",
        title: t("finance.accounts.deleteSuccessTitle"),
        description: t("finance.accounts.deleteSuccessDescription", {
          name: deleteTarget.name || "",
        }),
      })
      setDeleteTarget(null)
      await invalidateFinanceQueries(queryClient)
      refetchAccounts()
    } catch (e: unknown) {
      toast.add({
        type: "error",
        title: t("finance.accounts.deleteFailedTitle"),
        description:
          e instanceof Error
            ? e.message
            : t("finance.accounts.deleteFailedDescription"),
      })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-start">
      <div className="@container min-w-0 flex-1">
        <FinancePageLayout
          title={t("finance.accounts.title")}
          description={t("finance.accounts.description")}
          actions={
            isWritable && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setTransferOpen(true)}
                  variant="outline"
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/50 px-4 font-semibold text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted"
                >
                  <ArrowRightLeft className="h-4.5 w-4.5" />
                  {t("finance.accounts.transferFunds")}
                </Button>
                <Button
                  onClick={() => {
                    setEditingAccount(null)
                    setCreateOpen(true)
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-5 w-5" />
                  {t("finance.accounts.addAccount")}
                </Button>
              </div>
            )
          }
        >
          <div className="mt-2 animate-in space-y-8 duration-300 fade-in">
            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-4">
              <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {t("finance.accounts.netLiquidity")}
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
                    {t("finance.accounts.cashBankAssets")}
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
                    {t("finance.accounts.creditLiabilities")}
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
                    {t("finance.accounts.defaultAccount")}
                  </span>
                </div>
                <div className="mt-4">
                  <span className="block truncate text-lg font-black tracking-tight text-foreground">
                    {metrics.defaultAccount
                      ? (metrics.defaultAccount as Account).name
                      : t("finance.accounts.noneSet")}
                  </span>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase">
                    {t("finance.accounts.usedForPrefills")}
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
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                  >
                    <Wallet className="h-4 w-4" />
                    <span>
                      {t("finance.accounts.tabAccountsWithCount", {
                        count: accounts.length,
                      })}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="transfers"
                    className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>
                      {t("finance.accounts.tabTransfersWithCount", {
                        count: transfers.length,
                      })}
                    </span>
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
                      placeholder={t("finance.accounts.searchPlaceholder")}
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
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t("finance.accounts.groupByBank")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupBy("TYPE")}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                        groupBy === "TYPE"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t("finance.accounts.groupByType")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupBy("FLAT")}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                        groupBy === "FLAT"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t("finance.accounts.groupFlat")}
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
                        {t("finance.accounts.activeOnly")}
                      </Label>
                    </div>

                    <Select
                      value={urlState.sort}
                      onValueChange={(val) =>
                        setUrlState({ sort: val || "_default" })
                      }
                    >
                      <SelectTrigger className="h-10 w-[160px] rounded-xl border-border/50 bg-background/40 text-xs font-semibold">
                        <SelectValue placeholder={t("finance.accounts.sortBy")}>
                          {t(
                            ACCOUNT_SORT_LABEL_KEYS[
                              urlState.sort as keyof typeof ACCOUNT_SORT_LABEL_KEYS
                            ] ?? "finance.accounts.sortDefault"
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {Object.entries(ACCOUNT_SORT_LABEL_KEYS).map(
                          ([value, key]) => (
                            <SelectItem key={value} value={value}>
                              {t(key)}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {accounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-16 text-center">
                    <Landmark className="mb-3 h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-muted-foreground">
                      {urlState.q || urlState.active
                        ? t("finance.accounts.noMatches")
                        : t("finance.accounts.emptyState")}
                    </p>
                    {!urlState.q && !urlState.active && (
                      <Button
                        onClick={() => setCreateOpen(true)}
                        className="mt-4 flex items-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground"
                      >
                        {t("finance.accounts.createFirstAccount")}
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
                                  {group.accounts.length === 1
                                    ? t("finance.accounts.accountCount", {
                                        count: group.accounts.length,
                                      })
                                    : t("finance.accounts.accountsCount", {
                                        count: group.accounts.length,
                                      })}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                {group.type === "CREDIT_CARD"
                                  ? group.totalCents < 0
                                    ? t("finance.accounts.totalDebt")
                                    : t("finance.accounts.netCredit")
                                  : t("finance.accounts.groupTotal")}
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

                          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
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
                                onDelete={() =>
                                  handleDeleteAccount(acc.id || "")
                                }
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
                  <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
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
                      {t("finance.accounts.newTransfer")}
                    </Button>
                  </div>
                )}

                {transfers.length === 0 ? (
                  <div className="rounded-3xl border border-border/40 bg-card/20 p-12 text-center text-sm text-muted-foreground">
                    <ArrowRightLeft className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    {t("finance.accounts.noTransfers")}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
                    {transfers.map((transfer) => {
                      const srcAcc = accounts.find(
                        (a) => a.id === transfer.sourceAccountId
                      )
                      const dstAcc = accounts.find(
                        (a) => a.id === transfer.destinationAccountId
                      )

                      return (
                        <div
                          key={transfer.id}
                          className="relative rounded-3xl border border-border/30 bg-card/25 p-5 shadow-sm backdrop-blur-sm transition-colors hover:border-border/50"
                        >
                          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{tz.format(transfer.transferDate)}</span>
                            <span className="font-semibold text-primary">
                              {t("finance.accounts.transferRecord")}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                                  {t("finance.accounts.from")}
                                </span>
                                <span className="truncate text-xs font-bold text-foreground">
                                  {srcAcc?.name ||
                                    t("finance.accounts.deleted")}
                                </span>
                              </div>
                              <span className="mt-1 block text-sm font-black text-rose-500">
                                -
                                {formatAmount(
                                  transfer.sourceAmount,
                                  srcAcc?.currency
                                )}
                              </span>
                            </div>

                            <ChevronRight className="h-4.5 w-4.5 shrink-0 text-muted-foreground/45" />

                            <div className="min-w-0 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                                  {t("finance.accounts.to")}
                                </span>
                                <span className="truncate text-xs font-bold text-foreground">
                                  {dstAcc?.name ||
                                    t("finance.accounts.deleted")}
                                </span>
                              </div>
                              <span className="mt-1 block text-sm font-black text-emerald-500">
                                +
                                {formatAmount(
                                  transfer.destinationAmount,
                                  dstAcc?.currency
                                )}
                              </span>
                            </div>
                          </div>

                          {transfer.notes && (
                            <p className="mt-3 truncate border-t border-border/20 pt-2.5 text-[10px] text-muted-foreground italic">
                              {t("finance.accounts.noteLabel", {
                                note: transfer.notes,
                              })}
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

          <AdjustBalanceModal
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            account={adjustingAccount}
            refetchAccounts={refetchAccounts}
            refetchTransfers={refetchTransfers}
          />

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("finance.accounts.deleteTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("finance.accounts.deleteDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteAccountMutation.isPending}
                  onClick={handleConfirmDeleteAccount}
                >
                  {deleteAccountMutation.isPending
                    ? t("finance.accounts.deleting")
                    : t("finance.accounts.deleteConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </FinancePageLayout>
      </div>

      <AccountHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        account={historyAccount}
      />
    </div>
  )
}
