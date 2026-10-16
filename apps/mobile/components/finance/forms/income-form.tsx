import { useMemo, useRef, useState } from "react"
import { Text, View, ScrollView, Keyboard } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  FileText,
  AlertCircle,
  AlertTriangle,
  Globe,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { IncomeSchema, type IncomeFormValues } from "@saturn/schemas"
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
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import { AccountPickerSheet, CurrencyPickerSheet } from "../sheets"
import { AccountRow } from "../account-select"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { HeroAmountInput } from "@/components/ui/amount-input"
import {
  FormRowInput,
  FormEffectiveDateSection,
} from "@/components/ui/form-primitives"
import { formStyles } from "./form-styles"

export interface IncomeFormProps {
  existingTx?: Transaction | null
  accounts: Account[]
  currencies: CurrencyInfo[]
  exchangeRates: ExchangeRate[]
  baseCurrency: string
  onSuccess: () => void
  currenciesLoading?: boolean
  initialAccountId?: string
  onAccountChange?: (accountId: string) => void
}

export function IncomeForm({
  existingTx,
  accounts,
  currencies,
  exchangeRates,
  baseCurrency,
  onSuccess,
  currenciesLoading,
  initialAccountId,
  onAccountChange,
}: IncomeFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isEditMode = !!existingTx?.id

  // Sheet Refs
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const resolvedFormValues: IncomeFormValues = useMemo(() => {
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
        accountId: existingTx.accountId || "",
        description: existingTx.description || "",
        amount: amountVal,
        currency: existingTx.currency || baseCurrency || "USD",
        transactionDate: txD,
        hasCustomEffectiveDate: hasCustom,
        effectiveDate: effD,
      }
    }

    const targetAcc =
      (initialAccountId
        ? accounts.find((a) => a.id === initialAccountId)
        : null) ||
      accounts.find((a) => a.isDefault) ||
      accounts[0]
    const resolvedAccId = initialAccountId || targetAcc?.id || ""

    return {
      accountId: resolvedAccId,
      description: "",
      amount: "",
      currency: baseCurrency || "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    }
  }, [existingTx, initialAccountId, accounts, baseCurrency])

  // React Hook Form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IncomeFormValues>({
    resolver: zodResolver(IncomeSchema),
    defaultValues: resolvedFormValues,
    values: resolvedFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watched Values
  const amount = useWatch({ control, name: "amount" })
  const selectedAccountId = useWatch({ control, name: "accountId" })
  const selectedCurrency = useWatch({ control, name: "currency" })

  // Mutations
  const createIncomeMutation = useCreateIncomeMutation()
  const updateIncomeMutation = useUpdateIncomeMutation()

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const currentCurrency =
    selectedCurrency || selectedAccount?.currency || baseCurrency || "USD"
  const currentSymbol = getCurrencySymbol(currentCurrency)

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
  const onSubmit = async (values: IncomeFormValues) => {
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
        await updateIncomeMutation.mutateAsync({
          id: existingTx.id,
          req: {
            id: existingTx.id,
            income: {
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
        await createIncomeMutation.mutateAsync({
          income: {
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
        title: isEditMode ? "Income Updated" : "Income Recorded",
        message: `+${currentSymbol}${amountDecimal} ${values.currency} credited to ${selectedAccount?.name || "Account"}`,
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
          accentColor={theme.colors.success}
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
          {/* Field: Account */}
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
            placeholder="e.g. Monthly Salary, Freelance Payment"
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
          style={[formStyles.submitBtn, formStyles.submitBtnIncome]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {isEditMode
            ? `Update Income • ${currentSymbol}${amountDecimal}`
            : `Record Income • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={selectedAccountId || ""}
        onSelect={(accId) => {
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
