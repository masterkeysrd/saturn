import { useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  TextInput as RNTextInput,
  Alert,
  Platform,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  HandCoins,
  Plus,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarClock,
  MoreVertical,
  Search,
  X,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "../../../components/ui/action-menu"
import {
  useListBorrowingsQuery,
  useDeleteBorrowingMutation,
  useGetSettingsQuery,
  useListExchangeRatesQuery,
  type Borrowing,
} from "@saturn/api/saturn/finance/v1/finance"
import { convertCentsToBase, getDaysDiff } from "@saturn/core"
import { invalidateFinanceQueries, useTimezone, useI18n } from "@saturn/hooks"
import { useSpace } from "../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../lib/theme"
import { haptics } from "../../../lib/haptics"
import { Card } from "../../../components/ui/card"
import { Badge } from "../../../components/ui/badge"
import { MonoAmount } from "../../../components/ui/typography"
import { EmptyState } from "../../../components/ui/empty-state"
import { SkeletonCard } from "../../../components/ui/skeleton-loader"
import { useToast } from "../../../components/ui/toast"

import {
  useMobileCopilotView,
  useOptionalMobileCopilotSheet,
} from "../../../lib/copilot-sheet-context"
import { AIHeaderButton } from "../../../components/app-header"

type FilterTab = "ALL" | "LENT" | "BORROWED" | "SETTLED"

// Cross-platform menu icons
const detailsIcon = Icon.select({
  ios: "doc.text.magnifyingglass",
  android: require("@expo/material-symbols/visibility.xml"),
})

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
const isAgreementSettled = (b: Borrowing) =>
  b.status === "PAID_OFF" || Number(b.remainingAmount || 0) <= 0
export default function BorrowingScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors, resolvedMode } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL")

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const copilotSheet = useOptionalMobileCopilotSheet()
  useMobileCopilotView({
    viewId: "mobile.finance.borrowing",
    title: t("finance.borrowing.copilotTitle"),
    suggestions: [
      t("finance.borrowing.suggestion.balances"),
      t("finance.borrowing.suggestion.overdue"),
      t("finance.borrowing.suggestion.priorities"),
    ],
  })
  const isSearchVisible = searchOpen || searchQuery.trim().length > 0

  const toggleSearch = () => {
    haptics.selection()
    if (isSearchVisible) {
      setSearchOpen(false)
      setSearchQuery("")
    } else {
      setSearchOpen(true)
    }
  }
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const exchangeRates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )

  const {
    data: borrowingsData,
    isLoading,
    refetch,
  } = useListBorrowingsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const deleteBorrowingMutation = useDeleteBorrowingMutation()

  const borrowings: Borrowing[] = useMemo(
    () => borrowingsData?.borrowings || [],
    [borrowingsData?.borrowings]
  )

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
      await invalidateFinanceQueries(queryClient)
    } finally {
      setRefreshing(false)
    }
  }

  // Summary Metrics (converted to workspace base currency)
  const { totalLentCents, totalBorrowedCents, netPositionCents } =
    useMemo(() => {
      let lent = 0
      let borrowed = 0

      borrowings.forEach((b) => {
        if (!isAgreementSettled(b)) {
          const remBase = convertCentsToBase(
            b.remainingAmount,
            b.currency,
            baseCurrency,
            exchangeRates
          )
          if (b.direction === "LENT") {
            lent += remBase
          } else if (b.direction === "BORROWED") {
            borrowed += remBase
          }
        }
      })

      return {
        totalLentCents: lent,
        totalBorrowedCents: borrowed,
        netPositionCents: lent - borrowed,
      }
    }, [borrowings, baseCurrency, exchangeRates])

  const filteredBorrowings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return borrowings
      .filter(
        (b) =>
          (activeTab === "ALL" ||
            (activeTab === "SETTLED"
              ? isAgreementSettled(b)
              : !isAgreementSettled(b) && b.direction === activeTab)) &&
          [b.counterparty, b.contactInfo, b.currency, b.notes].some(
            (value) => !query || value?.toLowerCase().includes(query)
          )
      )
      .sort((a, b) => {
        if (isAgreementSettled(a) !== isAgreementSettled(b))
          return Number(isAgreementSettled(a)) - Number(isAgreementSettled(b))
        const name = (a.counterparty || "").localeCompare(b.counterparty || "")
        if (isAgreementSettled(a))
          return (
            Date.parse(b.establishedAt) - Date.parse(a.establishedAt) || name
          )
        return (
          (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
            (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
          convertCentsToBase(
            b.remainingAmount,
            b.currency,
            baseCurrency,
            exchangeRates
          ) -
            convertCentsToBase(
              a.remainingAmount,
              a.currency,
              baseCurrency,
              exchangeRates
            ) ||
          name
        )
      })
  }, [borrowings, activeTab, searchQuery, baseCurrency, exchangeRates])
  // Tab counts
  const tabCounts = useMemo(() => {
    let all = borrowings.length
    let lent = 0
    let borrowed = 0
    let settled = 0

    borrowings.forEach((b) => {
      const isSettled = isAgreementSettled(b)
      if (isSettled) {
        settled++
      } else if (b.direction === "LENT") {
        lent++
      } else if (b.direction === "BORROWED") {
        borrowed++
      }
    })

    return { all, lent, borrowed, settled }
  }, [borrowings])

  // Delete Action
  const handleDeleteBorrowing = (b: Borrowing) => {
    haptics.warning()
    Alert.alert(
      t("finance.borrowing.delete.title"),
      t("finance.borrowing.delete.description", {
        name: b.counterparty || "",
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBorrowingMutation.mutateAsync({
                id: b.id || "",
                req: { id: b.id || "" },
              })
              haptics.success()
              toast.show({
                title: t("finance.borrowing.delete.deletedTitle"),
                message: t("finance.borrowing.delete.deletedDescription", {
                  name: b.counterparty || "",
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
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

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: t("finance.borrowing.mobile.headerTitle"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button",
                    label: t("finance.borrowing.mobile.newAgreement"),
                    icon: { type: "sfSymbol", name: "plus" },
                    tintColor: colors.primary,
                    onPress: () => {
                      haptics.light()
                      router.push("/modal/manage-borrowing")
                    },
                  },
                  {
                    type: "button",
                    label: t("menu.aiAssistant"),
                    icon: { type: "sfSymbol", name: "sparkles" },
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
                  <View style={styles.headerRightRow}>
                    <TouchableOpacity
                      testID="borrowing-header-add"
                      accessibilityLabel={t(
                        "finance.borrowing.mobile.newAgreement"
                      )}
                      onPress={() => {
                        haptics.light()
                        router.push("/modal/manage-borrowing")
                      }}
                      style={styles.headerIconBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Plus size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <AIHeaderButton testID="borrowing-header-ai" />
                  </View>
                ),
              }),
        }}
      />
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      >
        {borrowings.length > 0 && (
          <Card style={styles.summaryCard}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.title}>
                  {t("finance.borrowing.mobile.netPosition")}
                </Text>
                <Text style={styles.caption}>
                  {t(
                    netPositionCents >= 0
                      ? "finance.borrowing.mobile.netCreditor"
                      : "finance.borrowing.mobile.netDebtor"
                  )}
                </Text>
              </View>
              <MonoAmount
                size="lg"
                style={styles.shrink}
                adjustsFontSizeToFit
                numberOfLines={1}
                color={
                  netPositionCents >= 0 ? colors.success : colors.destructive
                }
              >
                {netPositionCents >= 0 ? "+" : ""}
                {tz.formatMoney(netPositionCents, baseCurrency)}
              </MonoAmount>
            </View>
            <View style={[styles.row, styles.split]}>
              {([true, false] as const).map((lent) => {
                const Direction = lent ? TrendingUp : TrendingDown
                const color = lent ? colors.success : colors.warning
                return (
                  <View
                    key={String(lent)}
                    style={[styles.grow, !lent && styles.divider]}
                  >
                    <View style={styles.row}>
                      <Direction size={14} color={color} />
                      <Text style={styles.caption}>
                        {t(
                          lent
                            ? "finance.borrowing.mobile.owedToMe"
                            : "finance.borrowing.mobile.iOwe"
                        )}
                      </Text>
                    </View>
                    <MonoAmount
                      size="md"
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      color={color}
                    >
                      {tz.formatMoney(
                        lent ? totalLentCents : totalBorrowedCents,
                        baseCurrency
                      )}
                    </MonoAmount>
                    <Text style={styles.caption}>
                      {t(
                        lent
                          ? "finance.borrowing.mobile.activeLends"
                          : "finance.borrowing.mobile.activeLoans",
                        { count: lent ? tabCounts.lent : tabCounts.borrowed }
                      )}
                    </Text>
                  </View>
                )
              })}
            </View>
          </Card>
        )}
        <View style={styles.filterToolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                {
                  key: "ALL",
                  label: t("finance.borrowing.mobile.tabAll", {
                    count: tabCounts.all,
                  }),
                },
                {
                  key: "LENT",
                  label:
                    tabCounts.lent > 0
                      ? t("finance.borrowing.mobile.tabOwedToMe", {
                          count: tabCounts.lent,
                        })
                      : t("finance.borrowing.mobile.owedToMe"),
                },
                {
                  key: "BORROWED",
                  label:
                    tabCounts.borrowed > 0
                      ? t("finance.borrowing.mobile.tabIOwe", {
                          count: tabCounts.borrowed,
                        })
                      : t("finance.borrowing.mobile.iOwe"),
                },
                {
                  key: "SETTLED",
                  label:
                    tabCounts.settled > 0
                      ? t("finance.borrowing.mobile.tabSettled", {
                          count: tabCounts.settled,
                        })
                      : t("finance.borrowing.mobile.badgeSettled"),
                },
              ] as const
            ).map((filter) => {
              const isSelected = activeTab === filter.key
              return (
                <TouchableOpacity
                  key={filter.key}
                  testID={`borrowing-filter-${filter.key.toLowerCase()}`}
                  style={[
                    styles.filterPill,
                    isSelected && styles.filterPillActive,
                  ]}
                  onPress={() => {
                    haptics.selection()
                    setActiveTab(filter.key)
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      isSelected && styles.filterPillTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <TouchableOpacity
            testID="borrowing-inline-search-toggle"
            accessibilityLabel={t("finance.borrowing.searchPlaceholder")}
            style={[
              styles.inlineSearchBtn,
              isSearchVisible && styles.inlineSearchBtnActive,
            ]}
            hitSlop={4}
            onPress={toggleSearch}
            activeOpacity={0.7}
          >
            {isSearchVisible ? (
              <X size={15} color={colors.primary} />
            ) : (
              <Search size={15} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        {isSearchVisible ? (
          <View style={styles.searchBar} testID="borrowing-search-bar">
            <Search size={15} color={colors.textMuted} />
            <RNTextInput
              style={styles.searchInput}
              placeholder={t("finance.borrowing.searchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={resolvedMode === "dark" ? "dark" : "light"}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={searchOpen}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                accessibilityLabel={t("finance.transactions.clearSearchAria")}
                onPress={() => {
                  haptics.selection()
                  setSearchQuery("")
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
          </View>
        ) : filteredBorrowings.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={32} color={colors.textMuted} />}
            title={
              searchQuery.trim()
                ? t("finance.transactions.noMatches")
                : activeTab === "SETTLED"
                  ? t("finance.borrowing.mobile.emptySettledTitle")
                  : activeTab === "LENT"
                    ? t("finance.borrowing.mobile.emptyLentTitle")
                    : activeTab === "BORROWED"
                      ? t("finance.borrowing.mobile.emptyBorrowedTitle")
                      : t("finance.borrowing.mobile.emptyAllTitle")
            }
            description={
              !searchQuery.trim() && activeTab === "ALL"
                ? t("finance.borrowing.mobile.emptyAllDesc")
                : t("finance.borrowing.mobile.emptyFilterDesc")
            }
            actionLabel={
              searchQuery.trim()
                ? t("finance.transactions.clearSearchAria")
                : activeTab !== "ALL"
                  ? t("common.clearFilters")
                  : t("finance.borrowing.recordBorrowing")
            }
            onAction={() => {
              haptics.selection()
              if (searchQuery.trim()) setSearchQuery("")
              else if (activeTab !== "ALL") setActiveTab("ALL")
              else router.push("/modal/manage-borrowing")
            }}
          />
        ) : (
          <View>
            {filteredBorrowings.map((b) => {
              const isLent = b.direction === "LENT"
              const total = parseFloat(b.totalAmount || "0")
              const remaining = parseFloat(b.remainingAmount || "0")
              const isPaid = b.status === "PAID_OFF" || remaining <= 0
              const paidAmount = Math.max(0, total - remaining)
              const percentage =
                total > 0
                  ? Math.min(100, Math.max(0, (paidAmount / total) * 100))
                  : 100

              const daysDiff = getDaysDiff(b.dueAt, tz.timezone)
              const isOverdue = !isPaid && daysDiff !== null && daysDiff < 0
              const isDueToday = !isPaid && daysDiff === 0
              const isDueSoon =
                !isPaid && daysDiff !== null && daysDiff > 0 && daysDiff <= 7

              const curr = b.currency || baseCurrency

              const accent = isPaid
                ? colors.textMuted
                : isLent
                  ? colors.success
                  : colors.warning
              const Direction = isLent ? TrendingUp : TrendingDown
              return (
                <View key={b.id} style={styles.agreement}>
                  <TouchableOpacity
                    style={styles.agreementBody}
                    accessibilityRole="button"
                    accessibilityLabel={b.counterparty}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (b.id) {
                        haptics.light()
                        router.push(`/(app)/finance/borrowing/${b.id}`)
                      }
                    }}
                  >
                    <View style={[styles.row, styles.agreementHeaderRow]}>
                      <View
                        style={[
                          styles.cardIconBadge,
                          {
                            backgroundColor: isPaid
                              ? colors.surfaceSubtle
                              : isLent
                                ? colors.successSubtle
                                : colors.warningSubtle,
                          },
                        ]}
                      >
                        <Direction color={accent} size={18} />
                      </View>
                      <Text
                        style={[styles.grow, styles.title]}
                        numberOfLines={1}
                      >
                        {b.counterparty ||
                          t("finance.borrowing.mobile.unknownCounterparty")}
                      </Text>
                      <Badge
                        size="sm"
                        label={t(
                          isPaid
                            ? "finance.borrowing.mobile.badgeSettled"
                            : isLent
                              ? "finance.borrowing.filterLent"
                              : "finance.borrowing.filterBorrowed"
                        )}
                        bg={
                          isPaid
                            ? colors.surfaceSubtle
                            : isLent
                              ? colors.successSubtle
                              : colors.warningSubtle
                        }
                        color={accent}
                        border={
                          isPaid
                            ? colors.border
                            : isLent
                              ? colors.successBorder
                              : colors.warningBorder
                        }
                      />
                    </View>
                    <View style={styles.amountsRow}>
                      <MonoAmount
                        size="md"
                        color={accent}
                        style={styles.grow}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                      >
                        {tz.formatMoney(remaining, curr)}
                      </MonoAmount>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={[styles.caption, styles.shrink]}
                      >
                        {t("finance.borrowing.mobile.progressOf", {
                          paid: tz.formatMoney(paidAmount, curr),
                          total: tz.formatMoney(total, curr),
                        })}{" "}
                        ({percentage.toFixed(0)}%)
                      </Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        testID={`payoff-${b.id}`}
                        style={{
                          height: 6,
                          borderRadius: 3,
                          width: `${percentage}%`,
                          backgroundColor: isPaid
                            ? colors.textMuted
                            : isLent
                              ? colors.success
                              : colors.primary,
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <ActionMenu
                    title={
                      b.counterparty ||
                      t("finance.borrowing.mobile.agreementFallback")
                    }
                    colorScheme={resolvedMode}
                    style={styles.menuTriggerWrapper}
                    onPressAction={({ nativeEvent }) => {
                      if (nativeEvent.event === "details") {
                        if (!b.id) return
                        haptics.light()
                        router.push(`/(app)/finance/borrowing/${b.id}`)
                      } else if (nativeEvent.event === "pay") {
                        haptics.light()
                        router.push({
                          pathname: "/modal/add-transaction",
                          params: {
                            type: "BORROWING",
                            borrowingId: b.id,
                          },
                        })
                      } else if (nativeEvent.event === "adjust") {
                        haptics.light()
                        router.push({
                          pathname: "/modal/adjust-borrowing",
                          params: { borrowingId: b.id },
                        })
                      } else if (nativeEvent.event === "edit") {
                        haptics.light()
                        router.push({
                          pathname: "/modal/manage-borrowing",
                          params: { id: b.id },
                        })
                      } else if (nativeEvent.event === "delete") {
                        handleDeleteBorrowing(b)
                      }
                    }}
                    actions={[
                      {
                        id: "details",
                        title: t("finance.borrowing.mobile.menuViewDetails"),
                        image: detailsIcon,
                      },
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
                    <View style={styles.dotsBtn}>
                      <MoreVertical size={18} color={colors.textMuted} />
                    </View>
                  </ActionMenu>
                  <View style={styles.row}>
                    <View style={styles.grow}>
                      {b.dueAt ? (
                        <View style={styles.dueDateWrap}>
                          <CalendarClock
                            size={13}
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
                              styles.footerDueDateText,
                              isOverdue && styles.overdueText,
                              (isDueToday || isDueSoon) && styles.dueSoonText,
                            ]}
                          >
                            {isPaid
                              ? t("finance.borrowing.mobile.dueOn", {
                                  date: tz.format(b.dueAt),
                                })
                              : isOverdue
                                ? t("finance.borrowing.mobile.overdueBy", {
                                    days: Math.abs(daysDiff!),
                                    date: tz.format(b.dueAt),
                                  })
                                : isDueToday
                                  ? t("finance.borrowing.mobile.dueToday")
                                  : t("finance.borrowing.mobile.dueIn", {
                                      days: daysDiff ?? 0,
                                      date: tz.format(b.dueAt),
                                    })}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.dueDateWrap}>
                          <Calendar size={13} color={colors.textMuted} />
                          <Text style={styles.footerDateText}>
                            {t("finance.borrowing.mobile.startedOn", {
                              date: tz.format(b.establishedAt),
                            })}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!isPaid && (
                      <TouchableOpacity
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={styles.quickPayBtn}
                        onPress={() => {
                          haptics.light()
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "BORROWING",
                              borrowingId: b.id,
                            },
                          })
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickPayBtnText}>
                          {isLent
                            ? t("finance.borrowing.mobile.quickReceive")
                            : t("finance.borrowing.mobile.quickRepay")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  title: { fontWeight: "700" as const, color: t.colors.textPrimary },
  caption: { fontSize: 12, color: t.colors.textMuted },
  split: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    paddingTop: 10,
  },
  divider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    paddingLeft: 12,
  },
  agreement: {
    position: "relative" as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    paddingVertical: 14,
    gap: 10,
  },
  agreementBody: {
    gap: 8,
  },
  agreementHeaderRow: {
    paddingRight: 36,
  },
  amountsRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  summaryCard: {
    padding: 14,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    ...(!t.isDark ? t.shadows.sm : {}),
    gap: 4,
  },
  headerRightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  filterToolbar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  filterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  filterPill: {
    minHeight: 40,
    justifyContent: "center" as const,
    paddingHorizontal: 11,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
  },
  filterPillActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  filterPillTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  inlineSearchBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  inlineSearchBtnActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  searchBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: t.colors.textPrimary,
    padding: 0,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  menuTriggerWrapper: {
    position: "absolute" as const,
    right: -8,
    top: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dotsBtn: {
    width: 40,
    height: 40,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.surfaceHighlight,
    overflow: "hidden" as const,
  },
  dueDateWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  footerDueDateText: {
    fontSize: 11,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
  footerDateText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  overdueText: {
    color: t.colors.destructive,
    fontWeight: "700" as const,
  },
  dueSoonText: {
    color: t.colors.warning,
    fontWeight: "600" as const,
  },
  quickPayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.md,
    minHeight: 32,
    justifyContent: "center" as const,
    backgroundColor: t.colors.surfaceSubtle,
  },
  quickPayBtnText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
})
