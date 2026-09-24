import { useState, useEffect, useMemo, useRef } from "react"
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
  Calendar,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react-native"
import { transferSchema } from "@saturn/schemas"
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
import {
  DatePickerSheet,
  toLocalISODate,
  formatDisplayDate,
} from "@/components/ui/date-picker-sheet"
import { AccountPickerSheet } from "../sheets"
import { AccountRow } from "../account-select"
import { getCurrencySymbol, invalidateFinanceQueries } from "../finance-utils"
import { formStyles } from "./form-styles"

export interface TransferFormProps {
  accounts: Account[]
  exchangeRates: ExchangeRate[]
  onSuccess: () => void
  initialFromAccountId?: string
}

export function TransferForm({
  accounts,
  exchangeRates,
  onSuccess,
  initialFromAccountId,
}: TransferFormProps) {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Sheet Refs
  const transferFromSheetRef = useRef<BottomSheet>(null)
  const transferToSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // Form State
  const [amountText, setAmountText] = useState("")
  const [description, setDescription] = useState("")
  const [transferFromId, setTransferFromId] = useState<string>(
    initialFromAccountId || ""
  )
  const [transferToId, setTransferToId] = useState<string>("")
  const [transferDate, setTransferDate] = useState<Date>(new Date())

  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mutation
  const createTransferMutation = useCreateTransferMutation()

  // Auto-set default accounts
  useEffect(() => {
    if (accounts.length > 0) {
      if (!transferFromId) {
        setTransferFromId(initialFromAccountId || accounts[0].id || "")
      }
      if (!transferToId && accounts.length > 1) {
        const other = accounts.find(
          (a) => a.id !== (transferFromId || initialFromAccountId)
        )
        setTransferToId(other ? other.id || "" : accounts[1].id || "")
      }
    }
  }, [accounts, transferFromId, transferToId, initialFromAccountId])

  const sourceAccount = useMemo(
    () => accounts.find((a) => a.id === transferFromId),
    [accounts, transferFromId]
  )
  const destinationAccount = useMemo(
    () => accounts.find((a) => a.id === transferToId),
    [accounts, transferToId]
  )

  const currentSymbol = getCurrencySymbol(sourceAccount?.currency || "USD")

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

  // Handle Submit
  const handleSave = async () => {
    if (isSubmitting) return
    haptics.light()

    if (parsedAmount <= 0) {
      haptics.error()
      setValidationError("Please enter an amount greater than 0.")
      return
    }

    if (!transferFromId || !transferToId) {
      haptics.error()
      setValidationError("Source and destination accounts are required.")
      return
    }

    if (transferFromId === transferToId) {
      haptics.error()
      setValidationError("Source and destination accounts must be different.")
      return
    }

    setValidationError(null)
    setIsSubmitting(true)

    try {
      const dateIso = toLocalISODate(transferDate)
      const centsStr = toCentsString(amountDecimal)

      const parsed = transferSchema.safeParse({
        sourceAccountId: transferFromId,
        destinationAccountId: transferToId,
        sourceAmount: amountDecimal,
        destinationAmount: transferDestinationAmount,
        transferDate: transferDate,
        notes: description.trim(),
      })

      if (!parsed.success) {
        haptics.error()
        const errMsg = parsed.error.errors[0]?.message || "Invalid transfer"
        setValidationError(errMsg)
        setIsSubmitting(false)
        return
      }

      await createTransferMutation.mutateAsync({
        sourceAccountId: transferFromId,
        destinationAccountId: transferToId,
        sourceAmount: centsStr,
        destinationAmount: toCentsString(transferDestinationAmount),
        transferDate: dateIso,
        notes: description.trim(),
      })

      toast.show({
        type: "success",
        title: "Transfer Completed",
        message: `Transferred ${sourceAccount ? getCurrencySymbol(sourceAccount.currency) : "$"}${amountDecimal} from ${sourceAccount?.name} to ${destinationAccount?.name}`,
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
        {/* Multi-Currency Transfer Banner */}
        {sourceAccount &&
          destinationAccount &&
          sourceAccount.currency !== destinationAccount.currency && (
            <View style={formStyles.conversionAlert}>
              <AlertTriangle
                size={16}
                color="#f59e0b"
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={formStyles.conversionAlertTitle}>
                  Multi-Currency Transfer
                </Text>
                <Text style={formStyles.conversionAlertText}>
                  Funds will be converted from {sourceAccount.currency} to{" "}
                  {destinationAccount.currency} using your rates configuration.
                  Destination receives ≈ {destinationAccount.currency} $
                  {transferDestinationAmount}
                </Text>
              </View>
            </View>
          )}

        {/* Amount Field */}
        <View style={formStyles.amountCard}>
          <Text style={formStyles.fieldSectionLabel}>TRANSFER AMOUNT</Text>
          <View style={formStyles.amountInputRow}>
            <Text
              style={[
                formStyles.amountCurrencyPrefix,
                { color: theme.colors.primary },
              ]}
            >
              {currentSymbol}
            </Text>
            <TextInput
              style={[formStyles.amountInput, { color: theme.colors.primary }]}
              keyboardType="decimal-pad"
              value={amountText}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={handleAmountChange}
              autoFocus
              selectionColor={theme.colors.primary}
            />
          </View>
        </View>

        {/* Form Fields Card */}
        <Card style={formStyles.formGroupCard}>
          {/* Source Account */}
          <AccountRow
            label="From Account"
            account={sourceAccount}
            placeholder="Select source"
            fallbackIcon={
              <ArrowUpRight size={16} color={theme.colors.destructive} />
            }
            onPress={() => {
              Keyboard.dismiss()
              transferFromSheetRef.current?.expand()
            }}
          />

          {/* Destination Account */}
          <View style={formStyles.rowDivider} />
          <AccountRow
            label="To Account"
            account={destinationAccount}
            placeholder="Select target"
            fallbackIcon={
              <ArrowDownLeft size={16} color={theme.colors.success} />
            }
            onPress={() => {
              Keyboard.dismiss()
              transferToSheetRef.current?.expand()
            }}
          />

          {/* Note / Description */}
          <View style={formStyles.rowDivider} />
          <View style={formStyles.formRow}>
            <View style={formStyles.formRowLabelGroup}>
              <FileText size={16} color={theme.colors.textMuted} />
              <Text style={formStyles.formRowLabel}>Note</Text>
            </View>
            <TextInput
              style={formStyles.formRowInput}
              placeholder="Optional transfer notes"
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={(val) => {
                setDescription(val)
                setValidationError(null)
              }}
              returnKeyType="done"
            />
          </View>

          {/* Transfer Date */}
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
              <Text style={formStyles.formRowLabel}>Transfer Date</Text>
            </View>
            <View style={formStyles.formRowValueGroup}>
              <Text style={formStyles.formRowValueText}>
                {formatDisplayDate(transferDate)}
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
          style={[formStyles.submitBtn, formStyles.submitBtnTransfer]}
          size="lg"
          loading={isSubmitting}
          onPress={handleSave}
        >
          {`Perform Transfer • ${sourceAccount ? getCurrencySymbol(sourceAccount.currency) : "$"}${amountDecimal}`}
        </Button>
      </View>

      {/* Sheets */}
      <AccountPickerSheet
        ref={transferFromSheetRef}
        title="Transfer From"
        accounts={accounts}
        selectedAccountId={transferFromId}
        onSelect={setTransferFromId}
        allowNoAccount={false}
      />

      <AccountPickerSheet
        ref={transferToSheetRef}
        title="Transfer To"
        accounts={accounts}
        selectedAccountId={transferToId}
        onSelect={setTransferToId}
        allowNoAccount={false}
      />

      <DatePickerSheet
        ref={dateSheetRef}
        title="Select Transfer Date"
        value={transferDate}
        onChange={setTransferDate}
      />
    </>
  )
}
