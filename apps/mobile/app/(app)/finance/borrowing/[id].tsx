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
  Platform,
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
import { ActionMenu } from "@/components/ui/action-menu"
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
  parseDate,
  getStartOfDay,
  getTimezoneParts,
  formatDateWithTimezone,
} from "@saturn/core"
import {
  invalidateFinanceQueries,
  useDateSections,
  useTimezone,
  useI18n,
} from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount, Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { DateSectionHeader } from "@/components/finance/date-section-header"
import { useToast } from "@/components/ui/toast"

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

function formatDate(
  dateStr?: string,
  timezone: string = "UTC",
  locale?: string
): string {
  if (!dateStr) return ""
  const d = parseDate(dateStr)
  if (!d) return ""
  const now = new Date()
  const dParts = getTimezoneParts(d, timezone)
  const nowParts = getTimezoneParts(now, timezone)
  const showYear = dParts && nowParts ? dParts.year !== nowParts.year : false
  return formatDateWithTimezone(
    d,
    timezone,
    {
      month: "short",
      day: "numeric",
      year: showYear ? "numeric" : undefined,
    },
    locale
  )
}

export default function BorrowingDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
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

  const sections = useDateSections(transactions)

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
      t("finance.borrowing.delete.title"),
      t("finance.borrowing.delete.description", {
        name: borrowing.counterparty || "",
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBorrowingMutation.mutateAsync({
                id: borrowing.id || "",
                req: { id: borrowing.id || "" },
              })
              haptics.success()
              toast.show({
                title: t("finance.borrowing.delete.deletedTitle"),
                message: t("finance.borrowing.delete.deletedDescription", {
                  name: borrowing.counterparty || "",
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.borrowing.delete.failedTitle"),
                message:
                  err?.message ||
                  t("finance.borrowing.delete.failedDescription"),
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
      t("finance.borrowing.mobile.deleteTxTitle"),
      t("finance.borrowing.mobile.deleteTxDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
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
                title: t("finance.transactions.deletedSuccessTitle"),
                message: t("finance.borrowing.mobile.toastTxDeletedDesc"),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              refetchTxns()
              refetchBorrowings()
              refetchSingleBorrowing()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.borrowing.delete.failedTitle"),
                message:
                  err?.message ||
                  t("finance.borrowing.mobile.toastTxDeleteFailed"),
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!borrowing) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={colors.destructive} />
        <Text style={styles.errorTitle}>
          {t("finance.borrowing.mobile.notFoundTitle")}
        </Text>
        <Text style={styles.errorSubtitle}>
          {t("finance.borrowing.mobile.notFoundSubtitle")}
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(app)/finance/borrowing")}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>
            {t("finance.borrowing.mobile.backToDebts")}
          </Text>
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
                    ? colors.surfaceElevated
                    : isLent
                      ? colors.successSubtle
                      : colors.warningSubtle,
                },
              ]}
            >
              {isLent ? (
                <TrendingUp
                  size={20}
                  color={isPaid ? colors.textMuted : colors.success}
                />
              ) : (
                <TrendingDown
                  size={20}
                  color={isPaid ? colors.textMuted : colors.warning}
                />
              )}
            </View>
            <View style={styles.heroTitleCol}>
              <Text style={styles.counterpartyText} numberOfLines={1}>
                {borrowing.counterparty ||
                  t("finance.borrowing.mobile.unknownCounterparty")}
              </Text>
              {borrowing.contactInfo ? (
                <View style={styles.contactRow}>
                  <Phone size={12} color={colors.textMuted} />
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
              label={
                isPaid
                  ? t("finance.borrowing.mobile.badgeSettled")
                  : isLent
                    ? t("finance.borrowing.mobile.badgeLentTo")
                    : t("finance.borrowing.mobile.badgeBorrowedFrom")
              }
              bg={
                isPaid
                  ? colors.surfaceElevated
                  : isLent
                    ? colors.successSubtle
                    : colors.warningSubtle
              }
              color={
                isPaid
                  ? colors.textMuted
                  : isLent
                    ? colors.success
                    : colors.warning
              }
              border={
                isPaid
                  ? colors.border
                  : isLent
                    ? "rgba(16, 185, 129, 0.3)"
                    : "rgba(245, 158, 11, 0.3)"
              }
            />
            {isPaid ? (
              <Badge
                size="sm"
                label={t("finance.borrowing.mobile.badgePaidOff")}
                bg={colors.successSubtle}
                color={colors.success}
              />
            ) : (
              <Badge
                size="sm"
                label={t("finance.borrowing.mobile.badgeActive")}
                bg={colors.primarySubtle}
                color={colors.primary}
              />
            )}
          </View>
        </View>

        {/* Financial Row */}
        <View style={styles.financialRow}>
          <View>
            <Text style={styles.financialStatLabel}>
              {isPaid
                ? t("finance.borrowing.mobile.finalSettled").toUpperCase()
                : t("finance.borrowing.remainingBalance").toUpperCase()}
            </Text>
            <MonoAmount
              size="xl"
              color={
                isPaid
                  ? colors.textMuted
                  : isLent
                    ? colors.success
                    : colors.warning
              }
            >
              {formatAmount(remaining, curr)}
            </MonoAmount>
          </View>

          <View style={styles.financialRightCol}>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.financialStatLabel}>
                {t("finance.borrowing.mobile.principal").toUpperCase()}
              </Text>
              <MonoAmount size="sm" color={colors.textMuted}>
                {formatAmount(total, curr)}
              </MonoAmount>
            </View>
            <View style={{ alignItems: "flex-end", marginTop: 4 }}>
              <Text style={styles.financialStatLabel}>
                {t("finance.borrowing.mobile.repaid").toUpperCase()}
              </Text>
              <MonoAmount size="sm" color={colors.textSecondary}>
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
                ? t("finance.borrowing.mobile.repaidSettled")
                : t("finance.borrowing.mobile.payoffProgress", {
                    pct: percentage.toFixed(0),
                  })}
            </Text>
            <Text style={styles.progressAmounts}>
              {t("finance.borrowing.mobile.progressOf", {
                paid: formatAmount(paidAmount, curr),
                total: formatAmount(total, curr),
              })}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: isPaid
                    ? colors.textMuted
                    : isLent
                      ? colors.success
                      : colors.warning,
                },
              ]}
            />
          </View>
        </View>

        {/* Info Rows */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>
              {t("finance.borrowing.mobile.startedOn", {
                date: formatDate(borrowing.establishedAt, tz.timezone, locale),
              })}
            </Text>
          </View>

          {borrowing.dueAt ? (
            <View style={styles.metaRow}>
              <CalendarClock
                size={14}
                color={
                  isPaid
                    ? colors.textMuted
                    : isOverdue
                      ? colors.destructive
                      : isDueToday || isDueSoon
                        ? colors.warning
                        : colors.textMuted
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
                  ? t("finance.borrowing.mobile.dueOn", {
                      date: formatDate(borrowing.dueAt, tz.timezone, locale),
                    })
                  : isOverdue
                    ? t("finance.borrowing.mobile.overdueBy", {
                        days: Math.abs(daysDiff!),
                        date: formatDate(borrowing.dueAt, tz.timezone, locale),
                      })
                    : isDueToday
                      ? t("finance.borrowing.mobile.dueToday")
                      : t("finance.borrowing.mobile.dueIn", {
                          days: daysDiff ?? 0,
                          date: formatDate(
                            borrowing.dueAt,
                            tz.timezone,
                            locale
                          ),
                        })}
              </Text>
            </View>
          ) : null}

          {linkedAccount ? (
            <View style={styles.metaRow}>
              <Landmark size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>
                {t("finance.borrowing.mobile.accountMeta", {
                  name: linkedAccount.name,
                  currency: linkedAccount.currency,
                })}
              </Text>
            </View>
          ) : null}

          {borrowing.notes ? (
            <View style={[styles.metaRow, { alignItems: "flex-start" }]}>
              <FileText
                size={14}
                color={colors.textMuted}
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
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
              {isLent
                ? t("finance.borrowing.mobile.receivePayment")
                : t("finance.borrowing.mobile.repayDebt")}
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
          <Scale size={16} color={colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            {t("finance.borrowing.adjustBalance")}
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
          <Edit3 size={16} color={colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            {t("common.edit")}
          </Text>
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        {t("finance.borrowing.mobile.repaymentsN", {
          count: transactions.length,
        }).toUpperCase()}
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle:
            borrowing.counterparty ||
            t("finance.borrowing.mobile.headerFallback"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "menu",
                    label: t("finance.budgets.mobile.menuActions"),
                    icon: { type: "sfSymbol", name: "ellipsis" },
                    menu: {
                      title:
                        borrowing.counterparty ||
                        t("finance.borrowing.mobile.agreementFallback"),
                      items: [
                        ...(!isPaid
                          ? [
                              {
                                type: "action" as const,
                                label: isLent
                                  ? t(
                                      "finance.borrowing.mobile.menuRecordPaymentReceived"
                                    )
                                  : t(
                                      "finance.borrowing.mobile.menuLogRepayment"
                                    ),
                                icon: {
                                  type: "sfSymbol" as const,
                                  name: "dollarsign.circle" as const,
                                },
                                onPress: () => {
                                  haptics.light()
                                  router.push({
                                    pathname: "/modal/add-transaction",
                                    params: {
                                      type: "BORROWING",
                                      borrowingId: borrowing.id,
                                    },
                                  })
                                },
                              },
                            ]
                          : []),
                        {
                          type: "action",
                          label: t("finance.borrowing.adjustBalance"),
                          icon: {
                            type: "sfSymbol",
                            name: "scalemass",
                          } as const,
                          onPress: () => {
                            haptics.light()
                            router.push({
                              pathname: "/modal/adjust-borrowing",
                              params: { borrowingId: borrowing.id },
                            })
                          },
                        },
                        {
                          type: "action",
                          label: t("finance.borrowing.editAgreement"),
                          icon: { type: "sfSymbol", name: "pencil" } as const,
                          onPress: () => {
                            haptics.light()
                            router.push({
                              pathname: "/modal/manage-borrowing",
                              params: { id: borrowing.id },
                            })
                          },
                        },
                        {
                          type: "action",
                          label: t(
                            "finance.borrowing.mobile.menuDeleteAgreement"
                          ),
                          icon: { type: "sfSymbol", name: "trash" } as const,
                          destructive: true,
                          onPress: handleDeleteBorrowing,
                        },
                      ],
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <ActionMenu
                    title={
                      borrowing.counterparty ||
                      t("finance.borrowing.mobile.agreementFallback")
                    }
                    colorScheme={resolvedMode}
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
                                ? t(
                                    "finance.borrowing.mobile.menuRecordPaymentReceived"
                                  )
                                : t(
                                    "finance.borrowing.mobile.menuLogRepayment"
                                  ),
                              image: paymentIcon,
                            },
                          ]
                        : []),
                      {
                        id: "adjust",
                        title: t("finance.borrowing.adjustBalance"),
                        image: adjustIcon,
                      },
                      {
                        id: "edit",
                        title: t("finance.borrowing.editAgreement"),
                        image: editIcon,
                      },
                      {
                        id: "delete",
                        title: t(
                          "finance.borrowing.mobile.menuDeleteAgreement"
                        ),
                        image: deleteIcon,
                        attributes: { destructive: true },
                      },
                    ]}
                  >
                    <View style={styles.headerDotsBtn}>
                      <MoreVertical size={20} color={colors.textPrimary} />
                    </View>
                  </ActionMenu>
                ),
              }),
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
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceElevated}
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
                  item.description ||
                    t("finance.borrowing.mobile.borrowingTransaction"),
                  `${formatAmount(item.amount, item.currency || baseCurrency)} • ${tz.format(item.transactionDate)}`,
                  [
                    {
                      text: t("finance.borrowing.mobile.viewTxDetails"),
                      onPress: () => {
                        if (item.id) {
                          router.push(`/(app)/finance/transactions/${item.id}`)
                        }
                      },
                    },
                    {
                      text: t("finance.borrowing.deleteRecord"),
                      style: "destructive",
                      onPress: () => handleDeleteTransaction(item.id),
                    },
                    { text: t("common.cancel"), style: "cancel" },
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
                  icon={<ReceiptText size={32} color={colors.textMuted} />}
                  title={t("finance.borrowing.mobile.emptyRepaymentsTitle")}
                  description={t(
                    "finance.borrowing.mobile.emptyRepaymentsDesc"
                  )}
                  actionLabel={
                    !isPaid
                      ? isLent
                        ? t("finance.borrowing.mobile.receivePayment")
                        : t("finance.borrowing.mobile.menuLogRepayment")
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

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: t.colors.textMuted,
    textAlign: "center" as const,
  },
  backBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  headerDotsBtn: {
    padding: 6,
    marginRight: 4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
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
    backgroundColor: t.colors.surfaceElevated,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  heroLeftGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  heroTitleCol: {
    flex: 1,
    gap: 3,
  },
  counterpartyText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  contactRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  contactText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  badgesCol: {
    alignItems: "flex-end" as const,
    gap: 4,
  },
  financialRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
    paddingTop: 4,
  },
  financialStatLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  financialRightCol: {
    alignItems: "flex-end" as const,
  },
  progressContainer: {
    gap: 6,
  },
  progressHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  progressAmounts: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.surface,
    overflow: "hidden" as const,
  },
  progressBarFill: {
    height: "100%" as const,
    borderRadius: 4,
  },
  metaSection: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    gap: 8,
  },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    flex: 1,
  },
  overdueText: {
    color: t.colors.destructive,
    fontWeight: "600" as const,
  },
  dueSoonText: {
    color: t.colors.warning,
    fontWeight: "600" as const,
  },
  actionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: t.colors.primary,
    paddingHorizontal: 10,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
    flexShrink: 1,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 10,
  },
  actionBtnCompact: {
    flex: 0,
    paddingHorizontal: 14,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  ledgerHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
