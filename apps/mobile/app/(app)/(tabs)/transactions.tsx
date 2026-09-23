import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
} from "react-native"
import { useRouter } from "expo-router"
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
} from "lucide-react-native"
import { formatAmount } from "@saturn/core"
import { theme } from "@/lib/theme"

interface MockTransaction {
  id: string
  description: string
  category: string
  amount: string
  currency: string
  type: "expense" | "income"
  date: string
}

const INITIAL_TRANSACTIONS: MockTransaction[] = [
  {
    id: "tx-1",
    description: "Whole Foods Market",
    category: "Groceries",
    amount: "14250",
    currency: "USD",
    type: "expense",
    date: "Today",
  },
  {
    id: "tx-2",
    description: "Direct Deposit - Tech Corp",
    category: "Salary",
    amount: "450000",
    currency: "USD",
    type: "income",
    date: "Yesterday",
  },
  {
    id: "tx-3",
    description: "GitHub Pro Subscription",
    category: "Software",
    amount: "1000",
    currency: "USD",
    type: "expense",
    date: "Sep 20",
  },
  {
    id: "tx-4",
    description: "Blue Bottle Coffee",
    category: "Dining",
    amount: "675",
    currency: "USD",
    type: "expense",
    date: "Sep 19",
  },
]

export default function TransactionsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState("")

  const filtered = INITIAL_TRANSACTIONS.filter(
    (tx) =>
      tx.description.toLowerCase().includes(search.toLowerCase()) ||
      tx.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchWrapper}>
          <Search
            size={18}
            color={theme.colors.textMuted}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.filterButton}>
          <Filter size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Transaction Feed */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isExpense = item.type === "expense"
          return (
            <TouchableOpacity style={styles.transactionCard}>
              <View style={styles.leftCol}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: isExpense
                        ? "rgba(244, 63, 94, 0.15)"
                        : "rgba(52, 211, 153, 0.15)",
                    },
                  ]}
                >
                  {isExpense ? (
                    <ArrowUpRight size={16} color={theme.colors.destructive} />
                  ) : (
                    <ArrowDownLeft size={16} color={theme.colors.success} />
                  )}
                </View>
                <View>
                  <Text style={styles.txDescription}>{item.description}</Text>
                  <Text style={styles.txMeta}>
                    {item.category} • {item.date}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  {
                    color: isExpense
                      ? theme.colors.textPrimary
                      : theme.colors.success,
                  },
                ]}
              >
                {isExpense ? "-" : "+"}
                {formatAmount(item.amount, item.currency)}
              </Text>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No transactions found</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to log your first transaction.
            </Text>
          </View>
        }
      />

      {/* Floating Add Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/modal/add-transaction")}
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
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  filterButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  leftCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  txDescription: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  txMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    backgroundColor: theme.colors.primary,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
})
