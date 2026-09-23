import React, { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native"
import { useRouter } from "expo-router"
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  ReceiptText,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import {
  useListTransactionsQuery,
  useListAccountsQuery,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { MonoAmount } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { haptics } from "@/lib/haptics"

export default function TransactionsScreen() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const [search, setSearch] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const {
    data: txData,
    isLoading: txLoading,
    refetch: refetchTx,
  } = useListTransactionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )

  const accountsMap = useMemo(() => {
    const map = new Map<string, string>()
    accountsData?.accounts?.forEach((a) => {
      if (a.id) map.set(a.id, a.name)
    })
    return map
  }, [accountsData])

  const transactions = txData?.transactions || []

  const filtered = useMemo(() => {
    if (!search.trim()) return transactions
    const q = search.toLowerCase()
    return transactions.filter(
      (tx) =>
        (tx.description && tx.description.toLowerCase().includes(q)) ||
        (tx.accountId &&
          accountsMap.get(tx.accountId)?.toLowerCase().includes(q))
    )
  }, [transactions, search, accountsMap])

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetchTx()
    } finally {
      setRefreshing(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchWrapper}>
          <TextInput
            placeholder="Search transactions..."
            value={search}
            onChangeText={setSearch}
            leftIcon={<Search size={18} color={theme.colors.textMuted} />}
            inputContainerStyle={{ minHeight: 42 }}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          activeOpacity={0.7}
          onPress={() => haptics.light()}
        >
          <Filter size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Transaction Feed */}
      {txLoading ? (
        <View style={{ padding: 16, gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id || ""}
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
          renderItem={({ item }: { item: Transaction }) => {
            const isExpense = item.type === "EXPENSE"
            const accountName = item.accountId
              ? accountsMap.get(item.accountId)
              : undefined

            return (
              <Card
                style={styles.transactionCard}
                onPress={() => haptics.light()}
              >
                <View style={styles.leftCol}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: isExpense
                          ? theme.colors.destructiveSubtle
                          : theme.colors.successSubtle,
                      },
                    ]}
                  >
                    {isExpense ? (
                      <ArrowUpRight
                        size={16}
                        color={theme.colors.destructive}
                      />
                    ) : (
                      <ArrowDownLeft size={16} color={theme.colors.success} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDescription} numberOfLines={1}>
                      {item.description || "Unnamed Transaction"}
                    </Text>
                    <Text style={styles.txMeta} numberOfLines={1}>
                      {accountName ? `${accountName} • ` : ""}
                      {formatDate(item.transactionDate)}
                    </Text>
                  </View>
                </View>
                <MonoAmount
                  size="md"
                  color={
                    isExpense ? theme.colors.textPrimary : theme.colors.success
                  }
                >
                  {isExpense ? "-" : "+"}
                  {formatAmount(item.amount, item.currency)}
                </MonoAmount>
              </Card>
            )
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<ReceiptText size={28} color={theme.colors.textMuted} />}
              title="No transactions found"
              description={
                search
                  ? `No results matching "${search}"`
                  : "Tap the + button to log your first transaction."
              }
              actionLabel="Add Transaction"
              onAction={() => router.push("/modal/add-transaction")}
            />
          }
        />
      )}

      {/* Floating Add Action Button */}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchBarContainer: {
    flexDirection: "row",
    padding: 16,
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
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 10,
  },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  leftCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txDescription: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  txMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
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
})
