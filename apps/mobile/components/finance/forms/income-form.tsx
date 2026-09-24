import React, { useState, useEffect, useMemo, useRef } from "react"
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
import { incomeSchema } from "@saturn/schemas"
import { toCentsString, convertCurrency } from "@saturn/core"
import {
  useCreateIncomeMutation,
  useUpdateIncomeMutation,
  type Account,
  type CurrencyInfo,
  type ExchangeRate,
  type Transaction,
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
import { AccountPickerSheet, CurrencyPickerSheet } from "../sheets"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { formStyles } from "./form-styles"

export interface IncomeFormProps {
  existingTx?: Transaction | null
  accounts: Account[]
  currencies: CurrencyInfo[]
  exchangeRates: ExchangeRate[]
  baseCurrency: string
  onSuccess: () => void
  currenciesLoading?: boolean
}

export function IncomeForm({
  existingTx,
  accounts,
  currencies,
  exchangeRates,
  baseCurrency,
  onSuccess,
  currenciesLoading,
}: IncomeFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEditMode = !!existingTx?.id

  // Sheet Refs
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // Form State
  const [amountText, setAmountText] = useState("")
  const [description, setDescription] = useState("")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
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
  const createIncomeMutation = useCreateIncomeMutation()
  const updateIncomeMutation = useUpdateIncomeMutation()

  // Auto-set default account
  useEffect(() => {
    if (accounts.length > 0 && !isEditMode && !selectedAccountId) {
      const defaultAcc = accounts.find((a) => a.isDefault) || accounts[0]
      setSelectedAccountId(defaultAcc.id || "")
    }
  }, [accounts, selectedAccountId, isEditMode])

  // Hydrate edit mode
  useEffect(() => {
    if (existingTx) {
      const parsedCents = parseInt(existingTx.amount || "0", 10)
      if (!isNaN(parsedCents) && parsedCents > 0) {
        setAmountText((parsedCents / 100).toFixed(2))
      }
      setDescription(existingTx.description || "")
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

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency =
    selectedCurrency || selectedAccount?.currency || baseCurrency || "USD"
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

    setValidationError(null)
    setIsSubmitting(true)

    try {
      const txDateIso = toLocalISODate(transactionDate)
      const effectiveDateObj = hasCustomEffectiveDate
        ? effectiveDate
        : transactionDate
      const effDateIso = toLocalISODate(effectiveDateObj)
      const centsStr = toCentsString(amountDecimal)

      const parsed = incomeSchema.safeParse({
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
        const errMsg = parsed.error.errors[0]?.message || "Invalid income"
        setValidationError(errMsg)
        setIsSubmitting(false)
        return
      }

      if (isEditMode && existingTx?.id) {
        await updateIncomeMutation.mutateAsync({
          id: existingTx.id,
          req: {
            id: existingTx.id,
            income: {
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
        await createIncomeMutation.mutateAsync({
          income: {
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
        title: isEditMode ? "Income Updated" : "Income Recorded",
        message: `+${currentSymbol}${amountDecimal} ${currentCurrency} credited to ${selectedAccount?.name || "Account"}`,
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
                { color: theme.colors.success },
              ]}
            >
              {currentSymbol}
            </Text>
            <TextInput
              style={[formStyles.amountInput, { color: theme.colors.success }]}
              keyboardType="decimal-pad"
              value={amountText}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={handleAmountChange}
              autoFocus={!isEditMode}
              selectionColor={theme.colors.success}
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
          {/* Field: Account */}
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
              placeholder="e.g. Salary, Client Invoice, Dividends"
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
          style={[formStyles.submitBtn, formStyles.submitBtnIncome]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSave}
        >
          {isEditMode
            ? `Update Income • +${currentSymbol}${amountDecimal}`
            : `Record Income • +${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={setSelectedAccountId}
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
