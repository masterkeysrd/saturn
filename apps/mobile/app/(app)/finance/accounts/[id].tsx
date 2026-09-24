import { useState, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import {
  ArrowRightLeft,
  Scale,
  Plus,
  Edit3,
  ReceiptText,
  AlertCircle,
} from "lucide-react-native"
import {
  useGetAccountQuery,
  useListTransactionsQuery,
  useListBudgetsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
  type Budget,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount } from "@saturn/core"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Caption } from "@/components/ui/typography"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { TransactionListItem } from "@/components/finance/transaction-list-item"
import { CardAccountItem } from "@/components/finance/card-account-item"

export default function AccountDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { activeSpaceId } = useSpace()
  const [refreshing, setRefreshing] = useState(false)

  // Fetch settings & base currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch account details
  const {
    data: account,
    isLoading: isAccountLoading,
    refetch: refetchAccount,
  } = useGetAccountQuery({ id: id || "" }, { enabled: !!id && !!activeSpaceId })

  // Fetch transactions for this account
  const {
    data: txnsData,
    isLoading: isTxnsLoading,
    refetch: refetchTxns,
  } = useListTransactionsQuery(
    {
      accountId: id || "",
      types: [],
      pageSize: 100,
      pageToken: "",
      view: "FULL",
    },
    { enabled: !!id && !!activeSpaceId }
  )

  // Fetch budgets to map budget categories on transactions
  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL" },
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

  // Fetch institutions
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions = instData?.institutions || []
  const instMap = useMemo(() => {
    const map = new Map<string, Account_InstitutionInfo>()
    institutions.forEach((i) => {
      if (i.id) map.set(i.id, i as Account_InstitutionInfo)
    })
    return map
  }, [institutions])

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  const transactions = txnsData?.transactions || []

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([refetchAccount(), refetchTxns()])
    } finally {
      setRefreshing(false)
    }
  }

  if (isAccountLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!account) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={36} color={theme.colors.destructive} />
        <Text style={styles.errorTitle}>Account Not Found</Text>
        <Text style={styles.errorSubtitle}>
          The requested financial account could not be loaded.
        </Text>
        <TouchableOpacity
          style={styles.backToAccountsBtn}
          onPress={() => router.replace("/(app)/finance/accounts")}
          activeOpacity={0.7}
        >
          <Text style={styles.backToAccountsText}>Back to Accounts</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const institution = account.institutionId
    ? instMap.get(account.institutionId)
    : undefined

  // Converted preview if account is in foreign currency
  let convertedStr = ""
  if (account.currency && account.currency !== baseCurrency) {
    const balanceNum = Number(account.currentBalance || "0")
    const preview = getConversionPreview(
      String(Math.abs(balanceNum) / 100),
      account.currency
    )
    if (preview && "amount" in preview) {
      convertedStr = `≈ ${formatAmount(
        Math.round(preview.amount * 100),
        baseCurrency
      )}`
    }
  }

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Account Card Presentation */}
      <View style={styles.cardWrapper}>
        <CardAccountItem
          acc={account}
          institution={institution}
          baseCurrency={baseCurrency}
          convertedText={convertedStr}
        />
      </View>

      {/* Quick Actions Grid */}
      <View style={styles.actionGrid}>
        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "TRANSFER",
                accountId: account.id,
              },
            })
          }}
          style={styles.actionBtn}
        >
          <View style={[styles.actionIconWrap, styles.iconTransfer]}>
            <ArrowRightLeft size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.actionBtnText}>Transfer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/adjust-balance",
              params: { accountId: account.id },
            })
          }}
          style={styles.actionBtn}
        >
          <View style={[styles.actionIconWrap, styles.iconAdjust]}>
            <Scale size={18} color="#10b981" />
          </View>
          <Text style={styles.actionBtnText}>Adjust Balance</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/add-transaction",
              params: {
                type: "EXPENSE",
                accountId: account.id,
              },
            })
          }}
          style={styles.actionBtn}
        >
          <View style={[styles.actionIconWrap, styles.iconExpense]}>
            <Plus size={18} color={theme.colors.destructive} />
          </View>
          <Text style={styles.actionBtnText}>Add Tx</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            haptics.light()
            router.push({
              pathname: "/modal/manage-account",
              params: { id: account.id },
            })
          }}
          style={styles.actionBtn}
        >
          <View style={[styles.actionIconWrap, styles.iconEdit]}>
            <Edit3 size={18} color={theme.colors.textPrimary} />
          </View>
          <Text style={styles.actionBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <Caption style={styles.ledgerHeader}>
        ACCOUNT LEDGER ({transactions.length})
      </Caption>
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: account.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/modal/manage-account",
                  params: { id: account.id },
                })
              }}
              style={styles.headerEditBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.headerEditBtnText}>Edit</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.container}>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id || ""}
          ListHeaderComponent={renderHeader}
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
          renderItem={({ item }) => (
            <TransactionListItem
              item={item}
              account={account}
              budget={item.budgetId ? budgetsMap.get(item.budgetId) : undefined}
              baseCurrency={baseCurrency}
              onPress={() => {
                haptics.light()
                router.push({
                  pathname: "/(app)/finance/transactions/[id]",
                  params: { id: item.id },
                })
              }}
            />
          )}
          ListEmptyComponent={
            isTxnsLoading ? (
              <View style={{ gap: 10, paddingHorizontal: 16 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <EmptyState
                  icon={
                    <ReceiptText size={28} color={theme.colors.textMuted} />
                  }
                  title="No transactions found"
                  description="Transactions booked under this account will appear here."
                />
              </View>
            )
          }
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  backToAccountsBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backToAccountsText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    paddingBottom: 40,
  },
  headerEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerEditBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  headerSection: {
    padding: 16,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
    minHeight: 74,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTransfer: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  iconAdjust: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  iconExpense: {
    backgroundColor: "rgba(244, 63, 94, 0.12)",
  },
  iconEdit: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textAlign: "center",
    lineHeight: 14,
  },
  ledgerHeader: {
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
})
