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
  Tag,
  FileText,
  Landmark,
  Calendar,
  AlertCircle,
  ChevronRight,
  CalendarClock,
} from "lucide-react-native"
import { toCentsString, formatAmount } from "@saturn/core"
import {
  useConfirmScheduledTransactionMutation,
  type Budget,
  type Account,
  type ScheduledTransaction,
  type RecurringTransaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import {
  DatePickerSheet,
  toLocalISODate,
  formatDisplayDate,
} from "@/components/ui/date-picker-sheet"
import {
  ScheduledPickerSheet,
  BudgetPickerSheet,
  AccountPickerSheet,
} from "../sheets"
import {
  getCurrencySymbol,
  invalidateFinanceQueries,
  getScheduledDisplayName,
} from "../finance-utils"
import { formStyles } from "./form-styles"

export interface ScheduledConfirmFormProps {
  pendingScheduled: ScheduledTransaction[]
  recurringTemplates?: RecurringTransaction[]
  budgets: Budget[]
  accounts: Account[]
  baseCurrency: string
  onSuccess: () => void
  scheduledLoading?: boolean
  budgetsLoading?: boolean
  initialScheduledId?: string
}

export function ScheduledConfirmForm({
  pendingScheduled,
  recurringTemplates = [],
  budgets,
  accounts,
  baseCurrency,
  onSuccess,
  scheduledLoading,
  budgetsLoading,
  initialScheduledId,
}: ScheduledConfirmFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const scheduledSheetRef = useRef<BottomSheet>(null)
  const budgetSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // Form State
  const [selectedScheduled, setSelectedScheduled] =
    useState<ScheduledTransaction | null>(null)
  const [amountText, setAmountText] = useState("")
  const [description, setDescription] = useState("")
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())

  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mutation
  const confirmScheduledMutation = useConfirmScheduledTransactionMutation()

  // Auto-select scheduled item if available
  useEffect(() => {
    if (pendingScheduled.length > 0 && !selectedScheduled) {
      const target = initialScheduledId
        ? pendingScheduled.find((s) => s.id === initialScheduledId) ||
          pendingScheduled[0]
        : pendingScheduled[0]
      applyScheduledItem(target)
    }
  }, [pendingScheduled, selectedScheduled, initialScheduledId])

  const applyScheduledItem = (st: ScheduledTransaction) => {
    setSelectedScheduled(st)
    const amountVal = (parseInt(st.amount || "0", 10) / 100).toFixed(2)
    setAmountText(amountVal)
    const displayName = getScheduledDisplayName(st, recurringTemplates)
    setDescription(displayName)
    if (st.budgetId) {
      setSelectedBudgetId(st.budgetId)
    } else if (budgets.length > 0) {
      setSelectedBudgetId(budgets[0].id || "")
    }
    if (st.accountId) {
      setSelectedAccountId(st.accountId)
    } else if (accounts.length > 0) {
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      setSelectedAccountId(defaultAcc.id || "")
    }
  }

  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId),
    [budgets, selectedBudgetId]
  )
  const selectedBudgetColors = getNativeBudgetColors(
    selectedBudget?.color || "indigo"
  )
  const SelectedBudgetIcon = useMemo(
    () => getBudgetIcon(selectedBudget?.icon, selectedBudget?.name),
    [selectedBudget?.icon, selectedBudget?.name]
  )

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency =
    selectedBudget?.currency ||
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

    if (!selectedScheduled) {
      haptics.error()
      setValidationError("Please select a pending scheduled item to confirm.")
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

      await confirmScheduledMutation.mutateAsync({
        transaction_id: selectedScheduled.id || "",
        req: {
          transactionId: selectedScheduled.id || "",
          transactionDate: dateIso,
          effectiveDate: dateIso,
          actualAmount: centsStr,
          description: description.trim() || undefined,
          accountId: selectedAccountId || undefined,
          budgetId:
            selectedScheduled.type === "EXPENSE"
              ? selectedBudgetId || undefined
              : undefined,
        },
      })

      toast.show({
        type: "success",
        title: "Scheduled Bill Confirmed",
        message: `Cleared scheduled item for ${currentSymbol}${amountDecimal}`,
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
        {/* Scheduled Item Selector Card */}
        <TouchableOpacity
          style={formStyles.specialSelectorCard}
          activeOpacity={0.7}
          onPress={() => {
            Keyboard.dismiss()
            scheduledSheetRef.current?.expand()
          }}
        >
          <View
            style={[
              formStyles.specialSelectorIcon,
              { backgroundColor: "rgba(99, 102, 241, 0.15)" },
            ]}
          >
            <CalendarClock size={20} color="#6366f1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={formStyles.specialSelectorLabel}>Scheduled Bill</Text>
            <Text style={formStyles.specialSelectorValue} numberOfLines={1}>
              {selectedScheduled
                ? `${getScheduledDisplayName(selectedScheduled, recurringTemplates)} (${formatAmount(selectedScheduled.amount, selectedScheduled.currency)})`
                : "Tap to select pending bill..."}
            </Text>
          </View>
          <ChevronRight size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>

        {/* Amount Field */}
        <View style={formStyles.amountCard}>
          <Text style={formStyles.fieldSectionLabel}>ACTUAL AMOUNT</Text>
          <View style={formStyles.amountInputRow}>
            <Text
              style={[formStyles.amountCurrencyPrefix, { color: "#6366f1" }]}
            >
              {currentSymbol}
            </Text>
            <TextInput
              style={[formStyles.amountInput, { color: "#6366f1" }]}
              keyboardType="decimal-pad"
              value={amountText}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={handleAmountChange}
              selectionColor="#6366f1"
            />
          </View>
        </View>

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Budget Field (for Expense scheduled items) */}
          {selectedScheduled?.type !== "INCOME" && (
            <>
              <TouchableOpacity
                style={formStyles.formRow}
                activeOpacity={0.7}
                onPress={() => {
                  Keyboard.dismiss()
                  budgetSheetRef.current?.expand()
                }}
              >
                <View style={formStyles.formRowLabelGroup}>
                  <Tag size={16} color={theme.colors.textMuted} />
                  <Text style={formStyles.formRowLabel}>Budget</Text>
                </View>
                <View style={formStyles.formRowValueGroup}>
                  {selectedBudget ? (
                    <View
                      style={[
                        formStyles.selectedBudgetChip,
                        {
                          backgroundColor: selectedBudgetColors.bg,
                          borderColor: selectedBudgetColors.border,
                        },
                      ]}
                    >
                      <SelectedBudgetIcon
                        size={13}
                        color={selectedBudgetColors.bar}
                      />
                      <Text
                        style={[
                          formStyles.selectedBudgetText,
                          { color: selectedBudgetColors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedBudget.name}
                      </Text>
                    </View>
                  ) : (
                    <Text style={formStyles.placeholderText}>
                      Select budget
                    </Text>
                  )}
                  <ChevronRight size={14} color={theme.colors.textMuted} />
                </View>
              </TouchableOpacity>
              <View style={formStyles.rowDivider} />
            </>
          )}

          {/* Account Field */}
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
              placeholder="Description"
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
          style={[formStyles.submitBtn, formStyles.submitBtnScheduled]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSave}
        >
          {`Clear Bill • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <ScheduledPickerSheet
        ref={scheduledSheetRef}
        scheduledTransactions={pendingScheduled}
        recurringTemplates={recurringTemplates}
        selectedScheduledId={selectedScheduled?.id}
        onSelect={applyScheduledItem}
        isLoading={scheduledLoading}
      />

      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={selectedBudgetId}
        onSelect={(b) => setSelectedBudgetId(b.id || "")}
        isLoading={budgetsLoading}
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
