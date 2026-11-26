import React, { useState, useMemo, useRef, useCallback } from "react"
import {
  Text,
  View,
  TextInput,
  ScrollView,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  useListExchangeRatesQuery,
  useGetSettingsQuery,
  type Transaction,
  type Account,
  type Budget,
  type ExchangeRate,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  accountLedgerFilters,
  accountLedgerTypes,
  convertCentsToBase,
  formatYm,
  parseYm,
  resolveFinancePeriodBounds,
  shiftYearMonth,
  signedTransactionAmount,
  type AccountLedgerFilter,
  type DateGroupedSection,
  type FinancePeriodPreset,
} from "@saturn/core"
import {
  useDateSections,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { useMobileCopilotView } from "../../../../lib/copilot-sheet-context"
import { useSpace } from "../../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../../lib/theme"
import { haptics } from "../../../../lib/haptics"
import { AIHeaderButton } from "../../../../components/app-header"
import { TransactionListItem } from "../../../../components/finance/transaction-list-item"
import { DateSectionHeader } from "../../../../components/finance/date-section-header"
import { MonoAmount } from "../../../../components/ui/typography"
import { Button } from "../../../../components/ui/button"
import { EmptyState } from "../../../../components/ui/empty-state"
import { SkeletonCard } from "../../../../components/ui/skeleton-loader"
import {
  AppBottomSheet,
  BottomSheetHeader,
} from "../../../../components/ui/bottom-sheet"

interface TransactionSection extends DateGroupedSection<Transaction> {
  dailyNetBaseCents: number
}

const PERIOD_PRESETS = [
  {
    value: "this_month",
    labelKey: "finance.transactions.list.presetThisMonth",
  },
  {
    value: "last_month",
    labelKey: "finance.transactions.list.presetLastMonth",
  },
  { value: "3m", labelKey: "finance.transactions.list.presetLast3M" },
  { value: "6m", labelKey: "finance.transactions.list.presetLast6M" },
  { value: "ytd", labelKey: "finance.transactions.list.presetYtd" },
  { value: "12m", labelKey: "finance.transactions.list.presetLast12M" },
  { value: "all", labelKey: "finance.transactions.list.presetAllTime" },
] as const satisfies readonly {
  value: FinancePeriodPreset
  labelKey:
    | "finance.transactions.list.presetThisMonth"
    | "finance.transactions.list.presetLastMonth"
    | "finance.transactions.list.presetLast3M"
    | "finance.transactions.list.presetLast6M"
    | "finance.transactions.list.presetYtd"
    | "finance.transactions.list.presetLast12M"
    | "finance.transactions.list.presetAllTime"
}[]

function transactionBaseSignedCents(
  txn: Transaction,
  baseCurrency: string,
  exchangeRates: ExchangeRate[]
): number {
  return signedTransactionAmount(
    txn,
    txn.amountInBase !== undefined && txn.amountInBase !== ""
      ? Number(txn.amountInBase)
      : convertCentsToBase(
          txn.amount,
          txn.currency,
          baseCurrency,
          exchangeRates
        )
  )
}

export default function TransactionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpaceId } = useSpace()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  // State
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [refreshing, setRefreshing] = useState(false)

  useMobileCopilotView({
    viewId: "mobile.finance.transactions",
    title: t("nav.transactions"),
    suggestions: [
      t("finance.transactions.suggestion.spendingTrends"),
      t("finance.transactions.suggestion.unusualCharges"),
      t("finance.transactions.suggestion.categories"),
    ],
  })

  // Filters
  const [selectedType, setSelectedType] = useState<AccountLedgerFilter>("all")
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

  const activePreset = PERIOD_PRESETS.find(
    (p) => p.value === periodBounds.period
  )
  const periodLabel =
    periodBounds.period === "month" ||
    periodBounds.period === "this_month" ||
    periodBounds.period === "last_month"
      ? periodBounds.label
      : activePreset
        ? t(activePreset.labelKey)
        : periodBounds.label

  const shortMonthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        label: tz.format(`${formatYm(pickerYear, idx + 1)}-15`, {
          month: "short",
          year: undefined,
          day: undefined,
        }),
      })),
    [pickerYear, tz]
  )

  const selectCalendarMonth = (ym: string) => {
    if (ym === currentMonthYm) {
      setPeriod("this_month")
      setSelectedMonth("")
    } else {
      setPeriod("month")
      setSelectedMonth(ym)
    }
  }

  const handleStepMonth = (delta: -1 | 1) => {
    haptics.selection()
    const active = parseYm(periodBounds.activeMonth)
    const baseYear = active ? active.year : nowYear
    const baseMonth = active ? active.month : nowMonth
    const next = shiftYearMonth(baseYear, baseMonth, delta)
    selectCalendarMonth(formatYm(next.year, next.month))
    setPickerYear(next.year)
  }

  // BottomSheet Ref for Filters
  const filterSheetRef = useRef<BottomSheet>(null)

  const openFilterSheet = useCallback(() => {
    haptics.light()
    const active = parseYm(periodBounds.activeMonth)
    if (active) setPickerYear(active.year)
    filterSheetRef.current?.snapToIndex(0)
  }, [periodBounds.activeMonth])

  const closeFilterSheet = useCallback(() => {
    filterSheetRef.current?.close()
  }, [])

  // Queries
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: exchangeRatesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const exchangeRates = useMemo(
    () => exchangeRatesData?.exchangeRates || [],
    [exchangeRatesData?.exchangeRates]
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
      const filterTypes = accountLedgerTypes[selectedType]
      return listTransactions({
        searchQuery: debouncedSearch.trim() || undefined,
        types: filterTypes.length ? [...filterTypes] : undefined,
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

  // Grouped into Sections by Date with Daily Net in base currency
  const rawSections = useDateSections(allTransactions)
  const sections = useMemo<TransactionSection[]>(
    () =>
      rawSections.map((section) => ({
        ...section,
        dailyNetBaseCents: section.data.reduce(
          (sum, txn) =>
            sum + transactionBaseSignedCents(txn, baseCurrency, exchangeRates),
          0
        ),
      })),
    [rawSections, baseCurrency, exchangeRates]
  )

  const activeFilterCount =
    (selectedType !== "all" ? 1 : 0) +
    (selectedAccountId ? 1 : 0) +
    (selectedBudgetId ? 1 : 0)

  const hasNonDefaultPeriod = period !== "this_month" || selectedMonth !== ""
  const hasActiveFilters = Boolean(
    search.trim() || activeFilterCount > 0 || hasNonDefaultPeriod
  )

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
    setSelectedType("all")
    setSelectedAccountId("")
    setSelectedBudgetId("")
    setPeriod("this_month")
    setSelectedMonth("")
    setPickerYear(nowYear)
    setSearch("")
  }

  const renderSectionHeader = useCallback(
    ({ section }: { section: TransactionSection }) => {
      const net = section.dailyNetBaseCents
      const netColor =
        net > 0
          ? colors.success
          : net < 0
            ? colors.destructive
            : colors.textMuted

      return (
        <DateSectionHeader
          title={section.title}
          insetHorizontal={true}
          rightContent={
            <MonoAmount size="sm" color={netColor}>
              {tz.formatMoney(net, baseCurrency, { showSign: true })}
            </MonoAmount>
          }
        />
      )
    },
    [baseCurrency, colors.destructive, colors.success, colors.textMuted, tz]
  )

  const renderTransactionRow = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Transaction
      index: number
      section: TransactionSection
    }) => (
      <TransactionListItem
        item={item}
        baseCurrency={baseCurrency}
        account={item.accountId ? accountsMap.get(item.accountId) : undefined}
        budget={item.budgetId ? budgetsMap.get(item.budgetId) : undefined}
        onPress={() => handleOpenDetail(item)}
        showBorderBottom={index < section.data.length - 1}
        showDate={false}
      />
    ),
    [accountsMap, budgetsMap, baseCurrency, handleOpenDetail]
  )

  return (
    <View style={styles.container}>
      {/* Unified Safe-Area Search & Filter Top Bar */}
      <View
        style={[
          styles.headerBlock,
          { paddingTop: Math.max(insets.top, 8) + 4 },
        ]}
      >
        <View style={styles.searchBarRow}>
          <TouchableOpacity
            testID="transactions-back-btn"
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.back()
            }}
          >
            <ChevronLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.searchBar}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              accessibilityLabel={t(
                "finance.transactions.list.searchPlaceholder"
              )}
              placeholder={t("finance.transactions.list.searchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("finance.transactions.clearSearchAria")}
                onPress={() => {
                  haptics.selection()
                  setSearch("")
                }}
                style={styles.clearSearchBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("finance.transactions.filterAria")}
            style={[
              styles.filterButton,
              activeFilterCount > 0 && styles.filterButtonActive,
            ]}
            activeOpacity={0.75}
            onPress={openFilterSheet}
          >
            <SlidersHorizontal
              size={17}
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

          <AIHeaderButton
            testID="transactions-header-ai"
            style={styles.aiHeaderBtn}
          />
        </View>

        {/* Full-Width Month Stepper */}
        <View style={styles.monthStepper}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("calendar.prevMonth")}
            style={styles.monthStepBtn}
            onPress={() => handleStepMonth(-1)}
            activeOpacity={0.7}
          >
            <ChevronLeft size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("finance.transactions.list.selectPeriodAria")}
            style={styles.monthCenterBtn}
            onPress={openFilterSheet}
            activeOpacity={0.7}
          >
            <CalendarIcon size={13} color={colors.textMuted} />
            <Text style={styles.monthCenterText} numberOfLines={1}>
              {periodLabel}
            </Text>
            <ChevronDown size={13} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("calendar.nextMonth")}
            style={styles.monthStepBtn}
            onPress={() => handleStepMonth(1)}
            activeOpacity={0.7}
          >
            <ChevronRight size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Contextual Active Filter Chips */}
        {activeFilterCount > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.periodAndChipsRow}
          >
            {selectedType !== "all" ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("finance.transactions.removeTypeFilter")}
                style={styles.activeFilterChip}
                onPress={() => {
                  haptics.selection()
                  setSelectedType("all")
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.activeFilterChipText}>
                  {t(`finance.detail.${selectedType}`)}
                </Text>
                <X size={12} color={colors.primary} />
              </TouchableOpacity>
            ) : null}

            {selectedAccountId ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t(
                  "finance.transactions.removeAccountFilter"
                )}
                style={styles.activeFilterChip}
                onPress={() => {
                  haptics.selection()
                  setSelectedAccountId("")
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.activeFilterChipText}>
                  {accountsMap.get(selectedAccountId)?.name ||
                    t("finance.transactions.facetAccount")}
                </Text>
                <X size={12} color={colors.primary} />
              </TouchableOpacity>
            ) : null}

            {selectedBudgetId ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t(
                  "finance.transactions.removeBudgetFilter"
                )}
                style={styles.activeFilterChip}
                onPress={() => {
                  haptics.selection()
                  setSelectedBudgetId("")
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.activeFilterChipText}>
                  {budgetsMap.get(selectedBudgetId)?.name ||
                    t("finance.transactions.facetBudget")}
                </Text>
                <X size={12} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : null}
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 84 },
          ]}
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
            <View style={styles.emptyContainer}>
              <EmptyState
                icon={<ReceiptText size={32} color={colors.textMuted} />}
                title={t("finance.transactions.list.emptyTitle")}
                description={
                  hasActiveFilters
                    ? t("finance.transactions.list.emptyFiltered")
                    : t("finance.transactions.list.emptyInitial")
                }
                actionLabel={
                  hasActiveFilters
                    ? t("finance.transactions.list.resetFiltersCta")
                    : t("finance.tab.addTransaction")
                }
                onAction={
                  hasActiveFilters
                    ? clearAllFilters
                    : () => router.push("/modal/add-transaction")
                }
              />
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 12 }]}
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
      <AppBottomSheet ref={filterSheetRef} snapPoints={["75%", "88%"]}>
        <View style={styles.sheetHeaderWrap}>
          <BottomSheetHeader
            title={t("finance.transactions.list.filterSheetTitle")}
            onClose={closeFilterSheet}
          />
        </View>
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.filterSheetContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Period & Quick Month Grid */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.list.periodSection")}
            </Text>
            <View style={styles.filterPillsContainer}>
              {PERIOD_PRESETS.map((preset) => {
                const isActive = periodBounds.period === preset.value
                return (
                  <TouchableOpacity
                    key={preset.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
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

            <View style={styles.monthGridWell}>
              <View style={styles.yearHeaderRow}>
                <TouchableOpacity
                  accessibilityRole="button"
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
                  accessibilityRole="button"
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
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.monthCell,
                        isCurrent && !isActive && styles.monthCellCurrent,
                        isActive && styles.monthCellActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        selectCalendarMonth(cellYm)
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

          {/* Flow Type Filter (All 5 ledger types) */}
          <View style={[styles.filterSection, styles.filterSectionBorder]}>
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.list.flowType")}
            </Text>
            <View style={styles.filterPillsContainer}>
              {accountLedgerFilters.map((filterKey) => {
                const isActive = selectedType === filterKey
                return (
                  <TouchableOpacity
                    key={filterKey}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setSelectedType(filterKey)
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {t(`finance.detail.${filterKey}`)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Account Filter */}
          <View style={[styles.filterSection, styles.filterSectionBorder]}>
            <Text style={styles.filterSectionTitle}>
              {t("finance.transactions.facetAccount")}
            </Text>
            <View style={styles.filterPillsContainer}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedAccountId }}
                style={[
                  styles.filterPill,
                  !selectedAccountId && styles.filterPillActive,
                ]}
                onPress={() => {
                  haptics.selection()
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

              {accounts.map((acc) => {
                const isActive = selectedAccountId === acc.id
                return (
                  <TouchableOpacity
                    key={acc.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setSelectedAccountId(isActive ? "" : acc.id || "")
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Budget Filter */}
          <View style={[styles.filterSection, styles.filterSectionBorder]}>
            <Text style={styles.filterSectionTitle}>
              {t("finance.inbox.sheet.budgetCategory")}
            </Text>
            <View style={styles.filterPillsContainer}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedBudgetId }}
                style={[
                  styles.filterPill,
                  !selectedBudgetId && styles.filterPillActive,
                ]}
                onPress={() => {
                  haptics.selection()
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

              {budgets.map((b) => {
                const isActive = selectedBudgetId === b.id
                return (
                  <TouchableOpacity
                    key={b.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={[
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setSelectedBudgetId(isActive ? "" : b.id || "")
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        isActive && styles.filterPillTextActive,
                      ]}
                    >
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
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
                closeFilterSheet()
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
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: t.colors.background,
  },
  searchBarRow: {
    flexDirection: "row" as const,
    gap: 8,
    alignItems: "center" as const,
    height: 40,
  },
  backButton: {
    width: 36,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    height: 40,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textPrimary,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    position: "relative" as const,
  },
  filterButtonActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  aiHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
  },
  filterBadge: {
    position: "absolute" as const,
    top: 4,
    right: 4,
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.full,
    minWidth: 15,
    height: 15,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
    fontVariant: ["tabular-nums" as const],
  },
  periodAndChipsRow: {
    flexDirection: "row" as const,
    gap: 8,
    alignItems: "center" as const,
    paddingRight: 4,
  },
  monthStepper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 36,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    overflow: "hidden" as const,
  },
  monthStepBtn: {
    width: 40,
    height: "100%" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  monthCenterBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    height: "100%" as const,
    paddingHorizontal: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  monthCenterText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  activeFilterChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  loaderContainer: {
    padding: 16,
    gap: 10,
  },
  listContent: {
    paddingHorizontal: 0,
  },
  emptyContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
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
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...t.shadows.lg,
  },
  sheetHeaderWrap: {
    paddingHorizontal: 16,
  },
  filterSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  filterSection: {
    gap: 10,
  },
  filterSectionBorder: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  monthGridWell: {
    marginTop: 2,
    padding: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    gap: 8,
  },
  yearHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  yearNavBtn: {
    width: 32,
    height: 32,
    borderRadius: t.radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  yearHeaderText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    fontVariant: ["tabular-nums" as const],
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
  filterPillsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  filterPill: {
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  filterPillActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  filterPillText: {
    fontSize: 13,
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
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
})
