import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
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
import { MenuView } from "@expo/ui/community/menu"
import {
  useListBorrowingsQuery,
  useDeleteBorrowingMutation,
  useGetFinanceSettingsQuery,
  type Borrowing,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount, formatCents } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MonoAmount } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { useToast } from "@/components/ui/toast"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

type FilterTab = "ALL" | "LENT" | "BORROWED" | "SETTLED"

// Cross-platform menu icons
const paymentIcon = Icon.select({
  ios: "dollarsign.circle",
  android: require("@expo/material-symbols/payments.xml"),
})

const editIcon = Icon.select({
  ios: "pencil",
  android: require("@expo/material-symbols/edit.xml"),
})

const deleteIcon = Icon.select({
  ios: "trash",
  android: require("@expo/material-symbols/delete.xml"),
})

function getDaysDiff(dateStr?: string): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffTime = target.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  })
}

export default function BorrowingScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL")

  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const {
    data: borrowingsData,
    isLoading,
    refetch,
  } = useListBorrowingsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const deleteBorrowingMutation = useDeleteBorrowingMutation()

  const borrowings: Borrowing[] = borrowingsData?.borrowings || []

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

  // Summary Metrics
  const { totalLentCents, totalBorrowedCents, netPositionCents } =
    useMemo(() => {
      let lent = 0
      let borrowed = 0

      borrowings.forEach((b) => {
        if (b.status === "ACTIVE") {
          const rem = parseFloat(b.remainingAmount || "0")
          if (b.direction === "LENT") {
            lent += rem
          } else if (b.direction === "BORROWED") {
            borrowed += rem
          }
        }
      })

      return {
        totalLentCents: lent,
        totalBorrowedCents: borrowed,
        netPositionCents: lent - borrowed,
      }
    }, [borrowings])

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
      "Delete Debt Agreement",
      `Are you sure you want to delete this record with "${b.counterparty}"? All logged transactions and repayments will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBorrowingMutation.mutateAsync({
                id: b.id || "",
                req: { id: b.id || "" },
              })
              haptics.success()
              toast.show({
                title: "Agreement Deleted",
                message: `Record with ${b.counterparty} was removed.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
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

  return (
    <View style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerTitle: "Debts & Loans",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push("/modal/manage-borrowing")
              }}
              style={styles.headerAddBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Plus size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
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
                  { backgroundColor: theme.colors.successSubtle },
                ]}
              >
                <TrendingUp size={16} color={theme.colors.success} />
              </View>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                Owed to Me
              </Text>
            </View>
            <MonoAmount
              size="md"
              color={theme.colors.success}
              numberOfLines={1}
            >
              {formatAmount(totalLentCents, baseCurrency)}
            </MonoAmount>
            <Text style={styles.summarySubtext}>
              {tabCounts.lent} active lend(s)
            </Text>
          </Card>

          {/* Card B: I Owe (Borrowed) */}
          <Card style={[styles.summaryCard, { flex: 1 }]}>
            <View style={styles.summaryCardHeader}>
              <View
                style={[
                  styles.summaryIconBadge,
                  { backgroundColor: "rgba(245, 158, 11, 0.15)" },
                ]}
              >
                <TrendingDown size={16} color="#f59e0b" />
              </View>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                I Owe
              </Text>
            </View>
            <MonoAmount size="md" color="#f59e0b" numberOfLines={1}>
              {formatAmount(totalBorrowedCents, baseCurrency)}
            </MonoAmount>
            <Text style={styles.summarySubtext}>
              {tabCounts.borrowed} active loan(s)
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
                  netPositionCents >= 0
                    ? theme.colors.success
                    : theme.colors.destructive
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.netCardLabel}>NET POSITION</Text>
              <Text style={styles.netCardSublabel}>
                {netPositionCents >= 0
                  ? "Net Creditor • You are owed more than you owe"
                  : "Net Debtor • You owe more than you are owed"}
              </Text>
            </View>
            <MonoAmount
              size="md"
              color={
                netPositionCents >= 0
                  ? theme.colors.success
                  : theme.colors.destructive
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
                All ({tabCounts.all})
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
                Owed to Me ({tabCounts.lent})
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
                I Owe ({tabCounts.borrowed})
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
                Settled ({tabCounts.settled})
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
            icon={<HandCoins size={32} color={theme.colors.textMuted} />}
            title={
              activeTab === "SETTLED"
                ? "No settled debts"
                : activeTab === "LENT"
                  ? "No money lent"
                  : activeTab === "BORROWED"
                    ? "No money borrowed"
                    : "No debts or loans"
            }
            description={
              activeTab === "ALL"
                ? "Track informal lends and borrows with friends, family, and contacts."
                : "No records found matching this filter."
            }
            actionLabel={
              activeTab === "ALL" ? "Record Debt or Loan" : undefined
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

              const daysDiff = getDaysDiff(b.dueAt)
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
                        haptics.light()
                        router.push({
                          pathname: "/modal/add-transaction",
                          params: {
                            type: "BORROWING",
                            borrowingId: b.id,
                          },
                        })
                      }}
                    >
                      <View
                        style={[
                          styles.cardIconBadge,
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
                            size={18}
                            color={
                              isPaid
                                ? theme.colors.textMuted
                                : theme.colors.success
                            }
                          />
                        ) : (
                          <TrendingDown
                            size={18}
                            color={isPaid ? theme.colors.textMuted : "#f59e0b"}
                          />
                        )}
                      </View>

                      <View style={styles.cardTitleCol}>
                        <View style={styles.nameBadgeRow}>
                          <Text
                            style={styles.counterpartyText}
                            numberOfLines={1}
                          >
                            {b.counterparty || "Unknown"}
                          </Text>
                          <Badge
                            size="sm"
                            label={isLent ? "Owed to you" : "You owe"}
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
                    <MenuView
                      title={b.counterparty || "Agreement"}
                      colorScheme="dark"
                      style={styles.menuTriggerWrapper}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === "pay") {
                          haptics.light()
                          router.push({
                            pathname: "/modal/add-transaction",
                            params: {
                              type: "BORROWING",
                              borrowingId: b.id,
                            },
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
                      <View style={styles.dotsBtn}>
                        <MoreVertical
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </View>
                    </MenuView>
                  </View>

                  {/* Financial Stats Row */}
                  <TouchableOpacity
                    style={styles.cardFinancialRow}
                    activeOpacity={0.7}
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
                  >
                    <View>
                      <Text style={styles.financialStatLabel}>
                        {isPaid ? "FINAL SETTLED" : "REMAINING BALANCE"}
                      </Text>
                      <MonoAmount
                        size="lg"
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
                      <Text style={styles.financialStatLabel}>PRINCIPAL</Text>
                      <MonoAmount size="sm" color={theme.colors.textMuted}>
                        {formatAmount(total, curr)}
                      </MonoAmount>
                    </View>
                  </TouchableOpacity>

                  {/* Payoff Progress Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressHeaderRow}>
                      <Text style={styles.progressLabel}>
                        {isPaid
                          ? "100% Repaid • Agreement Settled"
                          : `Payoff Progress • ${percentage.toFixed(0)}%`}
                      </Text>
                      <Text style={styles.progressAmounts}>
                        {formatAmount(paidAmount, curr)} paid
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

                  {/* Due Date & Meta Footer */}
                  <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                      {b.dueAt ? (
                        <View style={styles.dueDateWrap}>
                          <CalendarClock
                            size={13}
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
                              styles.footerDueDateText,
                              isOverdue && styles.overdueText,
                              (isDueToday || isDueSoon) && styles.dueSoonText,
                            ]}
                          >
                            {isPaid
                              ? `Due ${formatDate(b.dueAt)}`
                              : isOverdue
                                ? `Overdue by ${Math.abs(daysDiff!)}d (${formatDate(b.dueAt)})`
                                : isDueToday
                                  ? "Due Today"
                                  : `Due in ${daysDiff}d (${formatDate(b.dueAt)})`}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.dueDateWrap}>
                          <Calendar size={13} color={theme.colors.textMuted} />
                          <Text style={styles.footerDateText}>
                            Started {formatDate(b.establishedAt)}
                          </Text>
                        </View>
                      )}
                    </View>

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
                          {isLent ? "Receive" : "Repay"}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  summaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  summaryIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    flex: 1,
  },
  summarySubtext: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  netCard: {
    padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  netCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  netIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  netCardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  netCardSublabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
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
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterTabActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  filterTabTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  borrowingCard: {
    padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
  },
  nameBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  counterpartyText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  contactInfoText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  menuTriggerWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFinancialRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingVertical: 2,
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
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  progressAmounts: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  footerLeft: {
    flex: 1,
  },
  dueDateWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerDueDateText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  footerDateText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  overdueText: {
    color: theme.colors.destructive,
    fontWeight: "700",
  },
  dueSoonText: {
    color: "#f59e0b",
    fontWeight: "600",
  },
  quickPayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  quickPayBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
})
