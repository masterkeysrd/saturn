import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Switch,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  Tag,
  FileText,
  Landmark,
  Calendar,
  CalendarClock,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Globe,
} from "lucide-react-native"
import { transactionSchema } from "@saturn/schemas"
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
  BudgetPickerSheet,
  AccountPickerSheet,
  CurrencyPickerSheet,
} from "../sheets"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
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
}: ExpenseFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEditMode = !!existingTx?.id

  // Sheet Refs
  const budgetSheetRef = useRef<BottomSheet>(null)
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // Form State
  const [amountText, setAmountText] = useState("")
  const [description, setDescription] = useState("")
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    initialBudgetId || ""
  )
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || ""
  )
  const hasManuallySelectedAccount = useRef<boolean>(Boolean(initialAccountId))
  const [selectedCurrency, setSelectedCurrency] = useState<string>("")
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())
  const [hasCustomEffectiveDate, setHasCustomEffectiveDate] =
    useState<boolean>(false)
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date())
  const [activeDatePickerTarget, setActiveDatePickerTarget] = useState<
    "transaction" | "effective"
  >("transaction")

  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mutations
  const createExpenseMutation = useCreateExpenseMutation()
  const updateExpenseMutation = useUpdateExpenseMutation()

  // Auto-set default budget & account on initial load or when budgets/accounts are loaded
  useEffect(() => {
    if (isEditMode) return

    // Resolve target budget (either current selection, initialBudgetId, or first budget in list)
    const targetBudgetId =
      selectedBudgetId ||
      initialBudgetId ||
      (budgets.length > 0 ? budgets[0].id : "")
    const targetBudget = budgets.find((b) => b.id === targetBudgetId)

    if (targetBudget) {
      if (!selectedBudgetId && targetBudget.id) {
        setSelectedBudgetId(targetBudget.id)
      }
      if (!selectedCurrency && targetBudget.currency) {
        setSelectedCurrency(targetBudget.currency)
      }

      // If user hasn't manually selected an account, auto-select the budget's default account
      if (!hasManuallySelectedAccount.current) {
        const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
        const resolvedAccId =
          targetBudget.defaultAccountId || defaultAcc?.id || ""
        if (resolvedAccId && resolvedAccId !== selectedAccountId) {
          setSelectedAccountId(resolvedAccId)
        }
      }
    } else if (
      accounts.length > 0 &&
      !hasManuallySelectedAccount.current &&
      !selectedAccountId
    ) {
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      if (defaultAcc?.id) {
        setSelectedAccountId(defaultAcc.id)
      }
    }
  }, [
    budgets,
    accounts,
    selectedBudgetId,
    initialBudgetId,
    isEditMode,
    selectedCurrency,
    selectedAccountId,
  ])

  // Hydrate edit mode
  useEffect(() => {
    if (existingTx) {
      const parsedCents = parseInt(existingTx.amount || "0", 10)
      if (!isNaN(parsedCents) && parsedCents > 0) {
        setAmountText((parsedCents / 100).toFixed(2))
      }
      setDescription(existingTx.description || "")
      setSelectedBudgetId(existingTx.budgetId || "")
      setSelectedAccountId(existingTx.accountId || "")
      if (existingTx.currency) {
        setSelectedCurrency(existingTx.currency)
      }
      if (existingTx.transactionDate) {
        const txD = new Date(existingTx.transactionDate)
        setTransactionDate(txD)
        if (existingTx.effectiveDate) {
          const effD = new Date(existingTx.effectiveDate)
          const isDiff = txD.toDateString() !== effD.toDateString()
          setHasCustomEffectiveDate(isDiff)
          setEffectiveDate(effD)
        } else {
          setHasCustomEffectiveDate(false)
          setEffectiveDate(txD)
        }
      }
    }
  }, [existingTx])

  // Selected Budget helpers
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
    selectedCurrency || selectedBudget?.currency || baseCurrency || "USD"
  const currentSymbol = getCurrencySymbol(currentCurrency)

  // Budget change handler
  const handleBudgetChange = useCallback(
    (b: Budget) => {
      setSelectedBudgetId(b.id || "")
      if (b.currency) {
        setSelectedCurrency(b.currency)
      }
      hasManuallySelectedAccount.current = false
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      const targetAccId = b.defaultAccountId || defaultAcc?.id || ""
      if (targetAccId) {
        setSelectedAccountId(targetAccId)
      }
    },
    [accounts]
  )

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

  // Open Date Picker
  const openDatePicker = (target: "transaction" | "effective") => {
    Keyboard.dismiss()
    setActiveDatePickerTarget(target)
    dateSheetRef.current?.expand()
  }

  // Handle Submit
  const handleSave = async () => {
    if (isSubmitting) return
    haptics.light()

    if (parsedAmount <= 0) {
      haptics.error()
      setValidationError("Please enter an amount greater than 0.")
      return
    }

    if (!selectedBudgetId) {
      haptics.error()
      setValidationError("Please select a budget for this expense.")
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      const txDateIso = toLocalISODate(transactionDate)
      const effectiveDateObj = hasCustomEffectiveDate
        ? effectiveDate
        : transactionDate
      const effDateIso = toLocalISODate(effectiveDateObj)
      const centsStr = toCentsString(amountDecimal)

      const parsed = transactionSchema.safeParse({
        budgetId: selectedBudgetId,
        accountId: selectedAccountId || undefined,
        description: description.trim(),
        amount: amountDecimal,
        currency: currentCurrency,
        transactionDate: transactionDate,
        hasCustomEffectiveDate: hasCustomEffectiveDate,
        effectiveDate: effectiveDateObj,
      })

      if (!parsed.success) {
        haptics.error()
        const errMsg = parsed.error.errors[0]?.message || "Invalid expense"
        setValidationError(errMsg)
        setIsSubmitting(false)
        return
      }

      if (isEditMode && existingTx?.id) {
        await updateExpenseMutation.mutateAsync({
          id: existingTx.id,
          req: {
            id: existingTx.id,
            expense: {
              budgetId: selectedBudgetId,
              amount: centsStr,
              currency: currentCurrency,
              description: description.trim(),
              transactionDate: txDateIso,
              effectiveDate: effDateIso,
              accountId: selectedAccountId || undefined,
            },
          },
        })
      } else {
        await createExpenseMutation.mutateAsync({
          expense: {
            budgetId: selectedBudgetId,
            amount: centsStr,
            currency: currentCurrency,
            description: description.trim(),
            transactionDate: txDateIso,
            effectiveDate: effDateIso,
            accountId: selectedAccountId || undefined,
          },
        })
      }

      toast.show({
        type: "success",
        title: isEditMode ? "Expense Updated" : "Expense Recorded",
        message: `${currentSymbol}${amountDecimal} ${currentCurrency} under ${selectedBudget?.name || "Budget"}`,
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
        {/* Amount & Currency Field */}
        <View style={formStyles.amountCard}>
          <Text style={formStyles.fieldSectionLabel}>AMOUNT</Text>
          <View style={formStyles.amountInputRow}>
            <Text
              style={[
                formStyles.amountCurrencyPrefix,
                { color: theme.colors.destructive },
              ]}
            >
              {currentSymbol}
            </Text>
            <TextInput
              style={[
                formStyles.amountInput,
                { color: theme.colors.destructive },
              ]}
              keyboardType="decimal-pad"
              value={amountText}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={handleAmountChange}
              autoFocus={!isEditMode}
              selectionColor={theme.colors.destructive}
            />

            <TouchableOpacity
              style={formStyles.currencySelectButton}
              activeOpacity={0.7}
              onPress={() => {
                Keyboard.dismiss()
                currencySheetRef.current?.expand()
              }}
            >
              <Text style={formStyles.currencySelectCode} numberOfLines={1}>
                {currentCurrency.toUpperCase()}
              </Text>
              <ChevronDown size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

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

          {/* Field: Account */}
          <View style={formStyles.rowDivider} />
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

          {/* Field: Description */}
          <View style={formStyles.rowDivider} />
          <View style={formStyles.formRow}>
            <View style={formStyles.formRowLabelGroup}>
              <FileText size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel}>Description</Text>
            </View>
            <TextInput
              style={formStyles.formRowInput}
              placeholder="e.g. Amazon Web Services, Restaurant Dinner"
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={(val) => {
                setDescription(val)
                setValidationError(null)
              }}
              returnKeyType="done"
            />
          </View>

          {/* Field: Transaction Date */}
          <View style={formStyles.rowDivider} />
          <TouchableOpacity
            style={formStyles.formRow}
            activeOpacity={0.7}
            onPress={() => openDatePicker("transaction")}
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

          {/* Toggle: Different Effective Date */}
          <View style={formStyles.rowDivider} />
          <View style={formStyles.formRow}>
            <View
              style={[
                formStyles.formRowLabelGroup,
                { flex: 1, paddingRight: 8 },
              ]}
            >
              <CalendarClock size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel} numberOfLines={2}>
                Different effective date?
              </Text>
            </View>
            <Switch
              value={hasCustomEffectiveDate}
              onValueChange={(val) => {
                haptics.light()
                setHasCustomEffectiveDate(val)
                if (!val) {
                  setEffectiveDate(transactionDate)
                }
              }}
              trackColor={{
                false: theme.colors.surfaceElevated,
                true: theme.colors.primary,
              }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Field: Custom Effective Date */}
          {hasCustomEffectiveDate && (
            <>
              <View style={formStyles.rowDivider} />
              <TouchableOpacity
                style={formStyles.formRow}
                activeOpacity={0.7}
                onPress={() => openDatePicker("effective")}
              >
                <View style={formStyles.formRowLabelGroup}>
                  <Calendar size={16} color={theme.colors.primary} />
                  <Text
                    style={[
                      formStyles.formRowLabel,
                      { color: theme.colors.primary },
                    ]}
                  >
                    Effective Date
                  </Text>
                </View>
                <View style={formStyles.formRowValueGroup}>
                  <Text
                    style={[
                      formStyles.formRowValueText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {formatDisplayDate(effectiveDate)}
                  </Text>
                  <ChevronRight size={14} color={theme.colors.primary} />
                </View>
              </TouchableOpacity>
            </>
          )}
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
          style={[formStyles.submitBtn, formStyles.submitBtnExpense]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSave}
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
        selectedAccountId={selectedAccountId}
        onSelect={(accId) => {
          hasManuallySelectedAccount.current = true
          setSelectedAccountId(accId)
        }}
      />

      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currentCurrency}
        onSelect={setSelectedCurrency}
        isLoading={currenciesLoading}
      />

      <DatePickerSheet
        ref={dateSheetRef}
        title={
          activeDatePickerTarget === "effective"
            ? "Select Effective Date"
            : "Select Transaction Date"
        }
        value={
          activeDatePickerTarget === "effective"
            ? effectiveDate
            : transactionDate
        }
        onChange={(newDate) => {
          if (activeDatePickerTarget === "transaction") {
            setTransactionDate(newDate)
            if (!hasCustomEffectiveDate) {
              setEffectiveDate(newDate)
            }
          } else {
            setEffectiveDate(newDate)
          }
        }}
      />
    </>
  )
}
