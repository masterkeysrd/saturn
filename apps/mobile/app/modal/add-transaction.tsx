import { useState, useEffect } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  CalendarClock,
  HandCoins,
  X,
} from "lucide-react-native"
import {
  useGetTransactionQuery,
  useListBudgetsQuery,
  useListAccountsQuery,
  useGetSettingsQuery,
  useListExchangeRatesQuery,
  useListScheduledTransactionsQuery,
  useListRecurringTransactionsQuery,
  useListBorrowingsQuery,
  useListCurrenciesQuery,
  type Budget,
  type Account,
  type ScheduledTransaction,
  type RecurringTransaction,
  type Borrowing,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import {
  resolveTransactionFlowType,
  type TransactionFlowType,
} from "@/lib/quick-capture"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  ExpenseForm,
  IncomeForm,
  TransferForm,
  ScheduledConfirmForm,
  BorrowingForm,
} from "@/components/finance/forms"

export type { TransactionFlowType }

export default function AddTransactionModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const {
    id: editTransactionId,
    type: initialType,
    tab: initialTab,
    accountId: initialAccountId,
    budgetId: initialBudgetId,
    scheduledTransactionId: initialScheduledId,
    borrowingId: initialBorrowingId,
  } = useLocalSearchParams<{
    id?: string
    type?: string
    tab?: string
    accountId?: string
    budgetId?: string
    scheduledTransactionId?: string
    borrowingId?: string
  }>()
  const isEditMode = !!editTransactionId
  const resolvedInitialType = resolveTransactionFlowType(
    initialType,
    initialTab
  )

  const [activeType, setActiveType] =
    useState<TransactionFlowType>(resolvedInitialType)
  const [selectedAccountId, setSelectedAccountId] = useState<
    string | undefined
  >(initialAccountId)

  // Queries
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  const { data: currenciesData, isLoading: currenciesLoading } =
    useListCurrenciesQuery(
      {},
      { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
    )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  const { data: budgetsData, isLoading: budgetsLoading } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "", view: "FULL" },
    { enabled: !!activeSpaceId }
  )
  const budgets: Budget[] = budgetsData?.budgets || []

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = accountsData?.accounts || []

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const exchangeRates = ratesData?.exchangeRates || []

  const { data: scheduledData, isLoading: scheduledLoading } =
    useListScheduledTransactionsQuery(
      {
        status: "PENDING",
        pageSize: 100,
        pageToken: "",
        startDate: "",
        endDate: "",
        view: "FULL",
      },
      { enabled: !!activeSpaceId }
    )
  const pendingScheduled: ScheduledTransaction[] =
    scheduledData?.scheduledTransactions || []

  const { data: recurringData } = useListRecurringTransactionsQuery(
    { status: "STATUS_UNSPECIFIED", pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const recurringTemplates: RecurringTransaction[] =
    recurringData?.recurringTransactions || []

  const { data: borrowingsData, isLoading: borrowingsLoading } =
    useListBorrowingsQuery(
      { status: "ACTIVE", pageSize: 100, pageToken: "" },
      { enabled: !!activeSpaceId }
    )
  const activeBorrowings: Borrowing[] = borrowingsData?.borrowings || []

  const { data: existingTx, isLoading: txLoading } = useGetTransactionQuery(
    { id: editTransactionId || "", view: "FULL" },
    { enabled: isEditMode }
  )

  // Sync activeType if editing existing transaction or if route query params change
  useEffect(() => {
    if (existingTx) {
      setActiveType(existingTx.type === "INCOME" ? "INCOME" : "EXPENSE")
      return
    }
    if (!isEditMode) {
      setActiveType(resolvedInitialType)
    }
  }, [existingTx, isEditMode, resolvedInitialType])

  if (isEditMode && txLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading transaction...</Text>
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: isEditMode
              ? activeType === "INCOME"
                ? "Edit Income"
                : "Edit Expense"
              : "New Transaction",
            ...(Platform.OS === "ios"
              ? {
                  unstable_headerLeftItems: () => [
                    {
                      type: "button",
                      label: "Close",
                      icon: { type: "sfSymbol", name: "xmark" },
                      onPress: () => {
                        haptics.light()
                        router.back()
                      },
                    },
                  ],
                }
              : {
                  headerStyle: {
                    backgroundColor: colors.background,
                  },
                  headerLeft: () => (
                    <TouchableOpacity
                      onPress={() => {
                        haptics.light()
                        router.back()
                      }}
                      style={{ paddingHorizontal: 4, paddingVertical: 4 }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Close"
                    >
                      <X size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  ),
                }),
            headerTintColor: colors.textPrimary,
          }}
        />

        {/* Segmented Flow Switcher (Hidden in edit mode) */}
        {!isEditMode && (
          <View style={styles.typeSwitcherWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeSwitcherContent}
            >
              {/* Type 1: Expense */}
              <TouchableOpacity
                style={[
                  styles.typePill,
                  activeType === "EXPENSE" && styles.typePillExpenseActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setActiveType("EXPENSE")
                }}
                activeOpacity={0.7}
              >
                <ArrowDownLeft
                  size={14}
                  color={
                    activeType === "EXPENSE"
                      ? colors.destructive
                      : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typePillText,
                    activeType === "EXPENSE" &&
                      styles.typePillExpenseTextActive,
                  ]}
                >
                  Expense
                </Text>
              </TouchableOpacity>

              {/* Type 2: Income */}
              <TouchableOpacity
                style={[
                  styles.typePill,
                  activeType === "INCOME" && styles.typePillIncomeActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setActiveType("INCOME")
                }}
                activeOpacity={0.7}
              >
                <ArrowUpRight
                  size={14}
                  color={
                    activeType === "INCOME" ? colors.success : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typePillText,
                    activeType === "INCOME" && styles.typePillIncomeTextActive,
                  ]}
                >
                  Income
                </Text>
              </TouchableOpacity>

              {/* Type 3: Transfer */}
              <TouchableOpacity
                style={[
                  styles.typePill,
                  activeType === "TRANSFER" && styles.typePillTransferActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setActiveType("TRANSFER")
                }}
                activeOpacity={0.7}
              >
                <ArrowRightLeft
                  size={14}
                  color={
                    activeType === "TRANSFER"
                      ? colors.primary
                      : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typePillText,
                    activeType === "TRANSFER" &&
                      styles.typePillTransferTextActive,
                  ]}
                >
                  Transfer
                </Text>
              </TouchableOpacity>

              {/* Type 4: Scheduled */}
              <TouchableOpacity
                style={[
                  styles.typePill,
                  activeType === "SCHEDULED" && styles.typePillScheduledActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setActiveType("SCHEDULED")
                }}
                activeOpacity={0.7}
              >
                <CalendarClock
                  size={14}
                  color={
                    activeType === "SCHEDULED"
                      ? colors.accent
                      : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typePillText,
                    activeType === "SCHEDULED" &&
                      styles.typePillScheduledTextActive,
                  ]}
                >
                  Scheduled
                  {pendingScheduled.length > 0
                    ? ` (${pendingScheduled.length})`
                    : ""}
                </Text>
              </TouchableOpacity>

              {/* Type 5: Loan */}
              <TouchableOpacity
                style={[
                  styles.typePill,
                  activeType === "BORROWING" && styles.typePillBorrowingActive,
                ]}
                onPress={() => {
                  haptics.light()
                  setActiveType("BORROWING")
                }}
                activeOpacity={0.7}
              >
                <HandCoins
                  size={14}
                  color={
                    activeType === "BORROWING"
                      ? colors.warning
                      : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.typePillText,
                    activeType === "BORROWING" &&
                      styles.typePillBorrowingTextActive,
                  ]}
                >
                  Loan
                  {activeBorrowings.length > 0
                    ? ` (${activeBorrowings.length})`
                    : ""}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Active Form Component */}
        {activeType === "EXPENSE" && (
          <ExpenseForm
            existingTx={existingTx}
            budgets={budgets}
            accounts={accounts}
            currencies={currencies}
            exchangeRates={exchangeRates}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            budgetsLoading={budgetsLoading}
            currenciesLoading={currenciesLoading}
            initialBudgetId={initialBudgetId}
            initialAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
          />
        )}

        {activeType === "INCOME" && (
          <IncomeForm
            existingTx={existingTx}
            accounts={accounts}
            currencies={currencies}
            exchangeRates={exchangeRates}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            currenciesLoading={currenciesLoading}
            initialAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
          />
        )}

        {activeType === "TRANSFER" && (
          <TransferForm
            accounts={accounts}
            exchangeRates={exchangeRates}
            onSuccess={() => router.back()}
            initialFromAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
          />
        )}

        {activeType === "SCHEDULED" && (
          <ScheduledConfirmForm
            pendingScheduled={pendingScheduled}
            recurringTemplates={recurringTemplates}
            budgets={budgets}
            accounts={accounts}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            scheduledLoading={scheduledLoading}
            budgetsLoading={budgetsLoading}
            initialScheduledId={initialScheduledId}
            initialAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
          />
        )}

        {activeType === "BORROWING" && (
          <BorrowingForm
            activeBorrowings={activeBorrowings}
            accounts={accounts}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            borrowingsLoading={borrowingsLoading}
            initialBorrowingId={initialBorrowingId}
            initialAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
          />
        )}
      </View>
    </GestureHandlerRootView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: t.colors.background,
    gap: 12,
  },
  loadingText: {
    color: t.colors.textMuted,
    fontSize: 14,
  },
  typeSwitcherWrapper: {
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  typeSwitcherContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  typePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  typePillText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  typePillExpenseActive: {
    borderColor: t.colors.destructive,
    backgroundColor: t.colors.destructiveSubtle,
  },
  typePillExpenseTextActive: {
    color: t.colors.destructive,
    fontWeight: "700" as const,
  },
  typePillIncomeActive: {
    borderColor: t.colors.success,
    backgroundColor: t.colors.successSubtle,
  },
  typePillIncomeTextActive: {
    color: t.colors.success,
    fontWeight: "700" as const,
  },
  typePillTransferActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  typePillTransferTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  typePillScheduledActive: {
    borderColor: t.colors.accent,
    backgroundColor: t.colors.primarySubtle,
  },
  typePillScheduledTextActive: {
    color: t.colors.accent,
    fontWeight: "700" as const,
  },
  typePillBorrowingActive: {
    borderColor: t.colors.warning,
    backgroundColor: t.colors.warningSubtle,
  },
  typePillBorrowingTextActive: {
    color: t.colors.warning,
    fontWeight: "700" as const,
  },
})
