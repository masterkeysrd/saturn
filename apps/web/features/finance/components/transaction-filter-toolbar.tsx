import { useState, type ReactNode } from "react"
import { useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import type {
  Transaction_Type,
  Account,
  Budget,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  Search,
  X,
  Tag,
  ArrowLeft,
  ChevronRight,
  Wallet,
  PiggyBank,
  ListFilter,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
type FacetDimension = "type" | "account" | "budget"

function FacetValueCommand({
  dimension,
  selectedType,
  selectedAccountId,
  selectedBudgetId,
  accounts,
  budgets,
  onSelectType,
  onSelectAccount,
  onSelectBudget,
}: {
  dimension: FacetDimension
  selectedType: string
  selectedAccountId: string
  selectedBudgetId: string
  accounts: { id?: string; name?: string; currency?: string }[]
  budgets: { id?: string; name?: string }[]
  onSelectType: (value: string) => void
  onSelectAccount: (value: string) => void
  onSelectBudget: (value: string) => void
}) {
  const { t, language } = useI18n()
  const placeholder =
    dimension === "type"
      ? t("finance.transactions.searchType")
      : dimension === "account"
        ? t("finance.transactions.searchAccount")
        : t("finance.transactions.searchBudget")

  const typeOptions: { value: Transaction_Type; label: string }[] = (
    [
      "EXPENSE",
      "INCOME",
      "TRANSFER_OUT",
      "TRANSFER_IN",
      "BALANCE_ADJUSTMENT",
    ] as Transaction_Type[]
  ).map((value) => ({
    value,
    label: getLocalizedEnumLabel("finance", "transactionType", value, language),
  }))

  return (
    <Command>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{t("finance.transactions.noMatches")}</CommandEmpty>
        <CommandGroup>
          {dimension === "type" &&
            typeOptions.map((opt) => {
              const checked = selectedType === opt.value
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  data-checked={checked}
                  onSelect={() =>
                    onSelectType(checked ? "TYPE_UNSPECIFIED" : opt.value)
                  }
                >
                  <span>{opt.label}</span>
                </CommandItem>
              )
            })}

          {dimension === "account" &&
            accounts.map((acc) => {
              const id = acc.id || ""
              const checked = selectedAccountId === id
              return (
                <CommandItem
                  key={id}
                  value={`${acc.name || ""} ${acc.currency || ""}`}
                  data-checked={checked}
                  onSelect={() => onSelectAccount(checked ? "_all" : id)}
                >
                  <span className="truncate">{acc.name}</span>
                  {acc.currency && (
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                      {acc.currency}
                    </span>
                  )}
                </CommandItem>
              )
            })}

          {dimension === "budget" &&
            budgets.map((b) => {
              const id = b.id || ""
              const checked = selectedBudgetId === id
              return (
                <CommandItem
                  key={id}
                  value={b.name || ""}
                  data-checked={checked}
                  onSelect={() => onSelectBudget(checked ? "_all" : id)}
                >
                  <span className="truncate">{b.name}</span>
                </CommandItem>
              )
            })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
export function TransactionFilterToolbar({
  filters,
  onChange,
  searchQuery,
  setSearchQuery,
  onClearSearch,
  accounts,
  budgets,
  children,
  facets = true,
  typeFacet = true,
  accountFacet = true,
  budgetFacet = true,
}: {
  filters: Record<"type" | "accountId" | "budgetId", string> &
    Partial<
      Record<"transferId" | "borrowingId" | "scheduledTransactionId", string>
    >
  onChange: (patch: Partial<typeof filters>) => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  onClearSearch?: () => void
  accounts: Account[]
  budgets: Budget[]
  children?: ReactNode
  facets?: boolean
  typeFacet?: boolean
  accountFacet?: boolean
  budgetFacet?: boolean
}) {
  const { t, language } = useI18n()
  const enabledFacets: FacetDimension[] = [
    ...(typeFacet ? (["type"] as const) : []),
    ...(accountFacet ? (["account"] as const) : []),
    ...(budgetFacet ? (["budget"] as const) : []),
  ]
  const getTypeLabel = (type: string): string => {
    if (type === "TYPE_UNSPECIFIED") {
      return t("finance.transactions.type.allTypes")
    }
    return getLocalizedEnumLabel("finance", "transactionType", type, language)
  }
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [filterStep, setFilterStep] = useState<FacetDimension | null>(null)
  const [editingChip, setEditingChip] = useState<FacetDimension | null>(null)
  const hasTypeFilter = Boolean(
    filters.type && filters.type !== "TYPE_UNSPECIFIED"
  )
  const hasAccountFilter = Boolean(
    filters.accountId && filters.accountId !== "_all"
  )
  const hasBudgetFilter = Boolean(
    filters.budgetId && filters.budgetId !== "_all"
  )
  const hasTransferFilter = Boolean(filters.transferId)
  const hasScheduledFilter = Boolean(filters.scheduledTransactionId)
  const hasBorrowingFilter = Boolean(filters.borrowingId)

  const activeAttributeFilterCount = [
    hasTypeFilter,
    hasAccountFilter,
    hasBudgetFilter,
    hasTransferFilter,
    hasScheduledFilter,
    hasBorrowingFilter,
  ].filter(Boolean).length
  const handleClearAttributeFilters = () => {
    onChange({
      type: "TYPE_UNSPECIFIED",
      budgetId: "_all",
      accountId: "_all",
      transferId: "",
      scheduledTransactionId: "",
      borrowingId: "",
    })
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64 md:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              aria-label={t("finance.transactions.searchAria")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("finance.transactions.searchPlaceholder")}
              className="h-9 rounded-lg border-border bg-control pr-8 pl-8.5 text-xs shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={t("finance.transactions.clearSearchAria")}
                onClick={() => {
                  setSearchQuery("")
                  onClearSearch?.()
                }}
                className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {facets && enabledFacets.length > 0 && (
            <Popover
              open={filterPopoverOpen}
              onOpenChange={(nextOpen) => {
                if (nextOpen) {
                  setFilterStep(
                    enabledFacets.length === 1 ? enabledFacets[0] : null
                  )
                }
                setFilterPopoverOpen(nextOpen)
              }}
            >
              <PopoverTrigger
                type="button"
                aria-label={t("finance.transactions.filterAria")}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 cursor-pointer gap-1.5 rounded-lg border-border bg-control px-3 text-xs font-medium shadow-2xs"
                )}
              >
                <ListFilter className="size-3.5" />
                <span>{t("finance.transactions.filter")}</span>
                {activeAttributeFilterCount > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 font-mono text-[10px] font-semibold text-primary tabular-nums">
                    {activeAttributeFilterCount}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 rounded-xl border border-border bg-popover p-0 shadow-xl"
              >
                {filterStep === null ? (
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {typeFacet && (
                          <CommandItem onSelect={() => setFilterStep("type")}>
                            <Tag className="size-3.5 text-muted-foreground" />
                            <span>{t("finance.transactions.facetType")}</span>
                            {hasTypeFilter && (
                              <span className="ml-auto truncate text-xs text-muted-foreground">
                                {getTypeLabel(filters.type)}
                              </span>
                            )}
                            <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                          </CommandItem>
                        )}
                        {accountFacet && (
                          <CommandItem
                            onSelect={() => setFilterStep("account")}
                          >
                            <Wallet className="size-3.5 text-muted-foreground" />
                            <span>
                              {t("finance.transactions.facetAccount")}
                            </span>
                            {hasAccountFilter && (
                              <span className="ml-auto max-w-[90px] truncate text-xs text-muted-foreground">
                                {accounts.find(
                                  (a) => a.id === filters.accountId
                                )?.name || filters.accountId}
                              </span>
                            )}
                            <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                          </CommandItem>
                        )}
                        {budgetFacet && (
                          <CommandItem onSelect={() => setFilterStep("budget")}>
                            <PiggyBank className="size-3.5 text-muted-foreground" />
                            <span>{t("finance.transactions.facetBudget")}</span>
                            {hasBudgetFilter && (
                              <span className="ml-auto max-w-[90px] truncate text-xs text-muted-foreground">
                                {budgets.find((b) => b.id === filters.budgetId)
                                  ?.name || filters.budgetId}
                              </span>
                            )}
                            <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
                      {enabledFacets.length > 1 && (
                        <button
                          type="button"
                          aria-label={t(
                            "finance.transactions.backToDimensions"
                          )}
                          onClick={() => setFilterStep(null)}
                          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ArrowLeft className="size-3.5" />
                        </button>
                      )}
                      <span className="text-xs font-semibold text-foreground capitalize">
                        {filterStep === "type"
                          ? t("finance.transactions.facetType")
                          : filterStep === "account"
                            ? t("finance.transactions.facetAccount")
                            : t("finance.transactions.facetBudget")}
                      </span>
                    </div>
                    <FacetValueCommand
                      dimension={filterStep}
                      selectedType={filters.type}
                      selectedAccountId={filters.accountId}
                      selectedBudgetId={filters.budgetId}
                      accounts={accounts}
                      budgets={budgets}
                      onSelectType={(val) => {
                        onChange({ type: val })
                        setFilterPopoverOpen(false)
                      }}
                      onSelectAccount={(val) => {
                        onChange({ accountId: val })
                        setFilterPopoverOpen(false)
                      }}
                      onSelectBudget={(val) => {
                        onChange({ budgetId: val })
                        setFilterPopoverOpen(false)
                      }}
                    />
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children} </div>
      </div>
      {activeAttributeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {hasTypeFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <Popover
                open={editingChip === "type"}
                onOpenChange={(o) => setEditingChip(o ? "type" : null)}
              >
                <PopoverTrigger
                  type="button"
                  className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    {t("finance.transactions.typeLabel")}
                  </span>
                  <span className="font-medium">
                    {getTypeLabel(filters.type)}
                  </span>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-56 rounded-xl border border-border bg-popover p-0 shadow-xl"
                >
                  <FacetValueCommand
                    dimension="type"
                    selectedType={filters.type}
                    selectedAccountId={filters.accountId}
                    selectedBudgetId={filters.budgetId}
                    accounts={accounts}
                    budgets={budgets}
                    onSelectType={(val) => {
                      onChange({ type: val })
                      setEditingChip(null)
                    }}
                    onSelectAccount={() => {}}
                    onSelectBudget={() => {}}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                aria-label={t("finance.transactions.removeTypeFilter")}
                onClick={() => onChange({ type: "TYPE_UNSPECIFIED" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {hasAccountFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <Popover
                open={editingChip === "account"}
                onOpenChange={(o) => setEditingChip(o ? "account" : null)}
              >
                <PopoverTrigger
                  type="button"
                  className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    {t("finance.transactions.accountLabel")}
                  </span>
                  <span className="font-medium">
                    {accounts.find((a) => a.id === filters.accountId)?.name ||
                      filters.accountId}
                  </span>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-60 rounded-xl border border-border bg-popover p-0 shadow-xl"
                >
                  <FacetValueCommand
                    dimension="account"
                    selectedType={filters.type}
                    selectedAccountId={filters.accountId}
                    selectedBudgetId={filters.budgetId}
                    accounts={accounts}
                    budgets={budgets}
                    onSelectType={() => {}}
                    onSelectAccount={(val) => {
                      onChange({ accountId: val })
                      setEditingChip(null)
                    }}
                    onSelectBudget={() => {}}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                aria-label={t("finance.transactions.removeAccountFilter")}
                onClick={() => onChange({ accountId: "_all" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {hasBudgetFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <Popover
                open={editingChip === "budget"}
                onOpenChange={(o) => setEditingChip(o ? "budget" : null)}
              >
                <PopoverTrigger
                  type="button"
                  className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    {t("finance.transactions.budgetLabel")}
                  </span>
                  <span className="font-medium">
                    {budgets.find((b) => b.id === filters.budgetId)?.name ||
                      filters.budgetId}
                  </span>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-60 rounded-xl border border-border bg-popover p-0 shadow-xl"
                >
                  <FacetValueCommand
                    dimension="budget"
                    selectedType={filters.type}
                    selectedAccountId={filters.accountId}
                    selectedBudgetId={filters.budgetId}
                    accounts={accounts}
                    budgets={budgets}
                    onSelectType={() => {}}
                    onSelectAccount={() => {}}
                    onSelectBudget={(val) => {
                      onChange({ budgetId: val })
                      setEditingChip(null)
                    }}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                aria-label={t("finance.transactions.removeBudgetFilter")}
                onClick={() => onChange({ budgetId: "_all" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {hasTransferFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <span className="flex h-full items-center gap-1 px-2 text-foreground">
                <span className="text-muted-foreground">
                  {t("finance.transactions.transferLabel")}
                </span>
                <span className="font-mono font-medium">
                  {filters.transferId}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("finance.transactions.removeTransferFilter")}
                onClick={() => onChange({ transferId: "" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {hasScheduledFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <span className="flex h-full items-center gap-1 px-2 text-foreground">
                <span className="text-muted-foreground">
                  {t("finance.transactions.scheduledLabel")}
                </span>
                <span className="font-mono font-medium">
                  {filters.scheduledTransactionId}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("finance.transactions.removeScheduledFilter")}
                onClick={() => onChange({ scheduledTransactionId: "" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {hasBorrowingFilter && (
            <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
              <span className="flex h-full items-center gap-1 px-2 text-foreground">
                <span className="text-muted-foreground">
                  {t("finance.transactions.borrowingLabel")}
                </span>
                <span className="font-mono font-medium">
                  {filters.borrowingId}
                </span>
              </span>
              <button
                type="button"
                aria-label={t("finance.transactions.removeBorrowingFilter")}
                onClick={() => onChange({ borrowingId: "" })}
                className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleClearAttributeFilters}
            className="h-7 cursor-pointer px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("finance.transactions.reset")}
          </Button>
        </div>
      )}
    </div>
  )
}
