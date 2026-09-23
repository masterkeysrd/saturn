import { useState, useEffect } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  CalendarClock,
  HandCoins,
} from "lucide-react-native"
import {
  useGetTransactionQuery,
  useListBudgetsQuery,
  useListAccountsQuery,
  useGetFinanceSettingsQuery,
  useListExchangeRatesQuery,
  useListScheduledTransactionsQuery,
  useListBorrowingsQuery,
  useListCurrenciesQuery,
  type Budget,
  type Account,
  type ScheduledTransaction,
  type Borrowing,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  ExpenseForm,
  IncomeForm,
  TransferForm,
  ScheduledConfirmForm,
  BorrowingForm,
} from "@/components/finance/forms"

export type TransactionFlowType =
  "EXPENSE" | "INCOME" | "TRANSFER" | "SCHEDULED" | "BORROWING"

export default function AddTransactionModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editTransactionId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = !!editTransactionId

  const [activeType, setActiveType] = useState<TransactionFlowType>("EXPENSE")

  // Queries
  const { data: settingsData } = useGetFinanceSettingsQuery(
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
    { pageSize: 100, pageToken: "" },
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
      },
      { enabled: !!activeSpaceId }
    )
  const pendingScheduled: ScheduledTransaction[] =
    scheduledData?.scheduledTransactions || []

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

  // Sync activeType if editing existing transaction
  useEffect(() => {
    if (existingTx) {
      setActiveType(existingTx.type === "INCOME" ? "INCOME" : "EXPENSE")
    }
  }, [existingTx])

  if (isEditMode && txLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading transaction...</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: isEditMode
              ? activeType === "INCOME"
                ? "Edit Income"
                : "Edit Expense"
              : "New Transaction",
            headerStyle: {
              backgroundColor: theme.colors.background,
            },
            headerTintColor: theme.colors.textPrimary,
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
                      ? theme.colors.destructive
                      : theme.colors.textMuted
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
                    activeType === "INCOME"
                      ? theme.colors.success
                      : theme.colors.textMuted
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
                      ? theme.colors.primary
                      : theme.colors.textMuted
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
                      ? "#818cf8"
                      : theme.colors.textMuted
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
                      ? "#f59e0b"
                      : theme.colors.textMuted
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
          />
        )}

        {activeType === "TRANSFER" && (
          <TransferForm
            accounts={accounts}
            exchangeRates={exchangeRates}
            onSuccess={() => router.back()}
          />
        )}

        {activeType === "SCHEDULED" && (
          <ScheduledConfirmForm
            pendingScheduled={pendingScheduled}
            budgets={budgets}
            accounts={accounts}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            scheduledLoading={scheduledLoading}
            budgetsLoading={budgetsLoading}
          />
        )}

        {activeType === "BORROWING" && (
          <BorrowingForm
            activeBorrowings={activeBorrowings}
            accounts={accounts}
            baseCurrency={baseCurrency}
            onSuccess={() => router.back()}
            borrowingsLoading={borrowingsLoading}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  typeSwitcherWrapper: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  typeSwitcherContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typePillText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  typePillExpenseActive: {
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  typePillExpenseTextActive: {
    color: theme.colors.destructive,
    fontWeight: "700",
  },
  typePillIncomeActive: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSubtle,
  },
  typePillIncomeTextActive: {
    color: theme.colors.success,
    fontWeight: "700",
  },
  typePillTransferActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  typePillTransferTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  typePillScheduledActive: {
    borderColor: "#818cf8",
    backgroundColor: "rgba(129, 140, 248, 0.15)",
  },
  typePillScheduledTextActive: {
    color: "#818cf8",
    fontWeight: "700",
  },
  typePillBorrowingActive: {
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  typePillBorrowingTextActive: {
    color: "#f59e0b",
    fontWeight: "700",
  },
})
