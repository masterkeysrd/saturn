import { DetailChart } from "../../../../components/finance/detail-chart"
import { useBorrowingAnalytics, useDetailLedger } from "@saturn/hooks/finance"
import { AIHeaderButton } from "../../../../components/app-header"
import {
  useOptionalMobileCopilotSheet,
  useMobileCopilotView,
} from "../../../../lib/copilot-sheet-context"
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
  CalendarClock,
  MoreVertical,
  Scale,
  ReceiptText,
  AlertCircle,
  Plus,
  PlusCircle,
  Landmark,
  FileText,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "../../../../components/ui/action-menu"
import {
  useGetBorrowingQuery,
  useListAccountsQuery,
  useListExchangeRatesQuery,
  useGetSettingsQuery,
  useDeleteBorrowingMutation,
  type Account,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  buildCopilotEntityKey,
  convertCentsToBase,
  signedTransactionAmount,
  getDaysDiff,
} from "@saturn/core"
import {
  invalidateFinanceQueries,
  useDateSections,
  useTimezone,
  useI18n,
} from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useSpace } from "../../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../../lib/theme"
import { haptics } from "../../../../lib/haptics"
import { Card } from "../../../../components/ui/card"
import { Badge } from "../../../../components/ui/badge"
import { MonoAmount } from "../../../../components/ui/typography"
import { EmptyState } from "../../../../components/ui/empty-state"
import { SkeletonCard } from "../../../../components/ui/skeleton-loader"
import { TransactionListItem } from "../../../../components/finance/transaction-list-item"
import { DateSectionHeader } from "../../../../components/finance/date-section-header"
import { useToast } from "../../../../components/ui/toast"

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const deleteIcon = Icon.select({
  ios: "trash",
  android: require("@expo/material-symbols/delete.xml"),
})

