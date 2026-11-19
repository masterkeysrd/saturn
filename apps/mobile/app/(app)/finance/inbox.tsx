import React, { useMemo, useRef, useState } from "react"
import {
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Search, X } from "lucide-react-native"
import {
  useApproveInboxItemMutation,
  useDiscardInboxItemMutation,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListBorrowingsQuery,
  useListBudgetsQuery,
  useListCurrenciesQuery,
  useListInboxItemsQuery,
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  useUpdateInboxItemMutation,
  type Account,
  type Budget,
  type InboxItem,
  type InboxItem_DocType,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  invalidateFinanceQueries,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { canWriteWorkspace } from "@/lib/quick-capture"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  buildUpdateInboxItemRequest,
  canQuickApproveInboxItem,
  type InboxItemDraftPatch,
} from "@/lib/inbox-triage"
import { BaseTextInput } from "@/components/ui/text-input"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import {
  AccountPickerSheet,
  BorrowingPickerSheet,
  BudgetPickerSheet,
  CurrencyPickerSheet,
  ScheduledPickerSheet,
} from "@/components/finance/sheets"
import { SwipeableInboxCard } from "@/components/finance/swipeable-inbox-card"
import {
  createInitialInboxReviewDraft,
  InboxReviewSheet,
  type InboxReviewDraft,
} from "@/components/finance/inbox-review-sheet"

type DocTypeFilter = "" | "RECEIPT" | "INVOICE" | "BANK_NOTIFICATION"

const DOC_TYPE_FILTERS: readonly { value: DocTypeFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "RECEIPT", label: "Receipts" },
  { value: "INVOICE", label: "Invoices" },
  { value: "BANK_NOTIFICATION", label: "Bank Alerts" },
]

