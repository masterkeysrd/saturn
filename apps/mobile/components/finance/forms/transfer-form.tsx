import { useMemo, useRef, useState } from "react"
import { Text, View, ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  FileText,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { TransferSchema, type TransferFormValues } from "@saturn/schemas"
import { toCentsString } from "@saturn/core"
import {
  useCreateTransferMutation,
  type Account,
  type ExchangeRate,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import { AccountPickerSheet } from "../sheets"
import { AccountRow } from "../account-select"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { HeroAmountInput } from "@/components/ui/amount-input"
import { FormRowInput, FormDateRow } from "@/components/ui/form-primitives"
import { formStyles } from "./form-styles"

export interface TransferFormProps {
  accounts: Account[]
  exchangeRates: ExchangeRate[]
  onSuccess: () => void
  initialFromAccountId?: string
  onAccountChange?: (accountId: string) => void
}

export function TransferForm({
  accounts,
  exchangeRates,
  onSuccess,
  initialFromAccountId,
  onAccountChange,
}: TransferFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const transferFromSheetRef = useRef<BottomSheet>(null)
  const transferToSheetRef = useRef<BottomSheet>(null)

  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const resolvedDefaultValues: TransferFormValues = useMemo(() => {
    const srcId = initialFromAccountId || accounts[0]?.id || ""
    const dstId =
      accounts.find((a) => a.id !== srcId)?.id || accounts[1]?.id || ""
    return {
      sourceAccountId: srcId,
      destinationAccountId: dstId,
      sourceAmount: "",
      destinationAmount: "",
      transferDate: new Date(),
      notes: "",
    }
  }, [accounts, initialFromAccountId])

  // React Hook Form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(TransferSchema),
    defaultValues: resolvedDefaultValues,
    values: resolvedDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watched Values
  const sourceAccountId = useWatch({ control, name: "sourceAccountId" })
  const destinationAccountId = useWatch({
    control,
    name: "destinationAccountId",
  })
  const sourceAmount = useWatch({ control, name: "sourceAmount" })

  // Mutation
  const createTransferMutation = useCreateTransferMutation()

  const sourceAccount = useMemo(
    () => accounts.find((a) => a.id === sourceAccountId),
    [accounts, sourceAccountId]
  )
  const destinationAccount = useMemo(
    () => accounts.find((a) => a.id === destinationAccountId),
    [accounts, destinationAccountId]
  )

  const currentSymbol = getCurrencySymbol(sourceAccount?.currency || "USD")

  const parsedAmount = parseFloat(sourceAmount || "0")
  const amountDecimal = isNaN(parsedAmount) ? "0.00" : parsedAmount.toFixed(2)

  // Transfer exchange rate calculation
  const transferDestinationAmount = useMemo(() => {
    if (!sourceAccount || !destinationAccount || parsedAmount <= 0) {
      return amountDecimal
    }
    if (sourceAccount.currency === destinationAccount.currency) {
      return amountDecimal
    }
    const rateObj = exchangeRates
      .filter(
        (r) =>
          r.fromCurrency === sourceAccount.currency &&
          r.toCurrency === destinationAccount.currency
      )
      .sort(
        (a, b) =>
          new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
      )[0]

    if (rateObj && rateObj.rate) {
      return (parsedAmount * rateObj.rate).toFixed(2)
    }
    return amountDecimal
  }, [
    sourceAccount,
    destinationAccount,
    parsedAmount,
    amountDecimal,
    exchangeRates,
  ])

  const isCrossCurrency = Boolean(
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency
  )

  // Submit Handler
  const onSubmit = async (values: TransferFormValues) => {
    haptics.light()
    setSubmissionError(null)

    try {
      const dateIso = toLocalISODate(values.transferDate)
      const centsStr = toCentsString(values.sourceAmount)
      const destCentsStr = toCentsString(values.destinationAmount)

      await createTransferMutation.mutateAsync({
        sourceAccountId: values.sourceAccountId,
        destinationAccountId: values.destinationAccountId,
        sourceAmount: centsStr,
        destinationAmount: destCentsStr,
        transferDate: dateIso,
        notes: values.notes?.trim() || "",
      })

      toast.show({
        type: "success",
        title: "Transfer Recorded",
        message: `${currentSymbol}${amountDecimal} from ${sourceAccount?.name} to ${destinationAccount?.name}`,
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
          name="sourceAmount"
          currency={sourceAccount?.currency || "USD"}
          currencySymbol={currentSymbol}
          currencyDisabled
          accentColor={theme.colors.primary}
          autoFocus
        />

        {/* Cross Currency Preview Alert */}
        {isCrossCurrency && (
          <View style={[formStyles.conversionAlert, { marginBottom: 12 }]}>
            <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={formStyles.conversionAlertTitle}>
                CROSS-CURRENCY TRANSFER
              </Text>
              <Text style={formStyles.conversionAlertText}>
                {destinationAccount?.name} will receive approx.{" "}
                <Text style={{ fontWeight: "800", color: "#f59e0b" }}>
                  {getCurrencySymbol(destinationAccount?.currency || "")}
                  {transferDestinationAmount} {destinationAccount?.currency}
                </Text>
              </Text>
            </View>
          </View>
        )}

        {/* Transfer Account Linker Group */}
        <Card style={[formStyles.formGroupCard, { marginBottom: 12 }]}>
          {/* Source Account Row */}
          <AccountRow
            label="From Account"
            account={sourceAccount}
            error={errors.sourceAccountId?.message}
            onPress={() => {
              transferFromSheetRef.current?.expand()
            }}
            fallbackIcon={
              <ArrowUpRight size={16} color={theme.colors.destructive} />
            }
          />

          <View style={formStyles.rowDivider} />

          {/* Destination Account Row */}
          <AccountRow
            label="To Account"
            account={destinationAccount}
            error={errors.destinationAccountId?.message}
            onPress={() => {
              transferToSheetRef.current?.expand()
            }}
            fallbackIcon={
              <ArrowDownLeft size={16} color={theme.colors.success} />
            }
          />
        </Card>

        {/* Form Details Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Field: Transfer Date */}
          <FormDateRow
            control={control}
            name="transferDate"
            label="Transfer Date"
          />

          {/* Field: Notes / Description */}
          <View style={formStyles.rowDivider} />
          <FormRowInput
            control={control}
            name="notes"
            label="Notes"
            icon={<FileText size={16} color={theme.colors.textMuted} />}
            placeholder="Reason or memo (optional)"
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
          style={[formStyles.submitBtn, formStyles.submitBtnTransfer]}
          size="lg"
          loading={isSubmitting}
          onPress={() => {
            setValue("destinationAmount", transferDestinationAmount)
            handleSubmit(onSubmit)()
          }}
        >
          {`Transfer • ${currentSymbol}${amountDecimal}`}
        </Button>
      </View>

      {/* Pickers */}
      <AccountPickerSheet
        ref={transferFromSheetRef}
        accounts={accounts}
        selectedAccountId={sourceAccountId || ""}
        onSelect={(accId) => {
          setValue("sourceAccountId", accId, { shouldValidate: true })
          onAccountChange?.(accId)
        }}
      />

      <AccountPickerSheet
        ref={transferToSheetRef}
        accounts={accounts.filter((a) => a.id !== sourceAccountId)}
        selectedAccountId={destinationAccountId || ""}
        onSelect={(accId) => {
          setValue("destinationAccountId", accId, { shouldValidate: true })
        }}
      />
    </>
  )
}