export default function BorrowingDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [refreshing, setRefreshing] = useState(false)
  const copilotSheet = useOptionalMobileCopilotSheet()
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<"transactions" | "analytics">(
    "transactions"
  )
  const { data: rates } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  // Fetch base currency settings
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const {
    data: borrowing,
    isLoading: isSingleLoading,
    refetch: refetchSingleBorrowing,
  } = useGetBorrowingQuery(
    { id: id || "" },
    { enabled: !!id && !!activeSpaceId }
  )
  const chart = useBorrowingAnalytics(
      activeSpaceId || undefined,
      activeTab === "analytics" ? borrowing : undefined
    ),
    ledger = useDetailLedger(
      activeSpaceId || undefined,
      { borrowingId: id },
      !!id
    ),
    { isLoading: isTxnsLoading, refetch: refetchTxns } = ledger
  useMobileCopilotView(
    borrowing?.id
      ? {
          viewId: "mobile.finance.borrowing.detail",
          title:
            borrowing.counterparty ||
            t("finance.borrowing.mobile.headerFallback"),
          activeEntity: {
            kind: "borrowing",
            id: borrowing.id,
            key: buildCopilotEntityKey("borrowing", borrowing.id),
            label:
              borrowing.counterparty ||
              t("finance.borrowing.mobile.headerFallback"),
            summary: {
              direction: borrowing.direction || "BORROWED",
              currency: borrowing.currency || baseCurrency,
              totalAmount: borrowing.totalAmount || "0",
              remainingAmount: borrowing.remainingAmount || "0",
              status: borrowing.status || "ACTIVE",
            },
          },
          suggestions: [
            t("ai.copilotSheet.suggestBorrowing"),
            t("finance.borrowing.suggestion.paymentHistory"),
            t("finance.borrowing.suggestion.payoffPlan"),
          ],
        }
      : null
  )
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
    () => ledger.data?.pages.flatMap((p) => p.transactions || []) || [],
    [ledger.data]
  )

  const sections = useDateSections(transactions)

  const deleteBorrowingMutation = useDeleteBorrowingMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([
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

  if (isSingleLoading) {
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

  const eligibleRates = (rates?.exchangeRates || []).filter(
    (rate) =>
      rate.rate > 0 &&
      ((rate.fromCurrency === curr && rate.toCurrency === baseCurrency) ||
        (rate.toCurrency === curr && rate.fromCurrency === baseCurrency))
  )
  const preview =
    curr !== baseCurrency && eligibleRates.length > 0
      ? convertCentsToBase(remaining, curr, baseCurrency, eligibleRates)
      : null
  const accent = isPaid
    ? colors.textMuted
    : isLent
      ? colors.success
      : colors.warning
  const Direction = isLent ? TrendingUp : TrendingDown
  const dueColor = isOverdue
    ? colors.destructive
    : isDueSoon || isDueToday
      ? colors.warning
      : colors.textMuted
  const dueLabel = !borrowing.dueAt
    ? t("finance.borrowing.mobile.startedOn", {
        date: tz.format(borrowing.establishedAt),
      })
    : isOverdue
      ? t("finance.borrowing.mobile.overdueBy", {
          days: Math.abs(daysDiff!),
          date: tz.format(borrowing.dueAt),
        })
      : isDueToday
        ? t("finance.borrowing.mobile.dueToday")
        : t("finance.borrowing.mobile.dueOn", {
            date: tz.format(borrowing.dueAt),
          })
  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Card style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: isPaid
                  ? colors.surfaceSubtle
                  : isLent
                    ? colors.successSubtle
                    : colors.warningSubtle,
              },
            ]}
          >
            <Direction size={20} color={accent} />
          </View>
          <View style={styles.heroTitleCol}>
            <Text style={styles.progressLabel}>
              {t(
                isPaid
                  ? "finance.borrowing.mobile.finalSettled"
                  : "finance.borrowing.remainingBalance"
              )}
            </Text>
            <MonoAmount
              size="lg"
              color={accent}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {tz.formatMoney(remaining, curr)}
            </MonoAmount>
            {preview !== null && (
              <Text style={styles.progressAmounts}>
                ≈ {tz.formatMoney(preview, baseCurrency)}
              </Text>
            )}
          </View>
          <View style={styles.badgesCol}>
            <Badge
              size="sm"
              label={t(
                isLent
                  ? "finance.borrowing.filterLent"
                  : "finance.borrowing.filterBorrowed"
              )}
              color={accent}
              bg={
                isPaid
                  ? colors.surfaceSubtle
                  : isLent
                    ? colors.successSubtle
                    : colors.warningSubtle
              }
              border={colors.border}
            />
            {isPaid && (
              <Badge
                size="sm"
                label={t("finance.borrowing.mobile.badgeSettled")}
                color={colors.textMuted}
                bg={colors.surfaceSubtle}
              />
            )}
          </View>
        </View>
        <View style={styles.progressContainer}>
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
                      : colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>
              {isPaid
                ? t("finance.borrowing.mobile.badgeSettled")
                : t("finance.borrowing.mobile.payoffProgress", {
                    pct: percentage.toFixed(0),
                  })}
            </Text>
            <Text style={styles.progressAmounts}>
              {t("finance.borrowing.mobile.progressOf", {
                paid: tz.formatMoney(paidAmount, curr),
                total: tz.formatMoney(total, curr),
              })}
            </Text>
          </View>
        </View>
        <View style={[styles.metaSection, styles.metaRow]}>
          <CalendarClock size={14} color={dueColor} />
          <Text
            numberOfLines={1}
            style={[styles.metaText, { color: dueColor }]}
          >
            {dueLabel}
          </Text>
          {linkedAccount && (
            <>
              <Landmark size={14} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {linkedAccount.name}
              </Text>
            </>
          )}
        </View>
      </Card>
      <View style={styles.actionsRow}>
        {!isPaid ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              isLent
                ? t("finance.borrowing.mobile.receivePayment")
                : t("finance.borrowing.mobile.repayDebt")
            }
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
            activeOpacity={0.8}
          >
            <Plus size={15} color={colors.primaryForeground} />
            <Text style={styles.actionBtnPrimaryText} numberOfLines={1}>
              {isLent
                ? t("finance.borrowing.mobile.quickReceive")
                : t("finance.borrowing.mobile.quickRepay")}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={getLocalizedEnumLabel(
            "finance",
            "borrowingRole",
            "DISBURSEMENT",
            language
          )}
          style={styles.actionBtnSecondary}
          activeOpacity={0.7}
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "BORROWING",
                borrowingId: borrowing.id,
                borrowingAction: "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
              },
            })
          }}
        >
          <PlusCircle size={15} color={colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            {t("finance.borrowing.mobile.quickDisburse")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("finance.borrowing.adjustBalance")}
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
          <Scale size={15} color={colors.textPrimary} />
          <Text style={styles.actionBtnSecondaryText} numberOfLines={1}>
            {t("finance.borrowing.detail.adjust")}
          </Text>
        </TouchableOpacity>
      </View>
      {!!borrowing.notes?.trim() && (
        <TouchableOpacity
          style={[styles.metaRow, { minHeight: 44 }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: notesExpanded }}
          onPress={() => {
            haptics.selection()
            setNotesExpanded(!notesExpanded)
          }}
        >
          <FileText size={15} color={colors.textMuted} />
          <Text
            style={styles.metaText}
            numberOfLines={notesExpanded ? undefined : 1}
          >
            {borrowing.notes}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.underlineTabBar} accessibilityRole="tablist">
        {(
          [
            ["transactions", t("nav.transactions")],
            ["analytics", t("finance.detail.analytics")],
          ] as const
        ).map(([tabKey, tabLabel]) => {
          const isSelected = activeTab === tabKey
          return (
            <TouchableOpacity
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              activeOpacity={0.75}
              style={[
                styles.underlineTab,
                isSelected && styles.underlineTabSelected,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab(tabKey)
              }}
            >
              <Text
                style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}
                numberOfLines={1}
              >
                {tabLabel}
              </Text>
              {tabKey === "transactions" && !isTxnsLoading && (
                <View
                  style={[
                    styles.tabCountBadge,
                    isSelected && styles.tabCountBadgeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isSelected && styles.tabCountTextSelected,
                    ]}
                  >
                    {`${transactions.length}${ledger.hasNextPage ? "+" : ""}`}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
      {activeTab === "analytics" && (
        <>
          <Card style={styles.kpiCard}>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.progressAmounts} numberOfLines={1}>
                  {t("finance.borrowing.remainingBalance")}
                </Text>
                <MonoAmount size="md" numberOfLines={1} adjustsFontSizeToFit>
                  {tz.formatMoney(remaining, curr)}
                </MonoAmount>
              </View>
              <View style={[styles.kpiCell, styles.kpiCellRight]}>
                <Text style={styles.progressAmounts} numberOfLines={1}>
                  {t("finance.borrowing.mobile.principal")}
                </Text>
                <MonoAmount size="md" numberOfLines={1} adjustsFontSizeToFit>
                  {tz.formatMoney(total, curr)}
                </MonoAmount>
              </View>
            </View>
            <View style={[styles.kpiRow, styles.kpiRowDivider]}>
              <View style={styles.kpiCell}>
                <Text style={styles.progressAmounts} numberOfLines={1}>
                  {t("finance.borrowing.mobile.repaid")}
                </Text>
                <MonoAmount size="md" numberOfLines={1} adjustsFontSizeToFit>
                  {tz.formatMoney(paidAmount, curr)}
                </MonoAmount>
              </View>
              <View style={[styles.kpiCell, styles.kpiCellRight]}>
                <Text style={styles.progressAmounts} numberOfLines={1}>
                  {t("finance.borrowing.mobile.payoffLabel")}
                </Text>
                <MonoAmount size="md" numberOfLines={1} adjustsFontSizeToFit>
                  {`${percentage.toFixed(0)}%`}
                </MonoAmount>
              </View>
            </View>
          </Card>
          {chart.query.isLoading ? (
            <SkeletonCard height={180} />
          ) : chart.query.isError ? (
            <Text style={styles.progressLabel}>
              {t("finance.detail.error")}
            </Text>
          ) : chart.query.isSuccess && chart.points.length > 0 ? (
            <DetailChart
              stepped
              title={t("finance.detail.paydown")}
              valueLabel={t("finance.detail.paydown")}
              comparisonLabel={t("finance.detail.target")}
              points={chart.points}
              currency={curr}
              accent={isLent ? colors.success : colors.primary}
            />
          ) : (
            <Text style={styles.progressLabel}>
              {t("finance.borrowing.mobile.noPaydown")}
            </Text>
          )}
          {(() => {
            const extraDetails = [
              ...(borrowing.dueAt && borrowing.establishedAt
                ? [
                    [
                      t("finance.borrowing.detail.establishedLabel"),
                      tz.format(borrowing.establishedAt),
                    ] as const,
                  ]
                : []),
              ...(borrowing.contactInfo?.trim()
                ? [
                    [
                      t("finance.borrowing.mobile.contactShort"),
                      borrowing.contactInfo.trim(),
                    ] as const,
                  ]
                : []),
            ]
            if (extraDetails.length === 0) return null
            return (
              <Card style={styles.heroCard}>
                <Text style={styles.progressLabel}>
                  {t("finance.borrowing.mobile.headerFallback")}
                </Text>
                {extraDetails.map(([key, value]) => (
                  <View key={key} style={[styles.metaSection, styles.metaRow]}>
                    <Text style={styles.detailKey}>{key}</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {value}
                    </Text>
                  </View>
                ))}
              </Card>
            )
          })()}
        </>
      )}
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
                  {
                    type: "button",
                    label: t("menu.aiAssistant"),
                    icon: { type: "sfSymbol", name: "sparkles" },
                    sharesBackground: false,
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      copilotSheet?.openCopilotSheet()
                    },
                  },
                ],
              }
            : {
                headerRight: () => (
                  <View style={styles.metaRow}>
                    <ActionMenu
                      title={
                        borrowing.counterparty ||
                        t("finance.borrowing.mobile.agreementFallback")
                      }
                      colorScheme={resolvedMode}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "edit") {
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
                    <AIHeaderButton testID="borrowing-detail-header-ai" />
                  </View>
                ),
              }),
        }}
      />

      <View style={styles.container}>
        <SectionList
          keyboardShouldPersistTaps="handled"
          sections={activeTab === "transactions" ? sections : []}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader()}
          onEndReached={() => {
            if (
              activeTab === "transactions" &&
              ledger.hasNextPage &&
              !ledger.isFetchingNextPage
            )
              void ledger.fetchNextPage()
          }}
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
          ListFooterComponent={
            activeTab === "transactions" && ledger.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : undefined
          }
          renderSectionHeader={({ section }) => {
            const firstCurrency = section.data[0]?.currency || baseCurrency
            const currency = section.data.every(
              (tx) => (tx.currency || baseCurrency) === firstCurrency
            )
              ? firstCurrency
              : baseCurrency
            const net = section.data.reduce(
              (sum, tx) =>
                sum +
                signedTransactionAmount(
                  tx,
                  Number(
                    (tx.currency || baseCurrency) === currency
                      ? tx.amount
                      : tx.amountInBase || NaN
                  )
                ),
              0
            )
            return (
              <DateSectionHeader
                insetHorizontal
                title={section.title}
                rightContent={
                  Number.isFinite(net) && (
                    <MonoAmount size="sm" amount={net} colored>
                      {tz.formatMoney(net, currency, { showSign: true })}
                    </MonoAmount>
                  )
                }
              />
            )
          }}
          renderItem={({ item, index, section }) => (
            <TransactionListItem
              showDate={false}
              showBorderBottom={index < section.data.length - 1}
              item={item}
              baseCurrency={baseCurrency}
              account={
                item.accountId ? accountsMap.get(item.accountId) : undefined
              }
              onPress={() => {
                haptics.light()
                if (item.id)
                  router.push(`/(app)/finance/transactions/${item.id}`)
              }}
            />
          )}
          ListEmptyComponent={
            activeTab !== "transactions" ? undefined : isTxnsLoading ? (
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
    minWidth: 44,
    minHeight: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
    borderRadius: t.radius.lg,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  heroTitleCol: {
    flex: 1,
    gap: 3,
  },
  badgesCol: {
    alignItems: "flex-end" as const,
    gap: 4,
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
    fontVariant: ["tabular-nums" as const],
    fontSize: 11,
    color: t.colors.textMuted,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.surfaceSubtle,
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
  detailKey: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
    flex: 1,
    textAlign: "right" as const,
  },
  actionsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  kpiCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    gap: 12,
  },
  kpiRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  kpiRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    paddingTop: 12,
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  kpiCellRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.colors.border,
    paddingLeft: 12,
  },
  actionBtnPrimary: {
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    flexGrow: 1,
    flexBasis: 96,
    minHeight: 44,
    overflow: "hidden" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.primary,
    paddingHorizontal: 8,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
    flexShrink: 1,
  },
  actionBtnSecondary: {
    flexGrow: 1,
    flexBasis: 88,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 5,
    minHeight: 44,
    overflow: "hidden" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    paddingHorizontal: 8,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  underlineTabBar: {
    flexDirection: "row" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    gap: 20,
  },
  underlineTab: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  underlineTabSelected: {
    borderBottomColor: t.colors.primary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  tabLabelSelected: {
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
  },
  tabCountBadgeSelected: {
    backgroundColor: t.colors.primarySubtle,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    fontVariant: ["tabular-nums" as const],
  },
  tabCountTextSelected: {
    color: t.colors.primary,
  },
  emptyWrap: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
})
