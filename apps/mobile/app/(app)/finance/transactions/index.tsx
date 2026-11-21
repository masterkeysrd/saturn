import React, { useState, useMemo, useRef, useCallback } from "react"
import {
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
  formatShortMonth,
  formatYm,
  parseYm,
  resolveFinancePeriodBounds,
  shiftYearMonth,
  type FinancePeriodPreset,
} from "@saturn/core"
import {
  useDateSections,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

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

  const shortMonthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        label: formatShortMonth(
          new Date(Date.UTC(2026, idx, 15, 12, 0, 0)),
          "UTC",
          tz.locale
        ),
      })),
    [tz.locale]
  )

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
  const sections = useDateSections(allTransactions)

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
    [
      accountsMap,
      budgetsMap,
      baseCurrency,
      handleOpenDetail,
      styles.transactionCardWrapper,
    ]
  )

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.headerBlock}>
        <View style={styles.searchBarRow}>
          <View style={styles.searchWrapper}>
            <BaseTextInput
              placeholder={t("finance.transactions.list.searchPlaceholder")}
              value={search}
              onChangeText={setSearch}
              leftIcon={<Search size={18} color={colors.textMuted} />}
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
                activeFilterCount > 0 ? colors.primary : colors.textSecondary
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
              accessibilityLabel={t("calendar.prevMonth")}
              style={styles.monthStepBtn}
              onPress={() => handleStepMonth(-1)}
              activeOpacity={0.7}
            >
              <ChevronLeft size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel={t(
                "finance.transactions.list.selectPeriodAria"
              )}
              style={styles.monthCenterBtn}
              onPress={() => {
                haptics.light()
                const active = parseYm(periodBounds.activeMonth)
                if (active) setPickerYear(active.year)
                filterSheetRef.current?.expand()
              }}
              activeOpacity={0.7}
            >
              <CalendarIcon size={13} color={colors.textMuted} />
              <Text style={styles.monthCenterText}>{periodBounds.label}</Text>
              <ChevronDown size={13} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel={t("calendar.nextMonth")}
              style={styles.monthStepBtn}
              onPress={() => handleStepMonth(1)}
              activeOpacity={0.7}
            >
              <ChevronRight size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedType ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedType("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {selectedType === "EXPENSE"
                  ? t("finance.transactions.list.expenses")
                  : t("finance.inbox.sheet.flowIncome")}
              </Text>
              <X size={12} color={colors.primary} />
            </TouchableOpacity>
          ) : null}

          {selectedAccountId ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedAccountId("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {accountsMap.get(selectedAccountId)?.name ||
                  t("finance.transactions.facetAccount")}
              </Text>
              <X size={12} color={colors.primary} />
            </TouchableOpacity>
          ) : null}

          {selectedBudgetId ? (
            <TouchableOpacity
              style={[styles.quickChip, styles.quickChipActive]}
              onPress={() => setSelectedBudgetId("")}
              activeOpacity={0.7}
            >
              <Text style={styles.quickChipTextActive}>
                {budgetsMap.get(selectedBudgetId)?.name ||
                  t("finance.transactions.facetBudget")}
              </Text>
              <X size={12} color={colors.primary} />
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
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.footerLoaderText}>
                  {t("finance.transactions.list.loadingMore")}
                </Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon={<ReceiptText size={32} color={colors.textMuted} />}
              title={t("finance.transactions.list.emptyTitle")}
              description={
                search || activeFilterCount > 0
                  ? t("finance.transactions.list.emptyFiltered")
                  : t("finance.transactions.list.emptyInitial")
              }
              actionLabel={
                activeFilterCount > 0
                  ? t("finance.transactions.list.resetFiltersCta")
                  : t("finance.tab.addTransaction")
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
        accessibilityRole="button"
        accessibilityLabel={t("finance.tab.addTransaction")}
        onPress={() => {
          haptics.medium()
          router.push("/modal/add-transaction")
        }}
      >
        <Plus size={24} color={colors.primaryForeground} />
      </TouchableOpacity>

      {/* Filter Bottom Sheet */}
      <AppBottomSheet
        ref={filterSheetRef}
        snapPoints={["78%"]}
        title={t("finance.transactions.list.filterSheetTitle")}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.filterSheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Period & Quick Month Grid */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.list.periodSection")}
            </Text>
            <View style={styles.filterPillsContainer}>
              {(
                [
                  {
                    labelKey: "finance.transactions.list.presetThisMonth",
                    value: "this_month",
                  },
                  {
                    labelKey: "finance.transactions.list.presetLastMonth",
                    value: "last_month",
                  },
                  {
                    labelKey: "finance.transactions.list.presetLast3M",
                    value: "3m",
                  },
                  {
                    labelKey: "finance.transactions.list.presetYtd",
                    value: "ytd",
                  },
                  {
                    labelKey: "finance.transactions.list.presetAllTime",
                    value: "all",
                  },
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
                      {t(preset.labelKey)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.monthGridCard}>
              <View style={styles.yearHeaderRow}>
                <TouchableOpacity
                  accessibilityLabel={t(
                    "finance.transactions.list.prevYearAria"
                  )}
                  style={styles.yearNavBtn}
                  onPress={() => {
                    haptics.selection()
                    setPickerYear((y) => y - 1)
                  }}
                >
                  <ChevronLeft size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.yearHeaderText}>{pickerYear}</Text>
                <TouchableOpacity
                  accessibilityLabel={t(
                    "finance.transactions.list.nextYearAria"
                  )}
                  style={styles.yearNavBtn}
                  onPress={() => {
                    haptics.selection()
                    setPickerYear((y) => y + 1)
                  }}
                >
                  <ChevronRight size={16} color={colors.textSecondary} />
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
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.list.flowType")}
            </Text>
            <View style={styles.filterOptionsRow}>
              {[
                { label: t("finance.transactions.type.allTypes"), value: "" },
                {
                  label: t("finance.transactions.list.expenses"),
                  value: "EXPENSE",
                },
                {
                  label: t("finance.inbox.sheet.flowIncome"),
                  value: "INCOME",
                },
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
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.facetAccount")}
            </Text>
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
                  {t("finance.transactions.list.allAccounts")}
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
            <Text style={styles.filterSectionTitle}>
              {t("finance.inbox.sheet.budgetCategory")}
            </Text>
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
                  {t("finance.budgets.allBudgets")}
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
              {t("finance.transactions.list.resetAll")}
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
              {t("finance.transactions.list.applyFilters")}
            </Button>
          </View>
        </BottomSheetScrollView>
      </AppBottomSheet>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: t.colors.background,
  },
  searchBarRow: {
    flexDirection: "row" as const,
    gap: 10,
    alignItems: "center" as const,
  },
  searchWrapper: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    position: "relative" as const,
  },
  filterButtonActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  filterBadge: {
    position: "absolute" as const,
    top: -4,
    right: -4,
    backgroundColor: t.colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  periodAndChipsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    alignItems: "center" as const,
  },
  monthStepper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 34,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: "hidden" as const,
  },
  monthStepBtn: {
    width: 32,
    height: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  monthCenterBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    height: "100%" as const,
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.colors.border,
  },
  monthCenterText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  monthGridCard: {
    marginTop: 4,
    padding: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 8,
  },
  yearHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  yearNavBtn: {
    width: 28,
    height: 28,
    borderRadius: t.radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  yearHeaderText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  monthGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  monthCell: {
    width: "23%" as const,
    paddingVertical: 7,
    borderRadius: t.radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthCellCurrent: {
    borderColor: t.colors.primary,
  },
  monthCellActive: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  monthCellText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  monthCellTextActive: {
    color: t.colors.primaryForeground,
    fontWeight: "700" as const,
  },
  quickChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  quickChipActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  quickChipTextActive: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
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
    overflow: "hidden" as const,
    marginBottom: 8,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center" as const,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  fab: {
    position: "absolute" as const,
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...t.shadows.lg,
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
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  filterOptionsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  filterOptionBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center" as const,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterOptionBtnActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  filterOptionText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  filterOptionTextActive: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  filterPillsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterPillActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  filterPillText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  filterPillTextActive: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  filterFooter: {
    flexDirection: "row" as const,
    gap: 12,
    marginTop: 8,
  },
})
