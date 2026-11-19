import React, { useState, useMemo, useRef, useCallback } from "react"
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import { useInfiniteQuery } from "@tanstack/react-query"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import {
  Search,
  Plus,
  ReceiptText,
  X,
  SlidersHorizontal,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react-native"
import {
  listTransactions,
  useListAccountsQuery,
  useListBudgetsQuery,
  useGetSettingsQuery,
  type Transaction,
  type Transaction_Type,
  type Account,
  type Budget,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  formatYm,
  groupTransactionsByDate,
  parseYm,
  resolveFinancePeriodBounds,
  shiftYearMonth,
  type FinancePeriodPreset,
} from "@saturn/core"
import { useDebounce, useTimezone } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { DateSectionHeader } from "@/components/finance/date-section-header"
import { BaseTextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"

export default function TransactionsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()

  // State
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [selectedType, setSelectedType] = useState<string>("")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("")
  const [period, setPeriod] = useState<FinancePeriodPreset>("this_month")
  const [selectedMonth, setSelectedMonth] = useState<string>("")

  const now = tz.now()
  const nowParts = tz.parts(now)
  const nowYear = nowParts?.year ?? now.getUTCFullYear()
  const nowMonth = nowParts?.month ?? now.getUTCMonth() + 1
  const currentMonthYm = formatYm(nowYear, nowMonth)
  const [pickerYear, setPickerYear] = useState<number>(nowYear)

  const periodBounds = useMemo(
    () =>
      resolveFinancePeriodBounds(
        {
          period,
          month: selectedMonth,
          dateFrom: "",
          dateTo: "",
        },
        now,
        tz.timezone,
        tz.locale
      ),
    [period, selectedMonth, now, tz.timezone, tz.locale]
  )

  const shortMonthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(tz.locale, {
      month: "short",
      timeZone: "UTC",
    })
    return Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      label: fmt.format(new Date(Date.UTC(2026, idx, 15, 12, 0, 0))),
    }))
  }, [tz.locale])

  const handleStepMonth = (delta: -1 | 1) => {
    haptics.selection()
    const active = parseYm(periodBounds.activeMonth)
    const baseYear = active ? active.year : nowYear
    const baseMonth = active ? active.month : nowMonth
    const next = shiftYearMonth(baseYear, baseMonth, delta)
    setPeriod("month")
    setSelectedMonth(formatYm(next.year, next.month))
    setPickerYear(next.year)
  }

  // BottomSheet Ref for Filters
  const filterSheetRef = useRef<BottomSheet>(null)

  // Queries
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
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

  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )
  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    budgets.forEach((b) => {
      if (b.id) map.set(b.id, b)
    })
    return map
  }, [budgets])

  // Keyset Infinite Query (server-side date & attribute filtering)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      "/api/v1/finance/transactions",
      activeSpaceId,
      debouncedSearch,
      selectedType,
      selectedAccountId,
      selectedBudgetId,
      periodBounds.startISO,
      periodBounds.endISO,
    ],
    queryFn: async ({ pageParam = "" }) => {
      return listTransactions({
        searchQuery: debouncedSearch.trim() || undefined,
        types: selectedType ? [selectedType as Transaction_Type] : undefined,
        accountId: selectedAccountId || undefined,
        budgetId: selectedBudgetId || undefined,
        startDate: periodBounds.startISO || undefined,
        endDate: periodBounds.endISO || undefined,
        pageSize: 20,
        pageToken: pageParam,
      })
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: !!activeSpaceId,
  })

  // Flattened Transactions
  const allTransactions = useMemo(() => {
    return data?.pages.flatMap((page) => page.transactions || []) || []
  }, [data])

  // Grouped into Sections by Date
  const sections = useMemo(
    () => groupTransactionsByDate(allTransactions, tz.timezone),
    [allTransactions, tz.timezone]
  )

  const activeFilterCount =
    (selectedType ? 1 : 0) +
    (selectedAccountId ? 1 : 0) +
    (selectedBudgetId ? 1 : 0)

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const handleOpenDetail = useCallback(
    (tx: Transaction) => {
      if (!tx.id) return
      haptics.light()
      router.push(`/(app)/finance/transactions/${tx.id}`)
    },
    [router]
  )

  const clearAllFilters = () => {
    haptics.light()
    setSelectedType("")
    setSelectedAccountId("")
    setSelectedBudgetId("")
    setPeriod("this_month")
    setSelectedMonth("")
    setPickerYear(nowYear)
    setSearch("")
  }

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <DateSectionHeader title={title} insetHorizontal={false} />
    ),
    []
  )

  const renderTransactionRow = useCallback(
    ({ item }: { item: Transaction }) => {
      return (
        <Card style={styles.transactionCardWrapper}>
          <TransactionListItem
            item={item}
            baseCurrency={baseCurrency}
            account={
              item.accountId ? accountsMap.get(item.accountId) : undefined
            }
            budget={item.budgetId ? budgetsMap.get(item.budgetId) : undefined}
            onPress={() => handleOpenDetail(item)}
            showBorderBottom={false}
            showDate={false}
          />
        </Card>
      )
    },
    [accountsMap, budgetsMap, baseCurrency, handleOpenDetail]
  )

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.headerBlock}>
        <View style={styles.searchBarRow}>
          <View style={styles.searchWrapper}>
            <BaseTextInput
              placeholder="Search by merchant or description..."
              value={search}
              onChangeText={setSearch}
              leftIcon={<Search size={18} color={theme.colors.textMuted} />}
              inputContainerStyle={{ minHeight: 44 }}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.filterButton,
              activeFilterCount > 0 && styles.filterButtonActive,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              filterSheetRef.current?.expand()
            }}
          >
            <SlidersHorizontal
              size={18}
              color={
                activeFilterCount > 0
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Month Stepper + Contextual Active Filter Chips */}
        <View style={styles.periodAndChipsRow}>
          <View style={styles.monthStepper}>
            <TouchableOpacity
              accessibilityLabel="Previous month"
              style={styles.monthStepBtn}
              onPress={() => handleStepMonth(-1)}
              activeOpacity={0.7}
            >
              <ChevronLeft size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Select period"
              style={styles.monthCenterBtn}
              onPress={() => {
                haptics.light()
                const active = parseYm(periodBounds.activeMonth)
                if (active) setPickerYear(active.year)
                filterSheetRef.current?.expand()
              }}
              activeOpacity={0.7}
            >
              <CalendarIcon size={13} color={theme.colors.textMuted} />
              <Text style={styles.monthCenterText}>{periodBounds.label}</Text>
              <ChevronDown size={13} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Next month"
              style={styles.monthStepBtn}
              onPress={() => handleStepMonth(1)}
              activeOpacity={0.7}
            >
              <ChevronRight size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedType ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedType("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {selectedType === "EXPENSE" ? "Expenses" : "Income"}
              </Text>
              <X size={12} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : null}

          {selectedAccountId ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedAccountId("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {accountsMap.get(selectedAccountId)?.name || "Account"}
              </Text>
              <X size={12} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : null}

          {selectedBudgetId ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedBudgetId("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {budgetsMap.get(selectedBudgetId)?.name || "Budget"}
              </Text>
              <X size={12} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Infinite Keyset Feed */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => item.id || String(index)}
          renderItem={renderTransactionRow}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage()
            }
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surfaceElevated}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.footerLoaderText}>
                  Loading more transactions...
                </Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon={<ReceiptText size={32} color={theme.colors.textMuted} />}
              title="No transactions found"
              description={
                search || activeFilterCount > 0
                  ? "Try adjusting your search query or filters to find what you're looking for."
                  : "Start logging your income and expenses to view your live financial feed."
              }
              actionLabel={
                activeFilterCount > 0 ? "Reset Filters" : "Add Transaction"
              }
              onAction={
                activeFilterCount > 0
                  ? clearAllFilters
                  : () => router.push("/modal/add-transaction")
              }
            />
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => {
          haptics.medium()
          router.push("/modal/add-transaction")
        }}
      >
        <Plus size={24} color="#090d16" />
      </TouchableOpacity>

      {/* Filter Bottom Sheet */}
      <AppBottomSheet
        ref={filterSheetRef}
        snapPoints={["78%"]}
        title="Filter Transactions"
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.filterSheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Period & Quick Month Grid */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Period</Text>
            <View style={styles.filterPillsContainer}>
              {(
                [
                  { label: "This Month", value: "this_month" },
                  { label: "Last Month", value: "last_month" },
                  { label: "Last 3M", value: "3m" },
                  { label: "YTD", value: "ytd" },
                  { label: "All Time", value: "all" },
                ] as const
              ).map((preset) => {
                const isActive = periodBounds.period === preset.value
                return (
                  <TouchableOpacity
                    key={preset.value}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setPeriod(preset.value)
                      setSelectedMonth("")
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.monthGridCard}>
              <View style={styles.yearHeaderRow}>
                <TouchableOpacity
                  accessibilityLabel="Previous year"
                  style={styles.yearNavBtn}
                  onPress={() => {
                    haptics.selection()
                    setPickerYear((y) => y - 1)
                  }}
                >
                  <ChevronLeft size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.yearHeaderText}>{pickerYear}</Text>
                <TouchableOpacity
                  accessibilityLabel="Next year"
                  style={styles.yearNavBtn}
                  onPress={() => {
                    haptics.selection()
                    setPickerYear((y) => y + 1)
                  }}
                >
                  <ChevronRight size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.monthGrid}>
                {shortMonthNames.map((item) => {
                  const cellYm = formatYm(pickerYear, item.month)
                  const isActive = periodBounds.activeMonth === cellYm
                  const isCurrent = cellYm === currentMonthYm
                  return (
                    <TouchableOpacity
                      key={cellYm}
                      style={[
                        styles.monthCell,
                        isCurrent && !isActive && styles.monthCellCurrent,
                        isActive && styles.monthCellActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setPeriod("month")
                        setSelectedMonth(cellYm)
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.monthCellText,
                          isActive && styles.monthCellTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>

          {/* Flow Type Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Flow Type</Text>
            <View style={styles.filterOptionsRow}>
              {[
                { label: "All Types", value: "" },
                { label: "Expenses", value: "EXPENSE" },
                { label: "Income", value: "INCOME" },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.filterOptionBtn,
                    selectedType === opt.value && styles.filterOptionBtnActive,
                  ]}
                  onPress={() => {
                    haptics.light()
                    setSelectedType(opt.value)
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      selectedType === opt.value &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Account Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Account</Text>
            <View style={styles.filterPillsContainer}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  !selectedAccountId && styles.filterPillActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setSelectedAccountId("")
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    !selectedAccountId && styles.filterPillTextActive,
                  ]}
                >
                  All Accounts
                </Text>
              </TouchableOpacity>

              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.filterPill,
                    selectedAccountId === acc.id && styles.filterPillActive,
                  ]}
                  onPress={() => {
                    haptics.light()
                    setSelectedAccountId(
                      selectedAccountId === acc.id ? "" : acc.id || ""
                    )
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      selectedAccountId === acc.id &&
                        styles.filterPillTextActive,
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Budget Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Budget Category</Text>
            <View style={styles.filterPillsContainer}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  !selectedBudgetId && styles.filterPillActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setSelectedBudgetId("")
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    !selectedBudgetId && styles.filterPillTextActive,
                  ]}
                >
                  All Budgets
                </Text>
              </TouchableOpacity>

              {budgets.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.filterPill,
                    selectedBudgetId === b.id && styles.filterPillActive,
                  ]}
                  onPress={() => {
                    haptics.light()
                    setSelectedBudgetId(
                      selectedBudgetId === b.id ? "" : b.id || ""
                    )
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      selectedBudgetId === b.id && styles.filterPillTextActive,
                    ]}
                  >
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Filter Footer Buttons */}
          <View style={styles.filterFooter}>
            <Button
              variant="secondary"
              size="lg"
              style={{ flex: 1 }}
              onPress={clearAllFilters}
            >
              Reset All
            </Button>
            <Button
              variant="primary"
              size="lg"
              style={{ flex: 1 }}
              onPress={() => {
                haptics.light()
                filterSheetRef.current?.close()
              }}
            >
              Apply Filters
            </Button>
          </View>
        </BottomSheetScrollView>
      </AppBottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: theme.colors.background,
  },
  searchBarRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  searchWrapper: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#090d16",
  },
  periodAndChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  monthStepper: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  monthStepBtn: {
    width: 32,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  monthCenterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: "100%",
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  monthCenterText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  monthGridCard: {
    marginTop: 4,
    padding: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  yearHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  yearNavBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  yearHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  monthCell: {
    width: "23%",
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthCellCurrent: {
    borderColor: theme.colors.primary,
  },
  monthCellActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  monthCellText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  monthCellTextActive: {
    color: "#090d16",
    fontWeight: "700",
  },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  quickChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  quickChipTextActive: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  loaderContainer: {
    padding: 16,
    gap: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  transactionCardWrapper: {
    padding: 0,
    overflow: "hidden",
    marginBottom: 8,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.lg,
  },
  filterSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  filterSection: {
    gap: 8,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterOptionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterOptionBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterOptionBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  filterOptionText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  filterOptionTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  filterPillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  filterPillText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  filterPillTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  filterFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
})
