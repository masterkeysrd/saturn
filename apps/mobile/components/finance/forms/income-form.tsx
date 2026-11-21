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
import { toCentsString, convertCurrency, getCurrencySymbol } from "@saturn/core"
import {
  useCreateIncomeMutation,
  useUpdateIncomeMutation,
  type Account,
  type CurrencyInfo,
  type ExchangeRate,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { useTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import { AccountPickerSheet, CurrencyPickerSheet } from "../sheets"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import { AccountRow } from "../account-select"
import { HeroAmountInput } from "@/components/ui/amount-input"
import {
  FormRowInput,
  FormEffectiveDateSection,
} from "@/components/ui/form-primitives"
import { useFormStyles } from "./form-styles"

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
  const { colors } = useTheme()
  const formStyles = useFormStyles()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
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
        title: isEditMode
          ? t("finance.transactions.incomeForm.toastUpdatedTitle")
          : t("finance.transactions.incomeForm.recordedTitle"),
        message: t("finance.transactions.incomeForm.toastDesc", {
          amount: `${currentSymbol}${amountDecimal}`,
          currency: values.currency,
          account:
            selectedAccount?.name ||
            t("finance.transactions.incomeForm.accountFallback"),
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
        {/* Amount & Currency Field */}
        <HeroAmountInput
          control={control}
          name="amount"
          label={t("finance.transactions.incomeForm.amountLabel").toUpperCase()}
          currency={currentCurrency}
          currencySymbol={currentSymbol}
          onPressCurrency={() => {
            Keyboard.dismiss()
            currencySheetRef.current?.expand()
          }}
          autoFocus={!isEditMode}
          accentColor={colors.success}
        />

        {/* Currency Conversion Preview */}
        {conversionPreview && (
          <View style={{ marginBottom: 12 }}>
            {"error" in conversionPreview ? (
              <View style={formStyles.conversionAlert}>
                <AlertTriangle
                  size={16}
                  color={colors.warning}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={formStyles.conversionAlertTitle}>
                    {t("finance.conversion.rateRequired")}
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
                  color={colors.primary}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={formStyles.conversionBoxLabel}>
                    {t("finance.conversion.reportingLabel").toUpperCase()}
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
                    {t("finance.conversion.exchangeRateLine", {
                      from: currentCurrency,
                      rate: conversionPreview.rate.toFixed(4),
                      to: conversionPreview.currency,
                    })}
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
            label={t("finance.transactions.incomeForm.accountRowLabel")}
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
            label={t("finance.transactions.incomeForm.descriptionLabel")}
            icon={<FileText size={16} color={colors.textMuted} />}
            placeholder={t(
              "finance.transactions.incomeForm.descriptionPlaceholder"
            )}
            returnKeyType="done"
          />

          {/* Field: Date Section */}
          <View style={formStyles.rowDivider} />
          <FormEffectiveDateSection
            control={control}
            dateLabel={t(
              "finance.transactions.incomeForm.transactionDateLabel"
            )}
            effectiveDateLabel={t(
              "finance.transactions.incomeForm.effectiveDateLabel"
            )}
            switchLabel={t(
              "finance.transactions.incomeForm.customEffectiveCheckbox"
            )}
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
          style={[formStyles.submitBtn, formStyles.submitBtnIncome]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {isEditMode
            ? t("finance.transactions.incomeForm.submitUpdateShort", {
                amount: `${currentSymbol}${amountDecimal}`,
              })
            : t("finance.transactions.incomeForm.submitRecord", {
                amount: `${currentSymbol}${amountDecimal}`,
              })}
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