export default function FinanceInboxScreen() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { activeSpaceId, activeSpaceRole } = useSpace()
  const isWritable = canWriteWorkspace(activeSpaceRole)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search.trim(), 250)
  const [selectedDocType, setSelectedDocType] = useState<DocTypeFilter>("")
  const [refreshing, setRefreshing] = useState(false)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)

  // Review Sheet state
  const [reviewItem, setReviewItem] = useState<InboxItem | null>(null)
  const [reviewDraft, setReviewDraft] = useState<InboxReviewDraft | null>(null)
  const [reviewHint, setReviewHint] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  // Discard Confirm state
  const [discardTarget, setDiscardTarget] = useState<InboxItem | null>(null)

  // Shared Picker Sheet refs & target state
  const budgetSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const currencySheetRef = useRef<BottomSheet>(null)
  const scheduledSheetRef = useRef<BottomSheet>(null)
  const borrowingSheetRef = useRef<BottomSheet>(null)

  const [cardBudgetTarget, setCardBudgetTarget] = useState<InboxItem | null>(
    null
  )
  const [cardAccountTarget, setCardAccountTarget] = useState<InboxItem | null>(
    null
  )
  const [accountPickerMode, setAccountPickerMode] = useState<
    "card" | "review-source" | "review-dest"
  >("card")

  // Queries
  const {
    data: inboxData,
    isLoading: inboxLoading,
    refetch: refetchInbox,
  } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 50,
      pageToken: "",
      sort: "",
      view: "FULL",
      searchQuery: debouncedSearch || undefined,
      docType: (selectedDocType || undefined) as InboxItem_DocType | undefined,
    },
    { enabled: Boolean(activeSpaceId) }
  )

  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: Boolean(activeSpaceId) }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: accountsData, isLoading: accountsLoading } =
    useListAccountsQuery(
      { activeOnly: true },
      { enabled: Boolean(activeSpaceId) }
    )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )
  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    for (const acc of accounts) {
      if (acc.id) map.set(acc.id, acc)
    }
    return map
  }, [accounts])

  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL", statuses: ["ACTIVE"] },
    { enabled: Boolean(activeSpaceId) }
  )
  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )
  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    for (const b of budgets) {
      if (b.id) map.set(b.id, b)
    }
    return map
  }, [budgets])

  const { data: scheduledData, isLoading: scheduledLoading } =
    useListScheduledTransactionsQuery(
      {
        status: "PENDING",
        pageSize: 100,
        pageToken: "",
        startDate: "",
        endDate: "",
        view: "FULL",
      },
      { enabled: Boolean(activeSpaceId) }
    )
  const scheduledTransactions = useMemo(
    () => scheduledData?.scheduledTransactions || [],
    [scheduledData?.scheduledTransactions]
  )

  const { data: recurringData } = useListRecurringTransactionsQuery(
    { pageSize: 100, pageToken: "", status: "STATUS_UNSPECIFIED" },
    { enabled: Boolean(activeSpaceId) }
  )
  const recurringTemplates = useMemo(
    () => recurringData?.recurringTransactions || [],
    [recurringData?.recurringTransactions]
  )

  const { data: borrowingsData, isLoading: borrowingsLoading } =
    useListBorrowingsQuery(
      { status: "ACTIVE", pageSize: 100, pageToken: "" },
      { enabled: Boolean(activeSpaceId) }
    )
  const borrowings = useMemo(
    () => borrowingsData?.borrowings || [],
    [borrowingsData?.borrowings]
  )

  const { data: currenciesData, isLoading: currenciesLoading } =
    useListCurrenciesQuery({}, { enabled: Boolean(activeSpaceId) })
  const currencies = useMemo(
    () => currenciesData?.currencies || [],
    [currenciesData?.currencies]
  )

  // Mutations
  const updateInboxMutation = useUpdateInboxItemMutation()
  const approveInboxMutation = useApproveInboxItemMutation()
  const discardInboxMutation = useDiscardInboxItemMutation()

  const inboxItems = useMemo(
    () => inboxData?.inboxItems || [],
    [inboxData?.inboxItems]
  )

  const openReviewSheet = (item: InboxItem, hint: string | null = null) => {
    setReviewItem(item)
    setReviewDraft(createInitialInboxReviewDraft(item, baseCurrency))
    setReviewHint(hint)
    setReviewError(null)
  }

  const closeReviewSheet = () => {
    setReviewItem(null)
    setReviewDraft(null)
    setReviewHint(null)
    setReviewError(null)
  }

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetchInbox()
    } finally {
      setRefreshing(false)
    }
  }

  const handleQuickAssignBudget = async (item: InboxItem, budget: Budget) => {
    if (!item.id || !budget.id || !isWritable) return
    setBusyItemId(item.id)
    try {
      const payload = buildUpdateInboxItemRequest(item, {
        budgetId: budget.id,
      })
      await updateInboxMutation.mutateAsync(payload)
      await invalidateFinanceQueries(queryClient)
      await refetchInbox()
      haptics.success()
      toast.show({
        title: "Budget assigned",
        message: `${item.vendorName || "Item"} linked to ${budget.name}.`,
        type: "success",
      })
    } catch (err) {
      haptics.error()
      toast.show({
        title: "Could not assign budget",
        message: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setBusyItemId(null)
      setCardBudgetTarget(null)
    }
  }

  const handleQuickAssignAccount = async (
    item: InboxItem,
    accountId: string
  ) => {
    if (!item.id || !isWritable) return
    setBusyItemId(item.id)
    try {
      const payload = buildUpdateInboxItemRequest(item, {
        accountId,
      })
      await updateInboxMutation.mutateAsync(payload)
      await invalidateFinanceQueries(queryClient)
      await refetchInbox()
      haptics.success()
      const accName = accountId
        ? accountsMap.get(accountId)?.name || "Account"
        : "Cash / Off-ledger"
      toast.show({
        title: "Account updated",
        message: `${item.vendorName || "Item"} set to ${accName}.`,
        type: "success",
      })
    } catch (err) {
      haptics.error()
      toast.show({
        title: "Could not assign account",
        message: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setBusyItemId(null)
      setCardAccountTarget(null)
    }
  }

  const handleQuickApprove = async (item: InboxItem) => {
    if (!isWritable || !item.id) return

    if (!canQuickApproveInboxItem(item)) {
      haptics.selection()
      openReviewSheet(
        item,
        "Assign a budget category (or link a bill) and confirm details to approve."
      )
      return
    }

    setBusyItemId(item.id)
    try {
      await approveInboxMutation.mutateAsync({
        id: item.id,
        req: { id: item.id },
      })
      await invalidateFinanceQueries(queryClient)
      await refetchInbox()
      haptics.success()
      toast.show({
        title: "Approved into ledger",
        message: item.vendorName || undefined,
        type: "success",
      })
    } catch (err) {
      haptics.selection()
      const msg =
        err instanceof Error ? err.message : "Review details before approving."
      openReviewSheet(item, null)
      setReviewError(msg)
    } finally {
      setBusyItemId(null)
    }
  }

  const handleApproveAndRecord = async (
    item: InboxItem,
    patch: InboxItemDraftPatch
  ) => {
    if (!item.id || !isWritable) return
    setReviewError(null)
    setBusyItemId(item.id)
    try {
      const updateReq = buildUpdateInboxItemRequest(item, patch)
      await updateInboxMutation.mutateAsync(updateReq)
      await approveInboxMutation.mutateAsync({
        id: item.id,
        req: { id: item.id },
      })
      await invalidateFinanceQueries(queryClient)
      await refetchInbox()
      haptics.success()
      closeReviewSheet()
      toast.show({
        title: "Approved into ledger",
        message: patch.vendorName || item.vendorName || undefined,
        type: "success",
      })
    } catch (err) {
      haptics.error()
      setReviewError(
        err instanceof Error
          ? err.message
          : "Failed to approve item into the ledger."
      )
    } finally {
      setBusyItemId(null)
    }
  }

  const handleConfirmDiscard = async () => {
    const target = discardTarget
    if (!target?.id || !isWritable) return
    setBusyItemId(target.id)
    try {
      await discardInboxMutation.mutateAsync({
        id: target.id,
        req: { id: target.id },
      })
      await invalidateFinanceQueries(queryClient)
      await refetchInbox()
      if (reviewItem?.id === target.id) {
        closeReviewSheet()
      }
      setDiscardTarget(null)
      haptics.success()
      toast.show({
        title: "Item discarded",
        message: target.vendorName || undefined,
        type: "info",
      })
    } catch (err) {
      haptics.error()
      toast.show({
        title: "Failed to discard",
        message: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setBusyItemId(null)
    }
  }

  const hasActiveFilter = Boolean(debouncedSearch || selectedDocType)
  const isInitialLoading = inboxLoading && !inboxData

  return (
    <View style={styles.safeArea}>
      {/* Search + Document Type Filters */}
      <View style={styles.filterHeader}>
        <BaseTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search vendor or item..."
          autoCorrect={false}
          leftIcon={<Search size={16} color={colors.textMuted} />}
          rightIcon={
            search.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  haptics.light()
                  setSearch("")
                }}
                accessibilityLabel="Clear search"
              >
                <X size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : undefined
          }
          inputContainerStyle={styles.searchInputWrap}
          testID="inbox-search-input"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsRow}
        >
          {DOC_TYPE_FILTERS.map((opt) => {
            const active = selectedDocType === opt.value
            return (
              <TouchableOpacity
                key={opt.value || "ALL"}
                activeOpacity={0.75}
                onPress={() => {
                  haptics.selection()
                  setSelectedDocType(opt.value)
                }}
                style={[styles.filterPill, active && styles.filterPillActive]}
                testID={`inbox-filter-${opt.value || "ALL"}`}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && styles.filterPillTextActive,
                  ]}
                >
                  {opt.value === "" ? t("common.all") : opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {isInitialLoading ? (
        <View style={styles.loadingList}>
          <SkeletonCard height={140} />
          <SkeletonCard height={140} />
          <SkeletonCard height={140} />
        </View>
      ) : (
        <FlatList
          data={inboxItems}
          keyExtractor={(item, idx) => item.id || `inbox-${idx}`}
          contentContainerStyle={[
            styles.listContent,
            inboxItems.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          ListHeaderComponent={
            inboxItems.length > 0 ? (
              <View style={styles.queueSummaryRow}>
                <Text style={styles.queueSummaryText}>
                  {inboxItems.length}{" "}
                  {inboxItems.length === 1 ? "item" : "items"} awaiting review
                  {isWritable ? " · Swipe right to approve" : ""}
                </Text>
                <Text style={styles.queueTimezoneText}>{tz.timezone}</Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            hasActiveFilter ? (
              <EmptyState
                icon={<Search size={28} color={colors.textMuted} />}
                title="No matching items"
                description="No pending inbox items match your current search or document filter."
                actionLabel="Clear Filters"
                onAction={() => {
                  haptics.light()
                  setSearch("")
                  setSelectedDocType("")
                }}
              />
            ) : (
              <EmptyState
                icon={<CheckCircle2 size={30} color={colors.success} />}
                title={t("empty.inboxZeroTitle")}
                description={t("empty.inboxZeroDescription")}
              />
            )
          }
          renderItem={({ item }) => (
            <SwipeableInboxCard
              item={item}
              account={
                item.accountId ? accountsMap.get(item.accountId) : undefined
              }
              budget={item.budgetId ? budgetsMap.get(item.budgetId) : undefined}
              baseCurrency={baseCurrency}
              isWritable={isWritable}
              isBusy={Boolean(item.id && busyItemId === item.id)}
              onPress={(pressedItem) => openReviewSheet(pressedItem)}
              onApprove={handleQuickApprove}
              onDiscard={(targetItem) => setDiscardTarget(targetItem)}
              onPickBudget={(targetItem) => {
                setCardBudgetTarget(targetItem)
                budgetSheetRef.current?.expand()
              }}
              onPickAccount={(targetItem) => {
                setCardAccountTarget(targetItem)
                setAccountPickerMode("card")
                accountSheetRef.current?.expand()
              }}
            />
          )}
        />
      )}

      {/* Full Review Sheet */}
      <InboxReviewSheet
        item={reviewItem}
        draft={reviewDraft}
        onChangeDraft={(updater) =>
          setReviewDraft((prev) => (prev ? updater(prev) : prev))
        }
        accounts={accounts}
        budgets={budgets}
        scheduledTransactions={scheduledTransactions}
        recurringTemplates={recurringTemplates}
        borrowings={borrowings}
        baseCurrency={baseCurrency}
        isWritable={isWritable}
        isSubmitting={
          updateInboxMutation.isPending || approveInboxMutation.isPending
        }
        isDiscarding={discardInboxMutation.isPending}
        hintMessage={reviewHint}
        errorMessage={reviewError}
        onClose={closeReviewSheet}
        onOpenCurrencyPicker={() => currencySheetRef.current?.expand()}
        onOpenAccountPicker={() => {
          setCardAccountTarget(null)
          setAccountPickerMode("review-source")
          accountSheetRef.current?.expand()
        }}
        onOpenDestinationAccountPicker={() => {
          setCardAccountTarget(null)
          setAccountPickerMode("review-dest")
          accountSheetRef.current?.expand()
        }}
        onOpenBudgetPicker={() => {
          setCardBudgetTarget(null)
          budgetSheetRef.current?.expand()
        }}
        onOpenScheduledPicker={() => scheduledSheetRef.current?.expand()}
        onOpenBorrowingPicker={() => borrowingSheetRef.current?.expand()}
        onApproveAndRecord={handleApproveAndRecord}
        onDiscard={(targetItem) => setDiscardTarget(targetItem)}
      />

      {/* Shared Picker Sheets (mounted after InboxReviewSheet so they layer on top) */}
      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={
          cardBudgetTarget?.budgetId ?? reviewDraft?.budgetId ?? ""
        }
        isLoading={budgetsLoading}
        onSelect={(budget) => {
          if (cardBudgetTarget) {
            void handleQuickAssignBudget(cardBudgetTarget, budget)
            return
          }
          setReviewDraft((prev) =>
            prev ? { ...prev, budgetId: budget.id || "" } : prev
          )
        }}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        title={
          accountPickerMode === "review-dest"
            ? "Select Destination Account"
            : "Select Account"
        }
        accounts={accounts}
        selectedAccountId={
          accountPickerMode === "card"
            ? (cardAccountTarget?.accountId ?? "")
            : accountPickerMode === "review-dest"
              ? (reviewDraft?.destinationAccountId ?? "")
              : (reviewDraft?.accountId ?? "")
        }
        allowNoAccount={accountPickerMode !== "review-dest"}
        isLoading={accountsLoading}
        onSelect={(accountId) => {
          if (accountPickerMode === "card" && cardAccountTarget) {
            void handleQuickAssignAccount(cardAccountTarget, accountId)
            return
          }
          if (accountPickerMode === "review-dest") {
            setReviewDraft((prev) =>
              prev ? { ...prev, destinationAccountId: accountId } : prev
            )
            return
          }
          setReviewDraft((prev) => (prev ? { ...prev, accountId } : prev))
        }}
      />

      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={reviewDraft?.currency || baseCurrency}
        isLoading={currenciesLoading}
        onSelect={(code) => {
          setReviewDraft((prev) => (prev ? { ...prev, currency: code } : prev))
        }}
      />

      <ScheduledPickerSheet
        ref={scheduledSheetRef}
        scheduledTransactions={scheduledTransactions}
        recurringTemplates={recurringTemplates}
        selectedScheduledId={reviewDraft?.scheduledTransactionId}
        isLoading={scheduledLoading}
        onSelect={(st) => {
          setReviewDraft((prev) =>
            prev
              ? {
                  ...prev,
                  scheduledTransactionId: st.id || "",
                  budgetId: prev.budgetId || st.budgetId || "",
                }
              : prev
          )
        }}
      />

      <BorrowingPickerSheet
        ref={borrowingSheetRef}
        borrowings={borrowings}
        selectedBorrowingId={reviewDraft?.borrowingId}
        isLoading={borrowingsLoading}
        onSelect={(b) => {
          setReviewDraft((prev) =>
            prev ? { ...prev, borrowingId: b.id || "" } : prev
          )
        }}
      />

      {/* Discard Confirmation Dialog */}
      <ConfirmDialog
        visible={Boolean(discardTarget)}
        title="Discard Inbox Item?"
        message={`Remove "${discardTarget?.vendorName || "this item"}" from your review queue without recording it to your ledger?`}
        confirmText="Discard"
        cancelText="Keep"
        isDestructive
        loading={discardInboxMutation.isPending}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardTarget(null)}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  filterHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  searchInputWrap: {
    minHeight: 42,
  },
  filterPillsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterPillActive: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  filterPillTextActive: {
    color: t.colors.primaryForeground,
  },
  loadingList: {
    padding: 16,
    gap: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center" as const,
  },
  queueSummaryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  queueSummaryText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  queueTimezoneText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
})
