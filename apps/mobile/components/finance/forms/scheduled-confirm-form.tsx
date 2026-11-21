import { useState, useMemo, useRef, useCallback } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Keyboard,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  Tag,
  FileText,
  AlertCircle,
  ChevronRight,
  CalendarClock,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ConfirmTransactionSchema,
  type ConfirmTransactionFormValues,
} from "@saturn/schemas"
import {
  toCentsString,
  formatAmount,
  getCurrencySymbol,
  getScheduledDisplayName,
} from "@saturn/core"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import {
  useConfirmScheduledTransactionMutation,
  type Budget,
  type Account,
  type ScheduledTransaction,
  type RecurringTransaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { useTheme } from "@/lib/theme"
import { BudgetCategoryIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import {
  ScheduledPickerSheet,
  BudgetPickerSheet,
  AccountPickerSheet,
} from "../sheets"
import { AccountRow } from "../account-select"
import { HeroAmountInput } from "@/components/ui/amount-input"
import { FormRowInput, FormDateRow } from "@/components/ui/form-primitives"
import { useFormStyles } from "./form-styles"

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
  initialAccountId?: string
  onAccountChange?: (accountId: string) => void
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
  initialAccountId,
  onAccountChange,
}: ScheduledConfirmFormProps) {
  const { colors, getBudgetColors } = useTheme()
  const { t } = useI18n()
  const formStyles = useFormStyles()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const scheduledSheetRef = useRef<BottomSheet>(null)
  const budgetSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  const [selectedScheduled, setSelectedScheduled] =
    useState<ScheduledTransaction | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const currentScheduled = useMemo(() => {
    if (selectedScheduled) return selectedScheduled
    if (initialScheduledId) {
      return (
        pendingScheduled.find((s) => s.id === initialScheduledId) ||
        pendingScheduled[0] ||
        null
      )
    }
    return pendingScheduled[0] || null
  }, [selectedScheduled, initialScheduledId, pendingScheduled])

  const resolvedFormValues: ConfirmTransactionFormValues = useMemo(() => {
    if (!currentScheduled) {
      return {
        type: "EXPENSE",
        amount: "",
        accountId: initialAccountId || "",
        budgetId: "",
        description: "",
        transactionDate: new Date(),
        effectiveDate: new Date(),
      }
    }

    const amountVal = (
      parseInt(currentScheduled.amount || "0", 10) / 100
    ).toFixed(2)
    const displayName = getScheduledDisplayName(
      currentScheduled,
      recurringTemplates
    )
    const resolvedType =
      currentScheduled.type === "INCOME" ? "INCOME" : "EXPENSE"
    const resolvedBudgetId =
      currentScheduled.budgetId ||
      (budgets.length > 0 ? budgets[0].id || "" : "")
    const targetAccId =
      currentScheduled.accountId ||
      initialAccountId ||
      (accounts.find((a) => a.isDefault) || accounts[0])?.id ||
      ""

    return {
      type: resolvedType,
      amount: amountVal,
      description: displayName,
      budgetId: resolvedType === "EXPENSE" ? resolvedBudgetId : undefined,
      accountId: targetAccId,
      transactionDate: new Date(currentScheduled.dueDate || new Date()),
      effectiveDate: new Date(),
    }
  }, [
    currentScheduled,
    recurringTemplates,
    budgets,
    accounts,
    initialAccountId,
  ])

  // React Hook Form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmTransactionFormValues>({
    resolver: zodResolver(ConfirmTransactionSchema),
    defaultValues: resolvedFormValues,
    values: resolvedFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watched Values
  const amount = useWatch({ control, name: "amount" })
  const selectedBudgetId = useWatch({ control, name: "budgetId" })
  const selectedAccountId = useWatch({ control, name: "accountId" })

  // Mutation
  const confirmScheduledMutation = useConfirmScheduledTransactionMutation()

  const applyScheduledItem = useCallback(
    (st: ScheduledTransaction) => {
      setSelectedScheduled(st)
      const targetAccId =
        st.accountId ||
        initialAccountId ||
        (accounts.find((a) => a.isDefault) || accounts[0])?.id ||
        ""
      onAccountChange?.(targetAccId)
    },
    [accounts, initialAccountId, onAccountChange]
  )

  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId),
    [budgets, selectedBudgetId]
  )
  const selectedBudgetColors = getBudgetColors(
    selectedBudget?.color || "indigo"
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

  const parsedAmount = parseFloat(amount || "0")
  const amountDecimal = isNaN(parsedAmount) ? "0.00" : parsedAmount.toFixed(2)

  // Submit Handler
  const onSubmit = async (values: ConfirmTransactionFormValues) => {
    if (!currentScheduled?.id) {
      haptics.error()
      setSubmissionError(t("finance.recurring.confirm.selectScheduledRequired"))
      return
    }

    haptics.light()
    setSubmissionError(null)

    try {
      const dateIso = toLocalISODate(values.transactionDate)
      const centsStr = toCentsString(values.amount)

      await confirmScheduledMutation.mutateAsync({
        transaction_id: currentScheduled.id,
        req: {
          transactionId: currentScheduled.id,
          transactionDate: dateIso,
          effectiveDate: dateIso,
          actualAmount: centsStr,
          description: values.description.trim() || undefined,
          accountId: values.accountId || undefined,
          budgetId:
            values.type === "EXPENSE"
              ? values.budgetId || undefined
              : undefined,
        },
      })

      toast.show({
        type: "success",
        title: t("finance.recurring.confirm.toastConfirmedTitle"),
        message: t("finance.recurring.confirm.toastConfirmedDesc", {
          amount: `${currentSymbol}${amountDecimal}`,
        }),
      })

      await invalidateFinanceQueries(queryClient)
      onSuccess()
    } catch (err: unknown) {
      haptics.error()
      const errMsg =
        err instanceof Error
          ? err.message
          : t("finance.budgets.unexpectedError")
      setSubmissionError(errMsg)
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
              { backgroundColor: `${colors.accent}26` },
            ]}
          >
            <CalendarClock size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={formStyles.specialSelectorLabel}>
              {t("finance.recurring.confirm.scheduledItemLabel")}
            </Text>
            <Text style={formStyles.specialSelectorValue} numberOfLines={1}>
              {currentScheduled
                ? `${getScheduledDisplayName(currentScheduled, recurringTemplates)} • ${t("finance.transactions.scheduled.dueOn", { date: formatAmount(currentScheduled.amount, currentCurrency) })}`
                : t("finance.recurring.confirm.selectScheduledItem")}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Amount & Currency Field */}
        <HeroAmountInput
          control={control}
          name="amount"
          currency={currentCurrency}
          currencySymbol={currentSymbol}
          currencyDisabled
          label={t("finance.transactions.scheduled.actualAmount").toUpperCase()}
          accentColor={colors.accent}
          autoFocus
        />

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Field: Budget (if Expense) */}
          {currentScheduled?.type !== "INCOME" && (
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
                  <Tag size={16} color={colors.textMuted} />
                  <Text style={formStyles.formRowLabel}>
                    {t("finance.recurring.confirm.budgetCategory")}
                  </Text>
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
                      <BudgetCategoryIcon
                        icon={selectedBudget?.icon}
                        name={selectedBudget?.name}
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
                      {t("finance.recurring.sheet.budgetPlaceholder")}
                    </Text>
                  )}
                  <ChevronRight size={14} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
              {errors.budgetId ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 16,
                    paddingBottom: 8,
                  }}
                >
                  <AlertCircle size={12} color={colors.destructive} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.destructive,
                      fontWeight: "500",
                    }}
                  >
                    {errors.budgetId.message}
                  </Text>
                </View>
              ) : null}
              <View style={formStyles.rowDivider} />
            </>
          )}

          {/* Field: Account */}
          <AccountRow
            label={t("finance.recurring.confirm.paidViaAccount")}
            account={selectedAccount}
            error={errors.accountId?.message}
            onPress={() => {
              Keyboard.dismiss()
              accountSheetRef.current?.expand()
            }}
          />

          {/* Field: Description */}
          <View style={formStyles.rowDivider} />
          <FormRowInput
            control={control}
            name="description"
            label={t("finance.recurring.confirm.descriptionNotes")}
            icon={<FileText size={16} color={colors.textMuted} />}
            placeholder={t("finance.recurring.confirm.descriptionPlaceholder")}
            returnKeyType="done"
          />

          {/* Field: Cleared Date */}
          <View style={formStyles.rowDivider} />
          <FormDateRow
            control={control}
            name="transactionDate"
            label={t("finance.recurring.confirm.dateCleared")}
          />
        </Card>

        {/* Error Box */}
        {submissionError && (
          <View style={formStyles.errorBox}>
            <AlertCircle size={15} color={colors.destructive} />
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
          style={[formStyles.submitBtn, formStyles.submitBtnScheduled]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {`${t("finance.recurring.confirm.confirmPayment")} • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <ScheduledPickerSheet
        ref={scheduledSheetRef}
        scheduledTransactions={pendingScheduled}
        recurringTemplates={recurringTemplates}
        selectedScheduledId={currentScheduled?.id}
        onSelect={applyScheduledItem}
        isLoading={scheduledLoading}
      />

      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={selectedBudgetId || ""}
        onSelect={(b) => {
          if (b.id) {
            setValue("budgetId", b.id, { shouldValidate: true })
          }
        }}
        isLoading={budgetsLoading}
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
