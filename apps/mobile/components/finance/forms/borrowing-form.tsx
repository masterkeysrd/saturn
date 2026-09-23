import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Keyboard,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  FileText,
  Landmark,
  Calendar,
  AlertCircle,
  ChevronRight,
  HandCoins,
} from "lucide-react-native"
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
import {
  DatePickerSheet,
  toLocalISODate,
  formatDisplayDate,
} from "@/components/ui/date-picker-sheet"
import { BorrowingPickerSheet, AccountPickerSheet } from "../sheets"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { formStyles } from "./form-styles"

export interface BorrowingFormProps {
  activeBorrowings: Borrowing[]
  accounts: Account[]
  baseCurrency: string
  onSuccess: () => void
  borrowingsLoading?: boolean
}

export function BorrowingForm({
  activeBorrowings,
  accounts,
  baseCurrency,
  onSuccess,
  borrowingsLoading,
}: BorrowingFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const borrowingSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // Form State
  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(
    null
  )
  const [borrowingActionType, setBorrowingActionType] = useState<
    | "BORROWING_TRANSACTION_TYPE_PAYMENT"
    | "BORROWING_TRANSACTION_TYPE_DISBURSEMENT"
  >("BORROWING_TRANSACTION_TYPE_PAYMENT")
  const [amountText, setAmountText] = useState("")
  const [description, setDescription] = useState("")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())

  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mutation
  const logBorrowingMutation = useLogBorrowingTransactionMutation()

  // Auto-select first loan agreement
  useEffect(() => {
    if (activeBorrowings.length > 0 && !selectedBorrowing) {
      setSelectedBorrowing(activeBorrowings[0])
    }
  }, [activeBorrowings, selectedBorrowing])

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      setSelectedAccountId(defaultAcc.id || "")
    }
  }, [accounts, selectedAccountId])

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency =
    selectedBorrowing?.currency ||
    selectedAccount?.currency ||
    baseCurrency ||
    "USD"
  const currentSymbol = getCurrencySymbol(currentCurrency)

  // Amount input handler
  const handleAmountChange = (text: string) => {
    let cleaned = text.replace(/[^0-9.]/g, "")
    const parts = cleaned.split(".")
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("")
    }
    if (parts[1] && parts[1].length > 2) {
      cleaned = parts[0] + "." + parts[1].slice(0, 2)
    }
    setAmountText(cleaned)
    setValidationError(null)
  }

  const parsedAmount = parseFloat(amountText || "0")
  const amountDecimal = isNaN(parsedAmount) ? "0.00" : parsedAmount.toFixed(2)

  // Handle Submit
  const handleSave = async () => {
    if (isSubmitting) return
    haptics.light()

    if (!selectedBorrowing) {
      haptics.error()
      setValidationError("Please select an active loan agreement.")
      return
    }

    if (parsedAmount <= 0) {
      haptics.error()
      setValidationError("Please enter an amount greater than 0.")
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      const dateIso = toLocalISODate(transactionDate)
      const centsStr = toCentsString(amountDecimal)

      await logBorrowingMutation.mutateAsync({
        borrowing_id: selectedBorrowing.id || "",
        req: {
          borrowingId: selectedBorrowing.id || "",
          transaction: {
            type: borrowingActionType as BorrowingTransactionType,
            amount: centsStr,
            transactionDate: dateIso,
            notes: description.trim() || undefined,
            accountId: selectedAccountId || undefined,
          },
        },
      })

      toast.show({
        type: "success",
        title:
          borrowingActionType === "BORROWING_TRANSACTION_TYPE_PAYMENT"
            ? "Payment Recorded"
            : "Disbursement Recorded",
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
      setValidationError(errMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

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
                ? `${selectedBorrowing.counterparty || "Agreement"} (${formatAmount(selectedBorrowing.totalAmount, selectedBorrowing.currency)})`
                : "Tap to select loan agreement..."}
            </Text>
          </View>
          <ChevronRight size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>

        {/* Action Toggle: Repayment vs Drawdown */}
        <View style={[formStyles.borrowingActionToggle, { marginBottom: 12 }]}>
          <TouchableOpacity
            style={[
              formStyles.borrowingActionBtn,
              borrowingActionType === "BORROWING_TRANSACTION_TYPE_PAYMENT" &&
                formStyles.borrowingActionActive,
            ]}
            onPress={() => {
              haptics.light()
              setBorrowingActionType("BORROWING_TRANSACTION_TYPE_PAYMENT")
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                formStyles.borrowingActionText,
                borrowingActionType === "BORROWING_TRANSACTION_TYPE_PAYMENT" &&
                  formStyles.borrowingActionTextActive,
              ]}
            >
              Repayment (Expense)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              formStyles.borrowingActionBtn,
              borrowingActionType ===
                "BORROWING_TRANSACTION_TYPE_DISBURSEMENT" &&
                formStyles.borrowingActionActive,
            ]}
            onPress={() => {
              haptics.light()
              setBorrowingActionType("BORROWING_TRANSACTION_TYPE_DISBURSEMENT")
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                formStyles.borrowingActionText,
                borrowingActionType ===
                  "BORROWING_TRANSACTION_TYPE_DISBURSEMENT" &&
                  formStyles.borrowingActionTextActive,
              ]}
            >
              Drawdown (Income)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount Field */}
        <View style={formStyles.amountCard}>
          <Text style={formStyles.fieldSectionLabel}>AMOUNT</Text>
          <View style={formStyles.amountInputRow}>
            <Text
              style={[formStyles.amountCurrencyPrefix, { color: "#d97706" }]}
            >
              {currentSymbol}
            </Text>
            <TextInput
              style={[formStyles.amountInput, { color: "#d97706" }]}
              keyboardType="decimal-pad"
              value={amountText}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={handleAmountChange}
              selectionColor="#d97706"
            />
          </View>
        </View>

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Account */}
          <TouchableOpacity
            style={formStyles.formRow}
            activeOpacity={0.7}
            onPress={() => {
              Keyboard.dismiss()
              accountSheetRef.current?.expand()
            }}
          >
            <View style={formStyles.formRowLabelGroup}>
              <Landmark size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel}>Account</Text>
            </View>
            <View style={formStyles.formRowValueGroup}>
              <Text style={formStyles.formRowValueText} numberOfLines={1}>
                {selectedAccount
                  ? `${selectedAccount.name} (${selectedAccount.currency})`
                  : "No Account (Cash)"}
              </Text>
              <ChevronRight size={14} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Description */}
          <View style={formStyles.rowDivider} />
          <View style={formStyles.formRow}>
            <View style={formStyles.formRowLabelGroup}>
              <FileText size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel}>Description</Text>
            </View>
            <TextInput
              style={formStyles.formRowInput}
              placeholder="Notes / reference"
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={(val) => {
                setDescription(val)
                setValidationError(null)
              }}
              returnKeyType="done"
            />
          </View>

          {/* Date */}
          <View style={formStyles.rowDivider} />
          <TouchableOpacity
            style={formStyles.formRow}
            activeOpacity={0.7}
            onPress={() => {
              Keyboard.dismiss()
              dateSheetRef.current?.expand()
            }}
          >
            <View style={formStyles.formRowLabelGroup}>
              <Calendar size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel}>Transaction Date</Text>
            </View>
            <View style={formStyles.formRowValueGroup}>
              <Text style={formStyles.formRowValueText}>
                {formatDisplayDate(transactionDate)}
              </Text>
              <ChevronRight size={14} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
        </Card>

        {/* Error Box */}
        {validationError && (
          <View style={formStyles.errorBox}>
            <AlertCircle size={15} color={theme.colors.destructive} />
            <Text style={formStyles.errorText}>{validationError}</Text>
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
          onPress={handleSave}
        >
          {borrowingActionType === "BORROWING_TRANSACTION_TYPE_PAYMENT"
            ? `Record Payment • ${currentSymbol}${amountDecimal}`
            : `Record Drawdown • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <BorrowingPickerSheet
        ref={borrowingSheetRef}
        borrowings={activeBorrowings}
        selectedBorrowingId={selectedBorrowing?.id}
        onSelect={setSelectedBorrowing}
        isLoading={borrowingsLoading}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={setSelectedAccountId}
      />

      <DatePickerSheet
        ref={dateSheetRef}
        title="Select Transaction Date"
        value={transactionDate}
        onChange={setTransactionDate}
      />
    </>
  )
}
