import React, { useState, useMemo, useRef, useCallback } from "react"
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  Search,
  Plus,
  ReceiptText,
  X,
  SlidersHorizontal,
} from "lucide-react-native"
import {
  listTransactions,
  useListAccountsQuery,
  useListBudgetsQuery,
  useGetFinanceSettingsQuery,
  type Transaction,
  type Transaction_Type,
  type Account,
  type Budget,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { useDebounce } from "@/lib/use-debounce"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { useToast } from "@/components/ui/toast"

function getSectionDateTitle(dateStr?: string): string {
  if (!dateStr) return "Older"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "Older"

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffTime = today.getTime() - txDate.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"

  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: txDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }
  return txDate.toLocaleDateString("en-US", options)
}

export default function TransactionsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const toast = useToast()
  const queryClient = useQueryClient()

  // State
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [selectedType, setSelectedType] = useState<string>("")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("")

  // BottomSheet Ref for Filters
  const filterSheetRef = useRef<BottomSheet>(null)

  // Queries
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
  const budgets = budgetsData?.budgets || []
  const budgetsMap = useMemo(() => {
    const map = new Map<string, Budget>()
    budgets.forEach((b) => {
      if (b.id) map.set(b.id, b)
    })
    return map
  }, [budgets])

  // Keyset Infinite Query
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
    ],
    queryFn: async ({ pageParam = "" }) => {
      return listTransactions({
        searchQuery: debouncedSearch.trim() || undefined,
        types: selectedType ? [selectedType as Transaction_Type] : undefined,
        accountId: selectedAccountId || undefined,
        budgetId: selectedBudgetId || undefined,
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
  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    allTransactions.forEach((tx) => {
      const title = getSectionDateTitle(tx.transactionDate)
      if (!map.has(title)) {
        map.set(title, [])
      }
      map.get(title)!.push(tx)
    })

    return Array.from(map.entries()).map(([title, items]) => ({
      title,
      data: items,
    }))
  }, [allTransactions])

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

  const handleOpenDetail = (tx: Transaction) => {
    if (!tx.id) return
    haptics.light()
    router.push(`/(app)/finance/transactions/${tx.id}`)
  }

  const clearAllFilters = () => {
    haptics.light()
    setSelectedType("")
    setSelectedAccountId("")
    setSelectedBudgetId("")
    setSearch("")
  }

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
      </View>
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
    [accountsMap, budgetsMap, baseCurrency]
  )

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.headerBlock}>
        <View style={styles.searchBarRow}>
          <View style={styles.searchWrapper}>
            <TextInput
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

        {/* Quick Filter Horizontal Chips */}
        <View style={styles.quickFiltersRow}>
          <TouchableOpacity
            style={[styles.quickChip, !selectedType && styles.quickChipActive]}
            onPress={() => {
              haptics.light()
              setSelectedType("")
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                !selectedType && styles.quickChipTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickChip,
              selectedType === "EXPENSE" && styles.quickChipActive,
            ]}
            onPress={() => {
              haptics.light()
              setSelectedType(selectedType === "EXPENSE" ? "" : "EXPENSE")
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                selectedType === "EXPENSE" && styles.quickChipTextActive,
              ]}
            >
              Expenses
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickChip,
              selectedType === "INCOME" && styles.quickChipActive,
            ]}
            onPress={() => {
              haptics.light()
              setSelectedType(selectedType === "INCOME" ? "" : "INCOME")
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.quickChipText,
                selectedType === "INCOME" && styles.quickChipTextActive,
              ]}
            >
              Income
            </Text>
          </TouchableOpacity>

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
            ) : null
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
        snapPoints={["60%"]}
        title="Filter Transactions"
      >
        <View style={styles.filterSheetContent}>
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
        </View>
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
  quickFiltersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
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
  sectionHeader: {
    backgroundColor: theme.colors.background,
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
