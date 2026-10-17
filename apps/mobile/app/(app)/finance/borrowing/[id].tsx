import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarClock,
  MoreVertical,
  Scale,
  ReceiptText,
  AlertCircle,
  Edit3,
  Plus,
  Landmark,
  FileText,
  Phone,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { MenuView } from "@expo/ui/community/menu"
import {
  useGetBorrowingQuery,
  useListBorrowingsQuery,
  useListTransactionsQuery,
  useListAccountsQuery,
  useGetSettingsQuery,
  useDeleteBorrowingMutation,
  useDeleteBorrowingTransactionMutation,
  type Borrowing,
  type Account,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatAmount,
  groupTransactionsByDate,
  parseDate,
  getStartOfDay,
  getTimezoneParts,
  formatDateWithTimezone,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { DateSectionHeader } from "@/components/finance/date-section-header"
import { useToast } from "@/components/ui/toast"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

// Cross-platform menu icons
const paymentIcon = Icon.select({
  ios: "dollarsign.circle",
  android: require("@expo/material-symbols/payments.xml"),
})

const adjustIcon = Icon.select({
  ios: "slider.horizontal.3",
  android: require("@expo/material-symbols/scale.xml"),
})

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const deleteIcon = Icon.select({
  ios: "trash",
  android: require("@expo/material-symbols/delete.xml"),
})

function getDaysDiff(
  dateStr?: string,
  timezone: string = "UTC"
): number | null {
  if (!dateStr) return null
  const target = parseDate(dateStr)
  if (!target) return null
  const now = new Date()
  const startToday = getStartOfDay(now, timezone)
  const startTarget = getStartOfDay(target, timezone)
  const diffTime = startTarget.getTime() - startToday.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr?: string, timezone: string = "UTC"): string {
  if (!dateStr) return ""
  const d = parseDate(dateStr)
  if (!d) return ""
  const now = new Date()
  const dParts = getTimezoneParts(d, timezone)
  const nowParts = getTimezoneParts(now, timezone)
  const showYear = dParts && nowParts ? dParts.year !== nowParts.year : false
  return formatDateWithTimezone(d, timezone, {
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
  })
}

export default function BorrowingDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)

  // Fetch base currency settings
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch borrowings list
  const {
    data: borrowingsData,
    isLoading: isBorrowingsLoading,
    refetch: refetchBorrowings,
  } = useListBorrowingsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const borrowingFromList = useMemo(
    () => borrowingsData?.borrowings?.find((b: Borrowing) => b.id === id),
    [borrowingsData, id]
  )

  // Fallback to single get query
  const {
    data: borrowingFromGet,
    isLoading: isSingleLoading,
    refetch: refetchSingleBorrowing,
  } = useGetBorrowingQuery(
    { id: id || "" },
    { enabled: !!id && !!activeSpaceId && !borrowingFromList }
  )

  const borrowing = borrowingFromList || borrowingFromGet

  // Fetch transactions for this borrowing
  const {
    data: txnsData,
    isLoading: isTxnsLoading,
    refetch: refetchTxns,
  } = useListTransactionsQuery(
    {
      borrowingId: id || "",
      types: [],
      pageSize: 100,
      pageToken: "",
      view: "FULL",
    },
    { enabled: !!id && !!activeSpaceId }
  )

  // Fetch accounts to map account info
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )
  const accountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((a) => {
      if (a.id) map.set(a.id, a)
    })
    return map
  }, [accounts])

  const transactions = useMemo<Transaction[]>(
    () => txnsData?.transactions || [],
    [txnsData?.transactions]
  )

  const sections = useMemo(
    () => groupTransactionsByDate(transactions, tz.timezone),
    [transactions, tz.timezone]
  )

  const deleteBorrowingMutation = useDeleteBorrowingMutation()
  const deleteTxMutation = useDeleteBorrowingTransactionMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
        refetchBorrowings(),
        refetchSingleBorrowing(),
        refetchTxns(),
        invalidateFinanceQueries(queryClient),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const handleDeleteBorrowing = () => {
    if (!borrowing?.id) return
    haptics.warning()
    Alert.alert(
      "Delete Debt Agreement",
      `Are you sure you want to delete this record with "${borrowing.counterparty}"? All logged transactions and repayments will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBorrowingMutation.mutateAsync({
                id: borrowing.id || "",
                req: { id: borrowing.id || "" },
              })
              haptics.success()
              toast.show({
                title: "Agreement Deleted",
                message: `Record with ${borrowing.counterparty} was removed.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete record.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  const handleDeleteTransaction = (transactionId?: string) => {
    if (!borrowing?.id || !transactionId) return
    haptics.warning()
    Alert.alert(
      "Delete Repayment",
      "Are you sure you want to delete this borrowing transaction? The remaining balance will be updated.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTxMutation.mutateAsync({
                borrowing_id: borrowing.id || "",
                transaction_id: transactionId,
                req: {
                  borrowingId: borrowing.id || "",
                  transactionId: transactionId,
                },
              })
              haptics.success()
              toast.show({
                title: "Transaction Deleted",
                message: "The repayment transaction was deleted.",
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              refetchTxns()
              refetchBorrowings()
              refetchSingleBorrowing()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete transaction.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isBorrowingsLoading || isSingleLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!borrowing) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={theme.colors.destructive} />
        <Text style={styles.errorTitle}>Debt Agreement Not Found</Text>
        <Text style={styles.errorSubtitle}>
          The requested debt or loan agreement could not be loaded.
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(app)/finance/borrowing")}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>Back to Debts & Loans</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isLent = borrowing.direction === "LENT"
  const total = parseFloat(borrowing.totalAmount || "0")
  const remaining = parseFloat(borrowing.remainingAmount || "0")
  const isPaid = borrowing.status === "PAID_OFF" || remaining <= 0
  const paidAmount = Math.max(0, total - remaining)
  const percentage =
    total > 0 ? Math.min(100, Math.max(0, (paidAmount / total) * 100)) : 100

  const daysDiff = getDaysDiff(borrowing.dueAt, tz.timezone)
  const isOverdue = !isPaid && daysDiff !== null && daysDiff < 0
  const isDueToday = !isPaid && daysDiff === 0
  const isDueSoon =
    !isPaid && daysDiff !== null && daysDiff > 0 && daysDiff <= 7

  const curr = borrowing.currency || baseCurrency
  const linkedAccount = borrowing.accountId
    ? accountsMap.get(borrowing.accountId)
    : null

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* 1. Hero Agreement Card */}
      <Card style={styles.heroCard}>
        {/* Top: Icon + Counterparty + Badges */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroLeftGroup}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isPaid
                    ? theme.colors.surfaceElevated
                    : isLent
                      ? theme.colors.successSubtle
                      : "rgba(245, 158, 11, 0.15)",
                },
              ]}
            >
              {isLent ? (
                <TrendingUp
                  size={20}
                  color={isPaid ? theme.colors.textMuted : theme.colors.success}
                />
              ) : (
                <TrendingDown
                  size={20}
                  color={isPaid ? theme.colors.textMuted : "#f59e0b"}
                />
              )}
            </View>
            <View style={styles.heroTitleCol}>
              <Text style={styles.counterpartyText} numberOfLines={1}>
                {borrowing.counterparty || "Unknown"}
              </Text>
              {borrowing.contactInfo ? (
                <View style={styles.contactRow}>
                  <Phone size={12} color={theme.colors.textMuted} />
                  <Text style={styles.contactText} numberOfLines={1}>
                    {borrowing.contactInfo}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.badgesCol}>
            <Badge
              size="sm"
              label={isPaid ? "Settled" : isLent ? "Lent to" : "Borrowed from"}
              bg={
                isPaid
                  ? theme.colors.surfaceElevated
                  : isLent
                    ? theme.colors.successSubtle
                    : "rgba(245, 158, 11, 0.15)"
              }
              color={
                isPaid
                  ? theme.colors.textMuted
                  : isLent
                    ? theme.colors.success
                    : "#f59e0b"
              }
              border={
                isPaid
                  ? theme.colors.border
                  : isLent
                    ? "rgba(16, 185, 129, 0.3)"
                    : "rgba(245, 158, 11, 0.3)"
              }
            />
            {isPaid ? (
              <Badge
                size="sm"
                label="Paid Off"
                bg={theme.colors.successSubtle}
                color={theme.colors.success}
              />
            ) : (
              <Badge
                size="sm"
                label="Active"
                bg="rgba(59, 130, 246, 0.12)"
                color="#60a5fa"
              />
            )}
          </View>
        </View>

        {/* Financial Row */}
        <View style={styles.financialRow}>
          <View>
            <Text style={styles.financialStatLabel}>
              {isPaid ? "FINAL SETTLED" : "REMAINING BALANCE"}
            </Text>
            <MonoAmount
              size="xl"
              color={
                isPaid
                  ? theme.colors.textMuted
                  : isLent
                    ? theme.colors.success
                    : "#f59e0b"
              }
            >
              {formatAmount(remaining, curr)}
            </MonoAmount>
          </View>

          <View style={styles.financialRightCol}>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.financialStatLabel}>PRINCIPAL</Text>
              <MonoAmount size="sm" color={theme.colors.textMuted}>
                {formatAmount(total, curr)}
              </MonoAmount>
            </View>
            <View style={{ alignItems: "flex-end", marginTop: 4 }}>
              <Text style={styles.financialStatLabel}>REPAID</Text>
              <MonoAmount size="sm" color={theme.colors.textSecondary}>
                {formatAmount(paidAmount, curr)}
              </MonoAmount>
            </View>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>
              {isPaid
                ? "100% Repaid • Agreement Settled"
                : `Payoff Progress • ${percentage.toFixed(0)}%`}
            </Text>
            <Text style={styles.progressAmounts}>
              {formatAmount(paidAmount, curr)} of {formatAmount(total, curr)}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: isPaid
                    ? theme.colors.textMuted
                    : isLent
                      ? theme.colors.success
                      : "#f59e0b",
                },
              ]}
            />
          </View>
        </View>

        {/* Info Rows */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <Calendar size={14} color={theme.colors.textMuted} />
            <Text style={styles.metaText}>
              Started {formatDate(borrowing.establishedAt, tz.timezone)}
            </Text>
          </View>

          {borrowing.dueAt ? (
            <View style={styles.metaRow}>
              <CalendarClock
                size={14}
                color={
                  isPaid
                    ? theme.colors.textMuted
                    : isOverdue
                      ? theme.colors.destructive
                      : isDueToday || isDueSoon
                        ? "#f59e0b"
                        : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.metaText,
                  isOverdue && styles.overdueText,
                  (isDueToday || isDueSoon) && styles.dueSoonText,
                ]}
              >
                {isPaid
                  ? `Due ${formatDate(borrowing.dueAt, tz.timezone)}`
                  : isOverdue
                    ? `Overdue by ${Math.abs(daysDiff!)}d (${formatDate(borrowing.dueAt, tz.timezone)})`
                    : isDueToday
                      ? "Due Today"
                      : `Due in ${daysDiff}d (${formatDate(borrowing.dueAt, tz.timezone)})`}
              </Text>
            </View>
          ) : null}

          {linkedAccount ? (
            <View style={styles.metaRow}>
              <Landmark size={14} color={theme.colors.textMuted} />
              <Text style={styles.metaText}>
                Account: {linkedAccount.name} ({linkedAccount.currency})
              </Text>
            </View>
          ) : null}

          {borrowing.notes ? (
            <View style={[styles.metaRow, { alignItems: "flex-start" }]}>
              <FileText
                size={14}
                color={theme.colors.textMuted}
                style={{ marginTop: 2 }}
              />
              <Text style={styles.metaText}>{borrowing.notes}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* 2. Quick Actions Row */}
      <View style={styles.actionsRow}>
        {!isPaid ? (
          <TouchableOpacity
            onPress={() => {
              haptics.light()
              router.push({
                pathname: "/modal/add-transaction",
                params: {
                  type: "BORROWING",
                  borrowingId: borrowing.id,
                },
              })
            }}
            style={styles.actionBtnPrimary}
            activeOpacity={0.7}
          >
            <Plus size={16} color={theme.colors.primaryForeground} />
            <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
              {isLent ? "Receive Payment" : "Repay Debt"}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/adjust-borrowing",
              params: { borrowingId: borrowing.id },
            })
          }}
          style={styles.actionBtnSecondary}
          activeOpacity={0.7}
        >
          <Scale size={16} color={theme.colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            Adjust Balance
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/manage-borrowing",
              params: { id: borrowing.id },
            })
          }}
          style={[
            styles.actionBtnSecondary,
            !isPaid && styles.actionBtnCompact,
          ]}
          activeOpacity={0.7}
        >
          <Edit3 size={16} color={theme.colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            Edit
          </Text>
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        REPAYMENTS & TRANSACTIONS ({transactions.length})
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: borrowing.counterparty || "Agreement Details",
          headerRight: () => (
            <MenuView
              title={borrowing.counterparty || "Agreement"}
              colorScheme="dark"
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "pay") {
                  haptics.light()
                  router.push({
                    pathname: "/modal/add-transaction",
                    params: {
                      type: "BORROWING",
                      borrowingId: borrowing.id,
                    },
                  })
                } else if (nativeEvent.event === "adjust") {
                  haptics.light()
                  router.push({
                    pathname: "/modal/adjust-borrowing",
                    params: { borrowingId: borrowing.id },
                  })
                } else if (nativeEvent.event === "edit") {
                  haptics.light()
                  router.push({
                    pathname: "/modal/manage-borrowing",
                    params: { id: borrowing.id },
                  })
                } else if (nativeEvent.event === "delete") {
                  handleDeleteBorrowing()
                }
              }}
              actions={[
                ...(!isPaid
                  ? [
                      {
                        id: "pay",
                        title: isLent
                          ? "Record Payment Received"
                          : "Log Repayment",
                        image: paymentIcon,
                      },
                    ]
                  : []),
                {
                  id: "adjust",
                  title: "Adjust Balance",
                  image: adjustIcon,
                },
                {
                  id: "edit",
                  title: "Edit Agreement",
                  image: editIcon,
                },
                {
                  id: "delete",
                  title: "Delete Agreement",
                  image: deleteIcon,
                  attributes: { destructive: true },
                },
              ]}
            >
              <TouchableOpacity
                style={styles.headerDotsBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MoreVertical size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </MenuView>
          ),
        }}
      />

      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surfaceElevated}
            />
          }
          renderSectionHeader={({ section }) => (
            <DateSectionHeader title={section.title} />
          )}
          renderItem={({ item }) => (
            <TransactionListItem
              item={item}
              baseCurrency={baseCurrency}
              account={
                item.accountId ? accountsMap.get(item.accountId) : undefined
              }
              onPress={() => {
                haptics.light()
                Alert.alert(
                  item.description || "Borrowing Transaction",
                  `${formatAmount(item.amount, item.currency || baseCurrency)} • ${tz.format(item.transactionDate)}`,
                  [
                    {
                      text: "View Transaction Details",
                      onPress: () => {
                        if (item.id) {
                          router.push(`/(app)/finance/transactions/${item.id}`)
                        }
                      },
                    },
                    {
                      text: "Delete Record",
                      style: "destructive",
                      onPress: () => handleDeleteTransaction(item.id),
                    },
                    { text: "Cancel", style: "cancel" },
                  ]
                )
              }}
            />
          )}
          ListEmptyComponent={
            isTxnsLoading ? (
              <View style={{ gap: 8, paddingHorizontal: 16 }}>
                <SkeletonCard height={60} />
                <SkeletonCard height={60} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon={
                    <ReceiptText size={32} color={theme.colors.textMuted} />
                  }
                  title="No Repayments Yet"
                  description="No repayments or balance adjustments have been recorded for this agreement."
                  actionLabel={
                    !isPaid
                      ? isLent
                        ? "Receive Payment"
                        : "Log Repayment"
                      : undefined
                  }
                  onAction={
                    !isPaid
                      ? () =>
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "BORROWING",
                              borrowingId: borrowing.id,
                            },
                          })
                      : undefined
                  }
                />
              </View>
            )
          }
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  backBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  headerDotsBtn: {
    padding: 6,
    marginRight: 4,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  heroCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitleCol: {
    flex: 1,
    gap: 3,
  },
  counterpartyText: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  contactText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  badgesCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 4,
  },
  financialStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  financialRightCol: {
    alignItems: "flex-end",
  },
  progressContainer: {
    gap: 6,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  progressAmounts: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  metaSection: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  overdueText: {
    color: theme.colors.destructive,
    fontWeight: "600",
  },
  dueSoonText: {
    color: "#f59e0b",
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primaryForeground,
    flexShrink: 1,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
  },
  actionBtnCompact: {
    flex: 0,
    paddingHorizontal: 14,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  ledgerHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
