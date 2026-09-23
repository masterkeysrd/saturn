import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
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
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { MonoAmount } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { haptics } from "@/lib/haptics"

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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isExpense = item.type === "expense"
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
