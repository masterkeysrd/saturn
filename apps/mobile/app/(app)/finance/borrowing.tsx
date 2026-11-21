import { useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
  Scale,
} from "lucide-react-native"
import { Icon } from "@expo/ui"
import { ActionMenu } from "@/components/ui/action-menu"
import {
  useListBorrowingsQuery,
  useDeleteBorrowingMutation,
  useGetSettingsQuery,
  useListExchangeRatesQuery,
  type Borrowing,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  convertCentsToBase,
  formatAmount,
  parseDate,
  getDaysDiff,
  getTimezoneParts,
  formatDateWithTimezone,
} from "@saturn/core"
import { invalidateFinanceQueries, useTimezone, useI18n } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"

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
        if (b.status === "ACTIVE") {
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

  // Filtered List
  const filteredBorrowings = useMemo(() => {
    return borrowings.filter((b) => {
      const isSettled =
        b.status === "PAID_OFF" || parseFloat(b.remainingAmount || "0") === 0
      if (activeTab === "SETTLED") return isSettled
      if (activeTab === "LENT") return !isSettled && b.direction === "LENT"
      if (activeTab === "BORROWED")
        return !isSettled && b.direction === "BORROWED"
      return true
    })
  }, [borrowings, activeTab])

  // Tab counts
  const tabCounts = useMemo(() => {
    let all = borrowings.length
    let lent = 0
    let borrowed = 0
    let settled = 0

    borrowings.forEach((b) => {
      const isSettled =
        b.status === "PAID_OFF" || parseFloat(b.remainingAmount || "0") === 0
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
                ],
              }
            : {
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light()
                      router.push("/modal/manage-borrowing")
                    }}
                    style={styles.headerAddBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Plus size={20} color={colors.primary} />
                  </TouchableOpacity>
                ),
              }),
        }}
      />

      <ScrollView
        style={styles.container}
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
        {/* 1. Overview Financial Summary Cards */}
        <View style={styles.summaryGrid}>
          {/* Card A: Owed to Me (Lent) */}
          <Card style={[styles.summaryCard, { flex: 1 }]}>
            <View style={styles.summaryCardHeader}>
              <View
                style={[
                  styles.summaryIconBadge,
                  { backgroundColor: colors.successSubtle },
                ]}
              >
                <TrendingUp size={16} color={colors.success} />
              </View>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {t("finance.borrowing.mobile.owedToMe")}
              </Text>
            </View>
            <MonoAmount size="md" color={colors.success} numberOfLines={1}>
              {formatAmount(totalLentCents, baseCurrency)}
            </MonoAmount>
            <Text style={styles.summarySubtext}>
              {t("finance.borrowing.mobile.activeLends", {
                count: tabCounts.lent,
              })}
            </Text>
          </Card>

          {/* Card B: I Owe (Borrowed) */}
          <Card style={[styles.summaryCard, { flex: 1 }]}>
            <View style={styles.summaryCardHeader}>
              <View
                style={[
                  styles.summaryIconBadge,
                  { backgroundColor: colors.warningSubtle },
                ]}
              >
                <TrendingDown size={16} color={colors.warning} />
              </View>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {t("finance.borrowing.mobile.iOwe")}
              </Text>
            </View>
            <MonoAmount size="md" color={colors.warning} numberOfLines={1}>
              {formatAmount(totalBorrowedCents, baseCurrency)}
            </MonoAmount>
            <Text style={styles.summarySubtext}>
              {t("finance.borrowing.mobile.activeLoans", {
                count: tabCounts.borrowed,
              })}
            </Text>
          </Card>
        </View>

        {/* Card C: Net Debt Position */}
        <Card style={styles.netCard}>
          <View style={styles.netCardContent}>
            <View style={styles.netIconWrap}>
              <Scale
                size={18}
                color={
                  netPositionCents >= 0 ? colors.success : colors.destructive
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.netCardLabel}>
                {t("finance.borrowing.mobile.netPosition").toUpperCase()}
              </Text>
              <Text style={styles.netCardSublabel}>
                {netPositionCents >= 0
                  ? t("finance.borrowing.mobile.netCreditor")
                  : t("finance.borrowing.mobile.netDebtor")}
              </Text>
            </View>
            <MonoAmount
              size="md"
              color={
                netPositionCents >= 0 ? colors.success : colors.destructive
              }
            >
              {netPositionCents >= 0 ? "+" : ""}
              {formatAmount(netPositionCents, baseCurrency)}
            </MonoAmount>
          </View>
        </Card>

        {/* 2. Filter Tabs */}
        <View style={styles.filterTabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterTabsContent}
          >
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeTab === "ALL" && styles.filterTabActive,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab("ALL")
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === "ALL" && styles.filterTabTextActive,
                ]}
              >
                {t("finance.borrowing.mobile.tabAll", {
                  count: tabCounts.all,
                })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterTab,
                activeTab === "LENT" && styles.filterTabActive,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab("LENT")
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === "LENT" && styles.filterTabTextActive,
                ]}
              >
                {t("finance.borrowing.mobile.tabOwedToMe", {
                  count: tabCounts.lent,
                })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterTab,
                activeTab === "BORROWED" && styles.filterTabActive,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab("BORROWED")
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === "BORROWED" && styles.filterTabTextActive,
                ]}
              >
                {t("finance.borrowing.mobile.tabIOwe", {
                  count: tabCounts.borrowed,
                })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterTab,
                activeTab === "SETTLED" && styles.filterTabActive,
              ]}
              onPress={() => {
                haptics.selection()
                setActiveTab("SETTLED")
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === "SETTLED" && styles.filterTabTextActive,
                ]}
              >
                {t("finance.borrowing.mobile.tabSettled", {
                  count: tabCounts.settled,
                })}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* 3. Borrowing Cards List */}
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
              activeTab === "SETTLED"
                ? t("finance.borrowing.mobile.emptySettledTitle")
                : activeTab === "LENT"
                  ? t("finance.borrowing.mobile.emptyLentTitle")
                  : activeTab === "BORROWED"
                    ? t("finance.borrowing.mobile.emptyBorrowedTitle")
                    : t("finance.borrowing.mobile.emptyAllTitle")
            }
            description={
              activeTab === "ALL"
                ? t("finance.borrowing.mobile.emptyAllDesc")
                : t("finance.borrowing.mobile.emptyFilterDesc")
            }
            actionLabel={
              activeTab === "ALL"
                ? t("finance.borrowing.recordBorrowing")
                : undefined
            }
            onAction={
              activeTab === "ALL"
                ? () => router.push("/modal/manage-borrowing")
                : undefined
            }
          />
        ) : (
          <View style={{ gap: 12 }}>
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

              return (
                <Card key={b.id} style={styles.borrowingCard}>
                  {/* Card Top: Direction Badge, Title, Menu */}
                  <View style={styles.cardHeaderRow}>
                    <TouchableOpacity
                      style={styles.cardHeaderLeft}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!b.id) return
                        haptics.light()
                        router.push(`/(app)/finance/borrowing/${b.id}`)
                      }}
                    >
                      <View
                        style={[
                          styles.cardIconBadge,
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
                            size={18}
                            color={isPaid ? colors.textMuted : colors.success}
                          />
                        ) : (
                          <TrendingDown
                            size={18}
                            color={isPaid ? colors.textMuted : colors.warning}
                          />
                        )}
                      </View>

                      <View style={styles.cardTitleCol}>
                        <View style={styles.nameBadgeRow}>
                          <Text
                            style={styles.counterpartyText}
                            numberOfLines={1}
                          >
                            {b.counterparty ||
                              t("finance.borrowing.mobile.unknownCounterparty")}
                          </Text>
                          <Badge
                            size="sm"
                            label={
                              isLent
                                ? t("finance.borrowing.mobile.badgeOwedToYou")
                                : t("finance.borrowing.mobile.badgeYouOwe")
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
                        </View>
                        {b.contactInfo ? (
                          <Text
                            style={styles.contactInfoText}
                            numberOfLines={1}
                          >
                            {b.contactInfo}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {/* 3-dots native popup menu */}
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
                  </View>

                  {/* Financial Stats Row */}
                  <TouchableOpacity
                    style={styles.cardFinancialRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!b.id) return
                      haptics.light()
                      router.push(`/(app)/finance/borrowing/${b.id}`)
                    }}
                  >
                    <View>
                      <Text style={styles.financialStatLabel}>
                        {isPaid
                          ? t(
                              "finance.borrowing.mobile.finalSettled"
                            ).toUpperCase()
                          : t(
                              "finance.borrowing.remainingBalance"
                            ).toUpperCase()}
                      </Text>
                      <MonoAmount
                        size="lg"
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
                      <Text style={styles.financialStatLabel}>
                        {t("finance.borrowing.mobile.principal").toUpperCase()}
                      </Text>
                      <MonoAmount size="sm" color={colors.textMuted}>
                        {formatAmount(total, curr)}
                      </MonoAmount>
                    </View>
                  </TouchableOpacity>

                  {/* Payoff Progress Bar */}
                  <TouchableOpacity
                    style={styles.progressContainer}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!b.id) return
                      haptics.light()
                      router.push(`/(app)/finance/borrowing/${b.id}`)
                    }}
                  >
                    <View style={styles.progressHeaderRow}>
                      <Text style={styles.progressLabel}>
                        {isPaid
                          ? t("finance.borrowing.mobile.repaidSettled")
                          : t("finance.borrowing.mobile.payoffProgress", {
                              pct: percentage.toFixed(0),
                            })}
                      </Text>
                      <Text style={styles.progressAmounts}>
                        {t("finance.borrowing.mobile.paidAmount", {
                          amount: formatAmount(paidAmount, curr),
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
                  </TouchableOpacity>

                  {/* Due Date & Meta Footer */}
                  <View style={styles.cardFooter}>
                    <TouchableOpacity
                      style={styles.footerLeft}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!b.id) return
                        haptics.light()
                        router.push(`/(app)/finance/borrowing/${b.id}`)
                      }}
                    >
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
                                  date: formatDate(b.dueAt, tz.timezone),
                                })
                              : isOverdue
                                ? t("finance.borrowing.mobile.overdueBy", {
                                    days: Math.abs(daysDiff!),
                                    date: formatDate(b.dueAt, tz.timezone),
                                  })
                                : isDueToday
                                  ? t("finance.borrowing.mobile.dueToday")
                                  : t("finance.borrowing.mobile.dueIn", {
                                      days: daysDiff ?? 0,
                                      date: formatDate(b.dueAt, tz.timezone),
                                    })}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.dueDateWrap}>
                          <Calendar size={13} color={colors.textMuted} />
                          <Text style={styles.footerDateText}>
                            {t("finance.borrowing.mobile.startedOn", {
                              date: formatDate(b.establishedAt, tz.timezone),
                            })}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Quick action button */}
                    {!isPaid && (
                      <TouchableOpacity
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
                </Card>
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
  headerAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  summaryGrid: {
    flexDirection: "row" as const,
    gap: 12,
  },
  summaryCard: {
    padding: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 4,
  },
  summaryCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 2,
  },
  summaryIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    flex: 1,
  },
  summarySubtext: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  netCard: {
    padding: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  netCardContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  netIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  netCardLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.5,
  },
  netCardSublabel: {
    fontSize: 11,
    color: t.colors.textSecondary,
    marginTop: 2,
  },
  filterTabsRow: {
    marginHorizontal: -16,
    paddingVertical: 4,
  },
  filterTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterTabActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  filterTabTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  borrowingCard: {
    padding: 14,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  cardHeaderLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
  },
  nameBadgeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flexWrap: "wrap" as const,
  },
  counterpartyText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  contactInfoText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  menuTriggerWrapper: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cardFinancialRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 2,
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
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  progressAmounts: {
    fontSize: 11,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.border,
    overflow: "hidden" as const,
  },
  progressBarFill: {
    height: "100%" as const,
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  footerLeft: {
    flex: 1,
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
    paddingVertical: 5,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  quickPayBtnText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
})
