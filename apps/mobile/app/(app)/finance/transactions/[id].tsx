import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ReceiptText,
  Landmark,
  Tag,
  Calendar,
  Clock,
  Edit3,
  Trash2,
  Repeat,
  Coins,
  CheckCircle2,
  Copy,
  Zap,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  useGetTransactionQuery,
  useDeleteTransactionMutation,
  useListAccountsQuery,
  useListBudgetsQuery,
  useGetFinanceSettingsQuery,
  useListTransactionEventsQuery,
  type TransactionEvent,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { SkeletonCard } from "@/components/ui/skeleton-loader"

function formatDateString(dateStr?: string): string {
  if (!dateStr) return "N/A"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "N/A"
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTimeString(dateStr?: string): string {
  if (!dateStr) return "N/A"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "N/A"
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { activeSpaceId } = useSpace()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Queries
  const {
    data: tx,
    isLoading: txLoading,
    error: txError,
  } = useGetTransactionQuery({ id: id || "", view: "FULL" }, { enabled: !!id })

  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts = accountsData?.accounts || []
  const account = useMemo(
    () => accounts.find((a) => a.id === tx?.accountId),
    [accounts, tx?.accountId]
  )

  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const budgets = budgetsData?.budgets || []
  const budget = useMemo(
    () => budgets.find((b) => b.id === tx?.budgetId),
    [budgets, tx?.budgetId]
  )
  const budgetName = budget?.name || tx?.budget?.name
  const budgetColor = budget?.color || "indigo"
  const nativeBudgetColors = getNativeBudgetColors(budgetColor)
  const hasBudget = Boolean(budget || tx?.budget)

  const BudgetIcon = useMemo(() => {
    return getBudgetIcon(budget?.icon, budgetName)
  }, [budget?.icon, budgetName])

  const { data: eventsData } = useListTransactionEventsQuery(
    { txnId: id || "" },
    { enabled: !!id }
  )
  const events: TransactionEvent[] = eventsData?.events || []

  // Delete Mutation
  const deleteTxMutation = useDeleteTransactionMutation()

  const isExpense = tx?.type === "EXPENSE"
  const isIncome = tx?.type === "INCOME"
  const displaySign = isExpense ? "-" : isIncome ? "+" : ""

  const isCrossCurrency = Boolean(
    baseCurrency &&
    tx?.currency &&
    tx.currency.toUpperCase() !== baseCurrency.toUpperCase() &&
    tx.amountInBase
  )

  // Exchange rate calculation
  const exchangeRateText = useMemo(() => {
    if (!isCrossCurrency || !tx?.amount || !tx?.amountInBase) return null
    const localCents = parseFloat(tx.amount)
    const baseCents = parseFloat(tx.amountInBase)
    if (localCents <= 0 || baseCents <= 0) return null
    const rate = (baseCents / localCents).toFixed(4)
    return `1 ${tx.currency} ≈ ${rate} ${baseCurrency}`
  }, [
    isCrossCurrency,
    tx?.amount,
    tx?.amountInBase,
    tx?.currency,
    baseCurrency,
  ])

  const isSameDaySettlement = useMemo(() => {
    if (!tx?.transactionDate || !tx?.effectiveDate) return true
    const d1 = new Date(tx.transactionDate)
    const d2 = new Date(tx.effectiveDate)
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  }, [tx?.transactionDate, tx?.effectiveDate])

  const isRecurring = Boolean(tx?.metadata?.recurring_transaction_id)
  const isBorrowing = Boolean(tx?.metadata?.borrowing_id)
  const borrowingRole = tx?.metadata?.borrowing_role

  const handleEdit = () => {
    if (!id) return
    haptics.light()
    router.push({
      pathname: "/modal/add-transaction",
      params: { id },
    })
  }

  const handleDeletePrompt = () => {
    haptics.medium()
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!id || isDeleting) return
    setIsDeleting(true)
    try {
      await deleteTxMutation.mutateAsync({
        id,
        req: { id },
      })

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const firstKey = query.queryKey[0]
          return (
            typeof firstKey === "string" &&
            firstKey.startsWith("/api/v1/finance")
          )
        },
      })

      haptics.success()
      toast.show({
        type: "success",
        title: "Transaction Deleted",
        message: "The transaction has been removed.",
      })

      setDeleteDialogOpen(false)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        type: "error",
        title: "Delete Failed",
        message: err?.message || "Could not delete transaction.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCopyId = () => {
    if (!id) return
    haptics.light()
    toast.show({
      type: "info",
      title: "Transaction ID",
      message: id,
    })
  }

  if (txLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={{ width: "90%", gap: 14 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    )
  }

  if (txError || !tx) {
    return (
      <View style={styles.emptyContainer}>
        <ReceiptText size={48} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>Transaction Not Found</Text>
        <Text style={styles.emptySubtitle}>
          The requested transaction could not be loaded or may have been
          deleted.
        </Text>
        <Button variant="secondary" size="md" onPress={() => router.back()}>
          Go Back
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Top Navbar Action Buttons */}
      <Stack.Screen
        options={{
          headerTitle: "",
          headerRight: () => (
            <View style={styles.navActionsRow}>
              <TouchableOpacity
                onPress={handleEdit}
                style={styles.navActionBtn}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Edit3 size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeletePrompt}
                style={[styles.navActionBtn, styles.navDeleteBtn]}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Trash2 size={18} color={theme.colors.destructive} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Category / Flow Circular Icon */}
          <View
            style={[
              styles.heroIconBadge,
              isExpense && hasBudget
                ? {
                    backgroundColor: nativeBudgetColors.bg,
                    borderColor: nativeBudgetColors.border,
                  }
                : isExpense
                  ? {
                      backgroundColor: theme.colors.destructiveSubtle,
                      borderColor: "rgba(244, 63, 94, 0.25)",
                    }
                  : isIncome
                    ? {
                        backgroundColor: theme.colors.successSubtle,
                        borderColor: "rgba(16, 185, 129, 0.25)",
                      }
                    : {
                        backgroundColor: theme.colors.primarySubtle,
                        borderColor: "rgba(56, 189, 248, 0.25)",
                      },
            ]}
          >
            {isExpense && hasBudget ? (
              <BudgetIcon size={28} color={nativeBudgetColors.bar} />
            ) : isExpense ? (
              <ArrowUpRight size={28} color={theme.colors.destructive} />
            ) : isIncome ? (
              <ArrowDownLeft size={28} color={theme.colors.success} />
            ) : (
              <ReceiptText size={28} color={theme.colors.primary} />
            )}
          </View>

          {/* Bold Merchant / Description Title */}
          <Text style={styles.heroMerchantTitle} numberOfLines={2}>
            {tx.description || "Unnamed Transaction"}
          </Text>

          {/* Big Primary Amount */}
          <MonoAmount
            size="xl"
            color={
              isExpense
                ? theme.colors.textPrimary
                : isIncome
                  ? theme.colors.success
                  : theme.colors.accent
            }
            style={styles.heroAmountText}
          >
            {displaySign}
            {formatAmount(tx.amount, tx.currency)}
          </MonoAmount>

          {/* Converted Base Value (if cross-currency) */}
          {isCrossCurrency && tx.amountInBase ? (
            <Text style={styles.heroBaseAmountText}>
              ≈ {displaySign}
              {formatAmount(tx.amountInBase, baseCurrency)} in Base
            </Text>
          ) : null}

          {/* Status & Flow Chips */}
          <View style={styles.heroBadgesRow}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>COMPLETED</Text>
            </View>

            <Badge
              variant={
                isExpense ? "destructive" : isIncome ? "success" : "default"
              }
              size="md"
              label={tx.type}
            />

            {isRecurring ? (
              <Badge variant="primary" size="md" label="Recurring" />
            ) : null}

            {isBorrowing && borrowingRole ? (
              <Badge
                variant="warning"
                size="md"
                label={
                  borrowingRole === "REPAYMENT"
                    ? "Repayment"
                    : borrowingRole === "INITIAL_FUNDING" && isExpense
                      ? "Lending"
                      : "Borrowing"
                }
              />
            ) : null}
          </View>
        </View>

        {/* Card 1: PAYMENT & ALLOCATION */}
        <View style={styles.sectionHeaderRow}>
          <Caption style={styles.sectionHeader}>
            {isIncome ? "PAYMENT ACCOUNT" : "PAYMENT & CATEGORY"}
          </Caption>
        </View>

        <Card style={styles.insetCard}>
          {/* Account */}
          <View style={styles.tableRow}>
            <View style={styles.rowLabelGroup}>
              <Landmark size={15} color={theme.colors.textMuted} />
              <Text style={styles.rowLabel}>Account</Text>
            </View>
            <Text style={styles.rowValue} numberOfLines={1}>
              {account?.name ||
                tx.account?.name ||
                (tx.accountId ? "Account" : "No Account (Cash)")}
            </Text>
          </View>

          {/* Budget (Only for Expense / non-income) */}
          {!isIncome && (
            <>
              <View style={styles.rowDivider} />
              <View style={styles.tableRow}>
                <View style={styles.rowLabelGroup}>
                  <Tag size={15} color={theme.colors.textMuted} />
                  <Text style={styles.rowLabel}>Budget</Text>
                </View>
                {hasBudget ? (
                  <View
                    style={[
                      styles.budgetPill,
                      {
                        backgroundColor: nativeBudgetColors.bg,
                        borderColor: nativeBudgetColors.border,
                      },
                    ]}
                  >
                    <BudgetIcon size={13} color={nativeBudgetColors.bar} />
                    <Text
                      style={[
                        styles.budgetPillText,
                        { color: nativeBudgetColors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {budgetName}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.rowMutedValue}>General / None</Text>
                )}
              </View>
            </>
          )}
        </Card>

        {/* Card 2: TRANSACTION DETAILS */}
        <View style={styles.sectionHeaderRow}>
          <Caption style={styles.sectionHeader}>TRANSACTION DETAILS</Caption>
        </View>

        <Card style={styles.insetCard}>
          {/* Date */}
          <View style={styles.tableRow}>
            <View style={styles.rowLabelGroup}>
              <Calendar size={15} color={theme.colors.textMuted} />
              <Text style={styles.rowLabel}>Date</Text>
            </View>
            <Text style={styles.rowValue}>
              {formatDateString(tx.transactionDate)}
            </Text>
          </View>

          <View style={styles.rowDivider} />

          {/* Time */}
          <View style={styles.tableRow}>
            <View style={styles.rowLabelGroup}>
              <Clock size={15} color={theme.colors.textMuted} />
              <Text style={styles.rowLabel}>Time</Text>
            </View>
            <Text style={styles.rowValue}>
              {formatTimeString(tx.transactionDate)}
            </Text>
          </View>

          <View style={styles.rowDivider} />

          {/* Settlement */}
          <View style={styles.tableRow}>
            <View style={styles.rowLabelGroup}>
              <Zap size={15} color={theme.colors.textMuted} />
              <Text style={styles.rowLabel}>Settlement</Text>
            </View>
            <Text style={styles.rowValue}>
              {isSameDaySettlement
                ? `Same day (${formatDateString(tx.transactionDate)})`
                : formatDateString(tx.effectiveDate)}
            </Text>
          </View>

          <View style={styles.rowDivider} />

          {/* Transaction ID (Copyable) */}
          <TouchableOpacity
            style={styles.tableRow}
            activeOpacity={0.7}
            onPress={handleCopyId}
          >
            <View style={styles.rowLabelGroup}>
              <ReceiptText size={15} color={theme.colors.textMuted} />
              <Text style={styles.rowLabel}>Transaction ID</Text>
            </View>
            <View style={styles.copyableRow}>
              <Text style={styles.monoIdText} numberOfLines={1}>
                {tx.id}
              </Text>
              <View style={styles.copyBadge}>
                <Copy size={12} color={theme.colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Card 3: CURRENCY EXCHANGE (If cross-currency) */}
        {isCrossCurrency && tx.amountInBase ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <Caption style={styles.sectionHeader}>CURRENCY EXCHANGE</Caption>
            </View>

            <Card style={styles.insetCard}>
              {exchangeRateText ? (
                <>
                  <View style={styles.tableRow}>
                    <View style={styles.rowLabelGroup}>
                      <Coins size={15} color={theme.colors.textMuted} />
                      <Text style={styles.rowLabel}>Effective Rate</Text>
                    </View>
                    <Text style={styles.rowValue}>{exchangeRateText}</Text>
                  </View>
                  <View style={styles.rowDivider} />
                </>
              ) : null}

              <View style={styles.tableRow}>
                <View style={styles.rowLabelGroup}>
                  <Landmark size={15} color={theme.colors.textMuted} />
                  <Text style={styles.rowLabel}>Base Equivalent</Text>
                </View>
                <Text style={styles.rowValue}>
                  {displaySign}
                  {formatAmount(tx.amountInBase, baseCurrency)}
                </Text>
              </View>
            </Card>
          </>
        ) : null}

        {/* Card 4: ACTIVITY HISTORY */}
        {events.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Caption style={styles.sectionHeader}>ACTIVITY HISTORY</Caption>
            </View>

            <Card style={styles.insetCard}>
              {events.map((evt, idx) => (
                <View key={evt.id || idx}>
                  <View style={styles.eventRow}>
                    <CheckCircle2 size={15} color={theme.colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{evt.eventType}</Text>
                      <Text style={styles.eventTime}>
                        {formatDateString(evt.createTime)} at{" "}
                        {formatTimeString(evt.createTime)}
                      </Text>
                    </View>
                  </View>
                  {idx < events.length - 1 && (
                    <View style={styles.eventDivider} />
                  )}
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      {/* Confirmation Dialog for Deletion */}
      <ConfirmDialog
        visible={deleteDialogOpen}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? All associated account balances and budget period totals will be restored."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 4,
  },
  navActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navDeleteBtn: {
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: theme.colors.destructiveSubtle,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: 8,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  heroIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  heroMerchantTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  heroAmountText: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1,
  },
  heroBaseAmountText: {
    fontSize: 13,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
    fontWeight: "500",
    marginTop: -2,
  },
  heroBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.colors.success,
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    paddingHorizontal: 4,
    marginTop: 6,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    fontSize: 11,
    fontWeight: "700",
  },
  insetCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: theme.radius.lg,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  rowLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    maxWidth: "60%",
    textAlign: "right",
  },
  rowMutedValue: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  budgetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: "60%",
  },
  budgetPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  budgetPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  copyableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 1,
    maxWidth: "60%",
  },
  monoIdText: {
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textMuted,
    flexShrink: 1,
  },
  copyBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textTransform: "capitalize",
  },
  eventTime: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  eventDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 25,
  },
})
