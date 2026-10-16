import { useMemo, useRef, useState } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  StyleSheet,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  FileText,
  AlertCircle,
  ChevronRight,
  HandCoins,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RepaymentSchema, type RepaymentFormValues } from "@saturn/schemas"
import { toCentsString, formatAmount } from "@saturn/core"
import {
  useLogBorrowingTransactionMutation,
  type Account,
  type Borrowing,
  type BorrowingTransactionType,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import { BorrowingPickerSheet, AccountPickerSheet } from "../sheets"
import { AccountRow } from "../account-select"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { HeroAmountInput } from "@/components/ui/amount-input"
import {
  FormRowInput,
  FormDateRow,
  FormPillGroup,
} from "@/components/ui/form-primitives"
import { formStyles } from "./form-styles"

export interface BorrowingFormProps {
  activeBorrowings: Borrowing[]
  accounts: Account[]
  baseCurrency: string
  onSuccess: () => void
  borrowingsLoading?: boolean
  initialBorrowingId?: string
  initialAccountId?: string
  onAccountChange?: (accountId: string) => void
}

export function BorrowingForm({
  activeBorrowings,
  accounts,
  baseCurrency,
  onSuccess,
  borrowingsLoading,
  initialBorrowingId,
  initialAccountId,
  onAccountChange,
}: BorrowingFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const borrowingSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const resolvedDefaultValues: RepaymentFormValues = useMemo(() => {
    const targetBorrowing = initialBorrowingId
      ? activeBorrowings.find((b) => b.id === initialBorrowingId) ||
        activeBorrowings[0]
      : activeBorrowings[0]

    const targetAcc =
      (initialAccountId
        ? accounts.find((a) => a.id === initialAccountId)
        : null) ||
      accounts.find((a) => a.isDefault) ||
      accounts[0]

    return {
      borrowingId: targetBorrowing?.id || "",
      type: "BORROWING_TRANSACTION_TYPE_PAYMENT",
      amount: "",
      paymentDate: new Date(),
      accountId: targetAcc?.id || "",
      notes: "",
    }
  }, [activeBorrowings, initialBorrowingId, accounts, initialAccountId])

  // React Hook Form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RepaymentFormValues>({
    resolver: zodResolver(RepaymentSchema),
    defaultValues: resolvedDefaultValues,
    values: resolvedDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watched Values
  const borrowingId = useWatch({ control, name: "borrowingId" })
  const borrowingActionType = useWatch({ control, name: "type" })
  const amount = useWatch({ control, name: "amount" })
  const selectedAccountId = useWatch({ control, name: "accountId" })

  // Mutation
  const logBorrowingMutation = useLogBorrowingTransactionMutation()

  const selectedBorrowing = useMemo(
    () => activeBorrowings.find((b) => b.id === borrowingId) || null,
    [activeBorrowings, borrowingId]
  )

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency = selectedBorrowing?.currency || baseCurrency || "USD"
  const currentSymbol = getCurrencySymbol(currentCurrency)

  const isLent = selectedBorrowing?.direction === "LENT"
  const isPayment = borrowingActionType === "BORROWING_TRANSACTION_TYPE_PAYMENT"

  const parsedAmount = parseFloat(amount || "0")
  const amountDecimal = isNaN(parsedAmount) ? "0.00" : parsedAmount.toFixed(2)

  // Submit Handler
  const onSubmit = async (values: RepaymentFormValues) => {
    if (!selectedBorrowing?.id) {
      haptics.error()
      setSubmissionError("Please select an active agreement.")
      return
    }

    haptics.light()
    setSubmissionError(null)

    try {
      const dateIso = toLocalISODate(values.paymentDate)
      const centsStr = toCentsString(values.amount)

      await logBorrowingMutation.mutateAsync({
        borrowing_id: selectedBorrowing.id,
        req: {
          borrowingId: selectedBorrowing.id,
          transaction: {
            type: (values.type ||
              "BORROWING_TRANSACTION_TYPE_PAYMENT") as BorrowingTransactionType,
            amount: centsStr,
            transactionDate: dateIso,
            notes: values.notes?.trim() || undefined,
            accountId: values.accountId || undefined,
          },
        },
      })

      toast.show({
        type: "success",
        title: isPayment
          ? isLent
            ? "Payment Received Recorded"
            : "Repayment Recorded"
          : isLent
            ? "Additional Loan Recorded"
            : "Drawdown Recorded",
        message: `${currentSymbol}${amountDecimal} logged for ${selectedBorrowing.counterparty}`,
      })

      await invalidateFinanceQueries(queryClient)
      onSuccess()
    } catch (err: unknown) {
      haptics.error()
      const errMsg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while saving."
      setSubmissionError(errMsg)
    }
  }

  const actionOptions = useMemo(
    () => [
      {
        label: isLent ? "Receive Payment" : "Make Repayment",
        value: "BORROWING_TRANSACTION_TYPE_PAYMENT",
        activeColor: "#d97706",
        activeBg: "rgba(245, 158, 11, 0.15)",
        activeBorder: "#f59e0b",
        activeTextColor: "#f59e0b",
      },
      {
        label: isLent ? "Give Additional Loan" : "Take Additional Draw",
        value: "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
        activeColor: "#d97706",
        activeBg: "rgba(245, 158, 11, 0.15)",
        activeBorder: "#f59e0b",
        activeTextColor: "#f59e0b",
      },
    ],
    [isLent]
  )

  return (
    <>
      <ScrollView
        contentContainerStyle={formStyles.formScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Loan Agreement Selector Card */}
        <TouchableOpacity
          style={formStyles.specialSelectorCard}
          activeOpacity={0.7}
          onPress={() => {
            Keyboard.dismiss()
            borrowingSheetRef.current?.expand()
          }}
        >
          <View
            style={[
              formStyles.specialSelectorIcon,
              { backgroundColor: "rgba(245, 158, 11, 0.15)" },
            ]}
          >
            <HandCoins size={20} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={formStyles.specialSelectorLabel}>
              Active Agreement
            </Text>
            <Text style={formStyles.specialSelectorValue} numberOfLines={1}>
              {selectedBorrowing
                ? `${selectedBorrowing.counterparty} • ${formatAmount(selectedBorrowing.remainingAmount, selectedBorrowing.currency)} remaining`
                : "Select agreement..."}
            </Text>
          </View>
          <ChevronRight size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>

        {/* Transaction Type Pills */}
        <View style={{ marginBottom: 12 }}>
          <FormPillGroup
            control={control}
            name="type"
            options={actionOptions}
          />
        </View>

        {/* Amount & Currency Field */}
        <HeroAmountInput
          control={control}
          name="amount"
          currency={currentCurrency}
          currencySymbol={currentSymbol}
          currencyDisabled
          accentColor="#d97706"
          autoFocus
        />

        {/* Agreement Status Mini Summary */}
        {selectedBorrowing && (
          <View style={styles.agreementInfoCard}>
            <View style={styles.agreementInfoRow}>
              <Text style={styles.agreementInfoLabel}>Direction:</Text>
              <Text style={styles.agreementInfoVal}>
                {isLent
                  ? "I lent money (Owed to me)"
                  : "I borrowed money (I owe)"}
              </Text>
            </View>
            <View style={styles.agreementInfoRow}>
              <Text style={styles.agreementInfoLabel}>Remaining:</Text>
              <Text style={styles.agreementInfoVal}>
                {formatAmount(
                  selectedBorrowing.remainingAmount,
                  selectedBorrowing.currency
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Field: Linked Payment Account */}
          <AccountRow
            label="Linked Account"
            account={selectedAccount}
            error={errors.accountId?.message}
            onPress={() => {
              Keyboard.dismiss()
              accountSheetRef.current?.expand()
            }}
          />

          {/* Field: Payment Date */}
          <View style={formStyles.rowDivider} />
          <FormDateRow
            control={control}
            name="paymentDate"
            label="Transaction Date"
          />

          {/* Field: Memo / Notes */}
          <View style={formStyles.rowDivider} />
          <FormRowInput
            control={control}
            name="notes"
            label="Notes"
            icon={<FileText size={16} color={theme.colors.textMuted} />}
            placeholder="e.g. Bank transfer ref, monthly check"
            returnKeyType="done"
          />
        </Card>

        {/* Error Box */}
        {submissionError && (
          <View style={formStyles.errorBox}>
            <AlertCircle size={15} color={theme.colors.destructive} />
            <Text style={formStyles.errorText}>{submissionError}</Text>
          </View>
        )}
      </ScrollView>

      {/* Docked Bottom CTA */}
      <View
        style={[
          formStyles.bottomDock,
          { paddingBottom: Math.max(insets.bottom, 12) + 6 },
        ]}
      >
        <Button
          style={[formStyles.submitBtn, formStyles.submitBtnBorrowing]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {isPayment
            ? isLent
              ? `Receive ${currentSymbol}${amountDecimal}`
              : `Repay ${currentSymbol}${amountDecimal}`
            : isLent
              ? `Lend ${currentSymbol}${amountDecimal}`
              : `Borrow ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <BorrowingPickerSheet
        ref={borrowingSheetRef}
        borrowings={activeBorrowings}
        selectedBorrowingId={borrowingId || ""}
        onSelect={(b) => {
          if (b.id) {
            setValue("borrowingId", b.id, { shouldValidate: true })
          }
        }}
        isLoading={borrowingsLoading}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={selectedAccountId || ""}
        onSelect={(accId) => {
          setValue("accountId", accId, { shouldValidate: true })
          onAccountChange?.(accId)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  agreementInfoCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: theme.radius.lg,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  agreementInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agreementInfoLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  agreementInfoVal: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
})
