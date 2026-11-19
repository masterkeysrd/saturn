import { useMemo, useRef } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  X,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  AdjustBorrowingSchema,
  type AdjustBorrowingFormValues,
} from "@saturn/schemas"
import {
  useGetBorrowingQuery,
  useAdjustBorrowingBalanceMutation,
  useListAccountsQuery,
  useListInstitutionsQuery,
  type Account,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount, formatCents, toCentsString } from "@saturn/core"
import { invalidateFinanceQueries } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { FormDateRow } from "@/components/ui/form-primitives"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import { AccountRow } from "@/components/finance/account-select"
import { AccountPickerSheet } from "@/components/finance/sheets"

export default function AdjustBorrowingModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { borrowingId } = useLocalSearchParams<{ borrowingId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()
  const accountSheetRef = useRef<BottomSheet>(null)
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const { data: borrowing, isLoading } = useGetBorrowingQuery(
    { id: borrowingId || "" },
    { enabled: !!borrowingId && !!activeSpaceId }
  )

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []

  const currentBalance = borrowing?.remainingAmount
  const borrowingDefaultValues: AdjustBorrowingFormValues = useMemo(
    () => ({
      targetBalance:
        currentBalance !== undefined
          ? formatCents(currentBalance).toString()
          : "",
      adjustmentDate: new Date(),
      accountId: "",
      notes: "Manual balance adjustment",
    }),
    [currentBalance]
  )

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<AdjustBorrowingFormValues>({
    resolver: zodResolver(AdjustBorrowingSchema),
    defaultValues: borrowingDefaultValues,
    values: borrowingDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const currentBalanceCents = Number(borrowing?.remainingAmount || 0)
  const [targetBalanceStr = "", selectedAccountId = ""] = useWatch({
    control,
    name: ["targetBalance", "accountId"] as const,
  })

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  )

  const targetBalanceCents = useMemo(() => {
    if (!targetBalanceStr.trim()) return currentBalanceCents
    const parsed = Number(toCentsString(targetBalanceStr))
    return isNaN(parsed) ? currentBalanceCents : parsed
  }, [targetBalanceStr, currentBalanceCents])

  const differenceCents = targetBalanceCents - currentBalanceCents
  const isLent = borrowing?.direction === "LENT"
  const currency = borrowing?.currency || "USD"

  const adjustMutation = useAdjustBorrowingBalanceMutation()
  const isPending = adjustMutation.isPending || isSubmitting

  const onValid = async (values: AdjustBorrowingFormValues) => {
    if (!borrowingId || !borrowing) return
    haptics.light()

    const targetCents = Number(toCentsString(values.targetBalance))
    if (isNaN(targetCents) || targetCents < 0) {
      return
    }

    const diffCents = targetCents - currentBalanceCents
    if (diffCents === 0) {
      toast.show({
        title: "No Adjustment Needed",
        message:
          "Current remaining balance already matches your entered amount.",
        type: "info",
      })
      router.back()
      return
    }

    try {
      await adjustMutation.mutateAsync({
        borrowing_id: borrowingId,
        req: {
          borrowingId,
          targetBalance: String(targetCents),
          adjustmentDate: toLocalISODate(values.adjustmentDate),
          notes: values.notes?.trim() || undefined,
          accountId: values.accountId || undefined,
        },
      })

      haptics.success()
      toast.show({
        title: "Balance Adjusted",
        message: `Remaining balance adjusted to ${formatAmount(String(targetCents), currency)}.`,
        type: "success",
      })

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Adjustment Failed",
        message: err?.message || "Could not adjust debt balance.",
        type: "error",
      })
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!borrowing) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={32} color={colors.destructive} />
        <Text style={styles.errorTitle}>Debt Agreement Not Found</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Adjust Debt Balance",
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: "Close",
                    icon: { type: "sfSymbol", name: "xmark" },
                    onPress: () => router.back(),
                  },
                ],
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.headerBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ),
              }),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Agreement Overview Header */}
          <Card style={styles.agreementCard}>
            <View style={styles.agreementCardLeft}>
              <View
                style={[
                  styles.scaleIconWrap,
                  {
                    backgroundColor: isLent
                      ? colors.successSubtle
                      : colors.warningSubtle,
                  },
                ]}
              >
                {isLent ? (
                  <TrendingUp size={20} color={colors.success} />
                ) : (
                  <TrendingDown size={20} color={colors.warning} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.counterpartyText} numberOfLines={1}>
                  {borrowing.counterparty || "Agreement"}
                </Text>
                <Text style={styles.directionText}>
                  {isLent ? "Owed to you (Lent)" : "You owe (Borrowed)"} •{" "}
                  {currency}
                </Text>
              </View>
            </View>

            <View style={styles.currentBalWrap}>
              <Text style={styles.currentBalLabel}>Remaining</Text>
              <Text
                style={[
                  styles.currentBalValue,
                  {
                    color: isLent ? colors.success : colors.warning,
                  },
                ]}
              >
                {formatAmount(borrowing.remainingAmount, currency)}
              </Text>
            </View>
          </Card>

          {/* Actual Target Balance Input Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>TARGET BALANCE</Text>
            <Text style={styles.fieldDesc}>
              Enter the new remaining balance of this agreement to record a
              balance adjustment:
            </Text>

            <TextInput
              control={control}
              name="targetBalance"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              containerStyle={{ marginTop: 8 }}
            />
          </Card>

          {/* Discrepancy / Adjustment Summary */}
          <Card
            style={[
              styles.summaryCard,
              differenceCents === 0
                ? styles.summaryCardEqual
                : differenceCents > 0
                  ? styles.summaryCardPositive
                  : styles.summaryCardNegative,
            ]}
          >
            <View style={styles.summaryTop}>
              {differenceCents === 0 ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : differenceCents > 0 ? (
                <TrendingUp size={20} color={colors.success} />
              ) : (
                <TrendingDown size={20} color={colors.destructive} />
              )}
              <Text style={styles.summaryTitle}>
                {differenceCents === 0
                  ? "Balances Match"
                  : differenceCents > 0
                    ? isLent
                      ? "Balance Increase (Owed More)"
                      : "Debt Increase (You Owe More)"
                    : isLent
                      ? "Balance Reduction (Owed Less)"
                      : "Debt Reduction (You Owe Less)"}
              </Text>
            </View>

            <Text style={styles.summaryAmount}>
              {differenceCents === 0
                ? formatAmount("0", currency)
                : differenceCents > 0
                  ? `+${formatAmount(String(differenceCents), currency)}`
                  : `-${formatAmount(String(Math.abs(differenceCents)), currency)}`}
            </Text>

            <Text style={styles.summaryDesc}>
              {differenceCents === 0
                ? "The remaining balance matches your entered amount. No adjustments are necessary."
                : `A balancing entry will automatically update the agreement remaining balance to ${formatAmount(String(targetBalanceCents), currency)}.`}
            </Text>
          </Card>

          {/* Adjustment Date & Bank Account Option */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>ADJUSTMENT DETAILS</Text>
            <FormDateRow
              control={control}
              name="adjustmentDate"
              label="Adjustment Date"
              icon={<Calendar size={16} color={colors.textMuted} />}
              title="Select Adjustment Date"
            />
            <View style={styles.rowDivider} />
            <AccountRow
              label="Bank Account"
              account={selectedAccount}
              placeholder="None (Do not post to bank)"
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
            />
          </Card>

          {/* Note / Memo */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>ADJUSTMENT MEMO</Text>
            <TextInput
              control={control}
              name="notes"
              placeholder="Reason for balance adjustment..."
              placeholderTextColor={colors.textMuted}
            />
          </Card>

          {/* Action Button */}
          <View style={styles.actionFooter}>
            <Button
              onPress={handleSubmit(onValid)}
              loading={isPending}
              variant="primary"
              size="lg"
            >
              {differenceCents === 0
                ? "Close (No Changes)"
                : "Confirm & Adjust Balance"}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        institutions={institutions}
        selectedAccountId={selectedAccountId}
        allowNoAccount={true}
        onSelect={(id) => {
          setValue("accountId", id, { shouldValidate: true })
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  headerBtn: {
    padding: 8,
    marginLeft: 4,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  agreementCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceElevated,
  },
  agreementCardLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  scaleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  counterpartyText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  directionText: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  currentBalWrap: {
    alignItems: "flex-end" as const,
    marginLeft: 8,
  },
  currentBalLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
  },
  currentBalValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceElevated,
    gap: 8,
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
  },
  fieldDesc: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginVertical: 4,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  summaryCardEqual: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  summaryCardPositive: {
    backgroundColor: t.colors.successSubtle,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  summaryCardNegative: {
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  summaryTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: "800" as const,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: t.colors.textPrimary,
  },
  summaryDesc: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
  },
  actionFooter: {
    marginTop: 8,
  },
})
