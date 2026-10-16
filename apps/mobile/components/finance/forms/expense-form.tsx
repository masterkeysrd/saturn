import { useMemo, useRef, useCallback, useState } from "react"
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
  AlertTriangle,
  ChevronRight,
  Globe,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { transactionSchema, type TransactionFormValues } from "@saturn/schemas"
import { toCentsString, convertCurrency } from "@saturn/core"
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  type Budget,
  type Account,
  type CurrencyInfo,
  type ExchangeRate,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { BudgetCategoryIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import {
  BudgetPickerSheet,
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "../sheets"
import { AccountRow } from "../account-select"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { HeroAmountInput } from "@/components/ui/amount-input"
import {
  FormRowInput,
  FormEffectiveDateSection,
} from "@/components/ui/form-primitives"
import { formStyles } from "./form-styles"

export interface ExpenseFormProps {
  existingTx?: Transaction | null
  budgets: Budget[]
  accounts: Account[]
  currencies: CurrencyInfo[]
  exchangeRates: ExchangeRate[]
  baseCurrency: string
  onSuccess: () => void
  budgetsLoading?: boolean
  currenciesLoading?: boolean
  initialBudgetId?: string
  initialAccountId?: string
  onAccountChange?: (accountId: string) => void
}

export function ExpenseForm({
  existingTx,
  budgets,
  accounts,
  currencies,
  exchangeRates,
  baseCurrency,
  onSuccess,
  budgetsLoading,
  currenciesLoading,
  initialBudgetId,
  initialAccountId,
  onAccountChange,
}: ExpenseFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEditMode = !!existingTx?.id

  // Sheet Refs
  const budgetSheetRef = useRef<BottomSheet>(null)
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  const hasManuallySelectedAccount = useRef<boolean>(Boolean(initialAccountId))
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const resolvedFormValues: TransactionFormValues = useMemo(() => {
    if (existingTx) {
      const parsedCents = parseInt(existingTx.amount || "0", 10)
      const amountVal =
        !isNaN(parsedCents) && parsedCents > 0
          ? (parsedCents / 100).toFixed(2)
          : ""
      const txD = existingTx.transactionDate
        ? new Date(existingTx.transactionDate)
        : new Date()
      let effD = txD
      let hasCustom = false
      if (existingTx.effectiveDate) {
        const parsedEff = new Date(existingTx.effectiveDate)
        hasCustom = txD.toDateString() !== parsedEff.toDateString()
        effD = parsedEff
      }

      return {
        budgetId: existingTx.budgetId || "",
        accountId: existingTx.accountId || "",
        description: existingTx.description || "",
        amount: amountVal,
        currency: existingTx.currency || baseCurrency || "USD",
        transactionDate: txD,
        hasCustomEffectiveDate: hasCustom,
        effectiveDate: effD,
      }
    }

    const targetBudgetId =
      initialBudgetId || (budgets.length > 0 ? budgets[0].id || "" : "")
    const targetBudget = budgets.find((b) => b.id === targetBudgetId)
    const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
    const resolvedAccId =
      initialAccountId || targetBudget?.defaultAccountId || defaultAcc?.id || ""
    const resolvedCurrency = targetBudget?.currency || baseCurrency || "USD"

    return {
      budgetId: targetBudgetId,
      accountId: resolvedAccId,
      description: "",
      amount: "",
      currency: resolvedCurrency,
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    }
  }, [
    existingTx,
    initialBudgetId,
    initialAccountId,
    budgets,
    accounts,
    baseCurrency,
  ])

  // React Hook Form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: resolvedFormValues,
    values: resolvedFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watched Values
  const amount = useWatch({ control, name: "amount" })
  const selectedBudgetId = useWatch({ control, name: "budgetId" })
  const selectedAccountId = useWatch({ control, name: "accountId" })
  const selectedCurrency = useWatch({ control, name: "currency" })

  // Mutations
  const createExpenseMutation = useCreateExpenseMutation()
  const updateExpenseMutation = useUpdateExpenseMutation()

  // Selected Budget helpers
  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId),
    [budgets, selectedBudgetId]
  )
  const selectedBudgetColors = getNativeBudgetColors(
    selectedBudget?.color || "indigo"
  )

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency =
    selectedCurrency || selectedBudget?.currency || baseCurrency || "USD"
  const currentSymbol = getCurrencySymbol(currentCurrency)

  // Budget change handler
  const handleBudgetChange = useCallback(
    (b: Budget) => {
      setValue("budgetId", b.id || "", { shouldValidate: true })
      if (b.currency) {
        setValue("currency", b.currency, { shouldValidate: true })
      }
      hasManuallySelectedAccount.current = false
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      const targetAccId = b.defaultAccountId || defaultAcc?.id || ""
      if (targetAccId) {
        setValue("accountId", targetAccId)
      }
    },
    [accounts, setValue]
  )

  const parsedAmount = parseFloat(amount || "0")
  const amountDecimal = isNaN(parsedAmount) ? "0.00" : parsedAmount.toFixed(2)

  // Conversion Preview
  const conversionPreview = useMemo(() => {
    if (parsedAmount <= 0 || !currentCurrency || !baseCurrency) return null
    if (currentCurrency.toUpperCase() === baseCurrency.toUpperCase())
      return null
    return convertCurrency(
      parsedAmount,
      currentCurrency,
      baseCurrency,
      exchangeRates
    )
  }, [parsedAmount, currentCurrency, baseCurrency, exchangeRates])

  // Submit Handler
  const onSubmit = async (values: TransactionFormValues) => {
    haptics.light()
    setSubmissionError(null)

    try {
      const txDateIso = toLocalISODate(values.transactionDate)
      const effectiveDateObj = values.hasCustomEffectiveDate
        ? values.effectiveDate
        : values.transactionDate
      const effDateIso = toLocalISODate(effectiveDateObj)
      const centsStr = toCentsString(values.amount)

      if (isEditMode && existingTx?.id) {
        await updateExpenseMutation.mutateAsync({
          id: existingTx.id,
          req: {
            id: existingTx.id,
            expense: {
              budgetId: values.budgetId,
              amount: centsStr,
              currency: values.currency,
              description: values.description.trim(),
              transactionDate: txDateIso,
              effectiveDate: effDateIso,
              accountId: values.accountId || undefined,
            },
          },
        })
      } else {
        await createExpenseMutation.mutateAsync({
          expense: {
            budgetId: values.budgetId,
            amount: centsStr,
            currency: values.currency,
            description: values.description.trim(),
            transactionDate: txDateIso,
            effectiveDate: effDateIso,
            accountId: values.accountId || undefined,
          },
        })
      }

      toast.show({
        type: "success",
        title: isEditMode ? "Expense Updated" : "Expense Recorded",
        message: `${currentSymbol}${amountDecimal} ${values.currency} under ${selectedBudget?.name || "Budget"}`,
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

  return (
    <>
      <ScrollView
        contentContainerStyle={formStyles.formScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Amount & Currency Field */}
        <HeroAmountInput
          control={control}
          name="amount"
          currency={currentCurrency}
          currencySymbol={currentSymbol}
          onPressCurrency={() => {
            Keyboard.dismiss()
            currencySheetRef.current?.expand()
          }}
          autoFocus={!isEditMode}
          accentColor={theme.colors.destructive}
        />

        {/* Currency Conversion Preview */}
        {conversionPreview && (
          <View style={{ marginBottom: 12 }}>
            {"error" in conversionPreview ? (
              <View style={formStyles.conversionAlert}>
                <AlertTriangle
                  size={16}
                  color="#f59e0b"
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={formStyles.conversionAlertTitle}>
                    Exchange Rate Required
                  </Text>
                  <Text style={formStyles.conversionAlertText}>
                    {conversionPreview.error}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={formStyles.conversionBox}>
                <Globe
                  size={16}
                  color={theme.colors.primary}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={formStyles.conversionBoxLabel}>
                    REPORTING CURRENCY CONVERSION
                  </Text>
                  <Text style={formStyles.conversionBoxAmount}>
                    ≈{" "}
                    {conversionPreview.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {conversionPreview.currency}
                  </Text>
                  <Text style={formStyles.conversionBoxRate}>
                    Exchange rate: 1 {currentCurrency} ={" "}
                    {conversionPreview.rate.toFixed(4)}{" "}
                    {conversionPreview.currency}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Field: Budget */}
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
                  {selectedBudget.currency && (
                    <View
                      style={[
                        formStyles.selectedBudgetCurrencyBadge,
                        {
                          backgroundColor: selectedBudgetColors.border,
                          borderColor: selectedBudgetColors.bar,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          formStyles.selectedBudgetCurrencyTag,
                          { color: selectedBudgetColors.text },
                        ]}
                      >
                        {selectedBudget.currency}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={formStyles.placeholderText}>Select a budget</Text>
              )}
              <ChevronRight size={14} color={theme.colors.textMuted} />
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
              <AlertCircle size={12} color={theme.colors.destructive} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.destructive,
                  fontWeight: "500",
                }}
              >
                {errors.budgetId.message}
              </Text>
            </View>
          ) : null}

          {/* Field: Account */}
          <View style={formStyles.rowDivider} />
          <AccountRow
            label="Account"
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
            label="Description"
            icon={<FileText size={16} color={theme.colors.textMuted} />}
            placeholder="e.g. Amazon Web Services, Restaurant Dinner"
            returnKeyType="done"
          />

          {/* Field: Date Section */}
          <View style={formStyles.rowDivider} />
          <FormEffectiveDateSection control={control} />
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
          style={[formStyles.submitBtn, formStyles.submitBtnExpense]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {isEditMode
            ? `Update Expense • ${currentSymbol}${amountDecimal}`
            : `Record Expense • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={selectedBudgetId}
        onSelect={handleBudgetChange}
        isLoading={budgetsLoading}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={selectedAccountId || ""}
        onSelect={(accId) => {
          hasManuallySelectedAccount.current = true
          setValue("accountId", accId, { shouldValidate: true })
          onAccountChange?.(accId)
        }}
      />

      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currentCurrency}
        onSelect={(cur) => setValue("currency", cur, { shouldValidate: true })}
        isLoading={currenciesLoading}
      />
    </>
  )
}
