import { useState, useMemo } from "react"
import {
  type Account,
  type AccountType,
  useListAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useCreateTransferMutation,
  useListTransfersQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Plus,
  ArrowRightLeft,
  Trash2,
  Edit2,
  MoreVertical,
  Check,
  AlertTriangle,
  Info,
  ChevronRight,
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

export const ACCOUNT_COLORS = [
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

export function getAccountColors(colorName: string) {
  return ACCOUNT_COLORS.find((c) => c.value === colorName) || ACCOUNT_COLORS[0]
}

export function getAccountTypeIcon(type: AccountType) {
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

export function getAccountTypeLabel(type: AccountType) {
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
  const { spaceId, isWritable, settings, rates } = useWorkspaceFinance()

  const { data: accountsData, refetch: refetchAccounts } = useListAccountsQuery(
    {},
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

  const accounts = accountsData?.accounts || []
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
        const balanceFloat = formatCents(acc.currentBalance)

        // Convert balance to base currency using rates
        let baseValue = balanceFloat
        if (settings?.baseCurrency && acc.currency !== settings.baseCurrency) {
          // Find direct exchange rate (acc.currency -> baseCurrency)
          const latestRate = rates
            .filter(
              (r) =>
                r.fromCurrency === acc.currency &&
                r.toCurrency === settings.baseCurrency
            )
            .sort(
              (a, b) =>
                new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
            )[0]

          if (latestRate) {
            baseValue = balanceFloat * latestRate.rate
          }
        }

        if (acc.type === "CREDIT_CARD") {
          totalLiabilities += baseValue
        } else {
          totalAssets += baseValue
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
  }, [accounts, settings, rates])

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
    } catch (e: any) {
      alert(e?.message || "Failed to delete account.")
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

            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-16 text-center">
                <Landmark className="mb-3 h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm font-semibold text-muted-foreground">
                  No bank or cash accounts setup yet.
                </p>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-primary text-xs font-bold text-white"
                >
                  Create Your First Account
                </Button>
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
                          {isWritable && (
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
                                    setEditingAccount(acc)
                                    setCreateOpen(true)
                                  }}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Edit Account
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteAccount(acc.id)}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete Account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex items-baseline justify-between">
                        <div>
                          <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Balance
                          </span>
                          <span
                            className={cn(
                              "text-2xl font-black tracking-tight",
                              isCredit && Number(acc.currentBalance || "0") < 0
                                ? "text-rose-500 dark:text-rose-400"
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
                          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                            <span>
                              Limit:{" "}
                              {formatCents(acc.creditLimit).toLocaleString()}{" "}
                              {acc.currency}
                            </span>
                            <span>
                              Available:{" "}
                              {(() => {
                                const limit = Number(acc.creditLimit || "0")
                                const current = Number(
                                  acc.currentBalance || "0"
                                )
                                const balanceOwed = Math.abs(current)
                                return formatCents(
                                  limit - balanceOwed
                                ).toLocaleString()
                              })()}{" "}
                              {acc.currency}
                            </span>
                          </div>
                          {(() => {
                            const limit = Number(acc.creditLimit || "0")
                            const current = Number(acc.currentBalance || "0")
                            const balanceOwed = Math.abs(current)
                            const utilizationPercent =
                              limit > 0
                                ? Math.min(
                                    100,
                                    Math.max(0, (balanceOwed / limit) * 100)
                                  )
                                : 0

                            let barColor = "bg-emerald-500"
                            if (utilizationPercent > 85) {
                              barColor = "bg-rose-500"
                            } else if (utilizationPercent > 50) {
                              barColor = "bg-amber-500"
                            }

                            return (
                              <div className="space-y-1">
                                <div className="h-2 w-full overflow-hidden rounded-full border border-border/20 bg-muted">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-500",
                                      barColor
                                    )}
                                    style={{ width: `${utilizationPercent}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] font-black text-muted-foreground/70 uppercase">
                                  <span>
                                    {utilizationPercent.toFixed(0)}% Utilization
                                  </span>
                                </div>
                              </div>
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
        rates={rates}
        refetchAccounts={refetchAccounts}
        refetchTransfers={refetchTransfers}
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

function CreateAccountSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editAccount,
  refetchAccounts,
}: CreateAccountSheetProps) {
  const { currencies } = useWorkspaceFinance()
  const fallbackCurrencies = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
    { code: "JPY" },
    { code: "DOP" },
  ]
  const currencyList =
    currencies && currencies.length > 0 ? currencies : fallbackCurrencies

  const [name, setName] = useState("")
  const [type, setType] = useState<AccountType>("BANK")
  const [currency, setCurrency] = useState("")
  const [initialBalance, setInitialBalance] = useState("")
  const [creditLimit, setCreditLimit] = useState("")
  const [lastFour, setLastFour] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [color, setColor] = useState("indigo")
  const [notes, setNotes] = useState("")

  const createMutation = useCreateAccountMutation()
  const updateMutation = useUpdateAccountMutation()

  // Reset or fill values when open state changes
  useMemo(() => {
    if (open) {
      if (editAccount) {
        setName(editAccount.name)
        setType(editAccount.type)
        setCurrency(editAccount.currency)
        setInitialBalance(formatCents(editAccount.initialBalance).toString())
        setCreditLimit(
          editAccount.creditLimit
            ? formatCents(editAccount.creditLimit).toString()
            : ""
        )
        setLastFour(editAccount.lastFour || "")
        setIsDefault(editAccount.isDefault)
        setIsActive(editAccount.isActive)
        setColor(editAccount.color)
        setNotes(editAccount.notes)
      } else {
        setName("")
        setType("BANK")
        setCurrency(baseCurrency || "USD")
        setInitialBalance("0")
        setCreditLimit("")
        setLastFour("")
        setIsDefault(false)
        setIsActive(true)
        setColor("indigo")
        setNotes("")
      }
    }
  }, [open, editAccount, baseCurrency])

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const centsStr = toCentsString(initialBalance || "0")
    const limitStr =
      type === "CREDIT_CARD" && creditLimit ? toCentsString(creditLimit) : "0"

    try {
      if (editAccount) {
        await updateMutation.mutateAsync({
          id: editAccount.id,
          req: {
            id: editAccount.id,
            account: {
              ...editAccount,
              name,
              creditLimit: limitStr,
              isDefault,
              isActive,
              color,
              notes,
              lastFour: lastFour || "",
            },
          },
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            id: "",
            spaceId,
            name,
            type,
            currency,
            initialBalance: centsStr,
            currentBalance: "0",
            creditLimit: limitStr,
            isDefault,
            isActive: true,
            color,
            notes,
            lastFour: lastFour || "",
            createTime: "",
            updateTime: "",
          },
        })
      }
      onOpenChange(false)
      refetchAccounts()
    } catch (err: any) {
      alert(err?.message || "Operation failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editAccount ? "Edit Account" : "Add Workspace Account"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Configure ledger entities for liquidity balance adjustments.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
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
              value={lastFour}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 4)
                setLastFour(val)
              }}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Account Type
            </Label>
            <Select
              value={type}
              onValueChange={(val) => setType(val as AccountType)}
              disabled={!!editAccount}
            >
              <SelectTrigger className="!h-11 w-full rounded-xl text-left">
                <SelectValue placeholder="Select type">
                  {type && getAccountTypeLabel(type)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="BANK">Bank / Checking</SelectItem>
                <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                <SelectItem value="CASH">Cash Holdings</SelectItem>
                <SelectItem value="DIGITAL_ACCOUNT">Digital Account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Currency
            </Label>
            <Select
              value={currency}
              onValueChange={(val) => setCurrency(val || "")}
              disabled={!!editAccount}
            >
              <SelectTrigger className="!h-11 w-full rounded-xl text-left">
                <SelectValue placeholder="Select currency">
                  {currency}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {currencyList.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="acc-balance"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Initial Balance
            </Label>
            <Input
              id="acc-balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="h-11 rounded-xl"
              disabled={!!editAccount}
              required
            />
          </div>

          {type === "CREDIT_CARD" && (
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
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
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
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "h-8 w-8 rounded-full border transition-all hover:scale-110",
                    getAccountColors(c.value).bg,
                    getAccountColors(c.value).border,
                    color === c.value &&
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
                checked={isDefault}
                onCheckedChange={setIsDefault}
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
                  checked={isActive}
                  onCheckedChange={setIsActive}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
  rates: any[]
  refetchAccounts: () => void
  refetchTransfers: () => void
}

function CreateTransferSheet({
  open,
  onOpenChange,
  accounts,
  rates,
  refetchAccounts,
  refetchTransfers,
}: CreateTransferSheetProps) {
  const activeAccounts = accounts.filter((a) => a.isActive)

  const [srcId, setSrcId] = useState("")
  const [dstId, setDstId] = useState("")
  const [srcAmount, setSrcAmount] = useState("")
  const [dstAmount, setDstAmount] = useState("")
  const [transferDate, setTransferDate] = useState<Date>(new Date())
  const [notes, setNotes] = useState("")

  const createMutation = useCreateTransferMutation()

  const srcAcc = activeAccounts.find((a) => a.id === srcId)
  const dstAcc = activeAccounts.find((a) => a.id === dstId)

  // Autocalculate target amount if currencies match, or apply exchange rate
  useMemo(() => {
    if (!srcAcc || !dstAcc || !srcAmount) return

    const srcVal = parseFloat(srcAmount)
    if (isNaN(srcVal) || srcVal <= 0) return

    if (srcAcc.currency === dstAcc.currency) {
      setDstAmount(srcAmount)
    } else {
      // Find exchange rate: src -> dst
      const rate = rates
        .filter(
          (r) =>
            r.fromCurrency === srcAcc.currency &&
            r.toCurrency === dstAcc.currency
        )
        .sort(
          (a, b) =>
            new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
        )[0]

      if (rate) {
        setDstAmount((srcVal * rate.rate).toFixed(2))
      }
    }
  }, [srcAmount, srcId, dstId, rates])

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!srcId || !dstId || !srcAmount || !dstAmount) return

    if (srcId === dstId) {
      alert("Source and destination accounts must be different.")
      return
    }

    try {
      await createMutation.mutateAsync({
        sourceAccountId: srcId,
        destinationAccountId: dstId,
        sourceAmount: toCentsString(srcAmount),
        destinationAmount: toCentsString(dstAmount),
        transferDate: transferDate.toISOString(),
        notes,
      })
      onOpenChange(false)
      setSrcId("")
      setDstId("")
      setSrcAmount("")
      setDstAmount("")
      setNotes("")
      refetchAccounts()
      refetchTransfers()
    } catch (err: any) {
      alert(err?.message || "Transfer failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Perform Fund Transfer
          </SheetTitle>
          <SheetDescription className="text-xs">
            Double-entry ledger entry: deducts from source and credits target.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleTransfer} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Account (Withdraw From)
            </Label>
            <Select value={srcId} onValueChange={(val) => setSrcId(val || "")}>
              <SelectTrigger className="!h-11 w-full rounded-xl text-left">
                <SelectValue placeholder="Choose source account">
                  {srcId &&
                    (() => {
                      const a = activeAccounts.find((acc) => acc.id === srcId)
                      return a
                        ? `${a.name} (${formatCents(a.currentBalance)} ${a.currency})`
                        : ""
                    })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {activeAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({formatCents(a.currentBalance)} {a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Destination Account (Deposit To)
            </Label>
            <Select value={dstId} onValueChange={(val) => setDstId(val || "")}>
              <SelectTrigger className="!h-11 w-full rounded-xl text-left">
                <SelectValue placeholder="Choose target account">
                  {dstId &&
                    (() => {
                      const a = activeAccounts.find((acc) => acc.id === dstId)
                      return a
                        ? `${a.name} (${formatCents(a.currentBalance)} ${a.currency})`
                        : ""
                    })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {activeAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({formatCents(a.currentBalance)} {a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Amount ({srcAcc?.currency || ""})
            </Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={srcAmount}
              onChange={(e) => setSrcAmount(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Target Amount ({dstAcc?.currency || ""})
            </Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={dstAmount}
              onChange={(e) => setDstAmount(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
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
            <DatePicker
              date={transferDate}
              setDate={(d) => d && setTransferDate(d)}
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
              placeholder="e.g. Monthly savings sweep, budget buffer"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all"
            >
              Confirm Transfer
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
