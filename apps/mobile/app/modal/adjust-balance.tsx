import { useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  X,
  Scale,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  AdjustBalanceSchema,
  type AdjustBalanceFormValues,
} from "@saturn/schemas"
import {
  useGetAccountQuery,
  useAdjustAccountBalanceMutation,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount, formatCents, toCentsString } from "@saturn/core"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

export default function AdjustBalanceModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { accountId } = useLocalSearchParams<{ accountId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t, locale } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const { data: account, isLoading } = useGetAccountQuery(
    { id: accountId || "" },
    { enabled: !!accountId && !!activeSpaceId }
  )

  const currentBalance = account?.currentBalance
  const defaultFormValues: AdjustBalanceFormValues = useMemo(
    () => ({
      targetBalance:
        currentBalance !== undefined
          ? formatCents(currentBalance).toString()
          : "",
      notes: t("finance.accounts.mobile.defaultNote"),
    }),
    [currentBalance, t]
  )

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(AdjustBalanceSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  const currentBalanceCents = Number(account?.currentBalance || 0)
  const targetBalanceStr = useWatch({ control, name: "targetBalance" }) || ""

  const targetBalanceCents = useMemo(() => {
    if (!targetBalanceStr.trim()) return currentBalanceCents
    const parsed = Number(toCentsString(targetBalanceStr))
    return isNaN(parsed) ? currentBalanceCents : parsed
  }, [targetBalanceStr, currentBalanceCents])

  const differenceCents = targetBalanceCents - currentBalanceCents

  const adjustMutation = useAdjustAccountBalanceMutation()
  const isPending = adjustMutation.isPending || isSubmitting

  const onValid = async (values: AdjustBalanceFormValues) => {
    if (!accountId) return
    haptics.light()

    const targetCents = Number(toCentsString(values.targetBalance))
    if (isNaN(targetCents)) {
      return
    }

    const diffCents = targetCents - currentBalanceCents
    if (diffCents === 0) {
      toast.show({
        title: t("finance.accounts.mobile.toastNoAdjustTitle"),
        message: t("finance.accounts.mobile.toastNoAdjustDesc"),
        type: "info",
      })
      router.back()
      return
    }

    try {
      await adjustMutation.mutateAsync({
        account_id: accountId,
        req: {
          accountId,
          targetBalance: String(targetCents),
          adjustmentDate: new Date().toISOString(),
          note: values.notes?.trim() || undefined,
        },
      })

      haptics.success()
      toast.show({
        title: t("finance.accounts.mobile.toastAdjustedTitle"),
        message: t("finance.accounts.mobile.toastAdjustedDesc", {
          amount: formatAmount(String(targetCents), account?.currency),
        }),
        type: "success",
      })

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("finance.accounts.adjust.failed"),
        message: err?.message || t("finance.accounts.mobile.toastAdjustFailed"),
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

  if (!account) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={32} color={colors.destructive} />
        <Text style={styles.errorTitle}>
          {t("finance.accounts.mobile.notFoundTitle")}
        </Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t("finance.accounts.card.adjust"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: t("common.close"),
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
          {/* Account Overview Header */}
          <Card style={styles.accountCard}>
            <View style={styles.accountCardLeft}>
              <View style={styles.scaleIconWrap}>
                <Scale size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountType}>
                  {account.currency} •{" "}
                  {getLocalizedEnumLabel(
                    "finance",
                    "accountType",
                    account.type,
                    locale
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.currentBalWrap}>
              <Text style={styles.currentBalLabel}>
                {t("finance.accounts.mobile.currentBalanceLabel")}
              </Text>
              <Text style={styles.currentBalValue}>
                {formatAmount(account.currentBalance, account.currency)}
              </Text>
            </View>
          </Card>

          {/* Actual Target Balance Input Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.accounts.mobile.targetBalanceSection").toUpperCase()}
            </Text>
            <Text style={styles.fieldDesc}>
              {t("finance.accounts.mobile.targetBalanceDesc")}
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
                  ? t("finance.accounts.mobile.summaryMatch")
                  : differenceCents > 0
                    ? t("finance.accounts.mobile.summaryPositive")
                    : t("finance.accounts.mobile.summaryNegative")}
              </Text>
            </View>

            <Text style={styles.summaryAmount}>
              {differenceCents === 0
                ? formatAmount("0", account.currency)
                : differenceCents > 0
                  ? `+${formatAmount(String(differenceCents), account.currency)}`
                  : `-${formatAmount(String(Math.abs(differenceCents)), account.currency)}`}
            </Text>

            <Text style={styles.summaryDesc}>
              {differenceCents === 0
                ? t("finance.accounts.mobile.summaryMatchDesc")
                : t("finance.accounts.mobile.summaryAdjustDesc", {
                    amount: formatAmount(
                      String(targetBalanceCents),
                      account.currency
                    ),
                  })}
            </Text>
          </Card>

          {/* Note / Memo */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.accounts.mobile.memoSection").toUpperCase()}
            </Text>
            <TextInput
              control={control}
              name="notes"
              placeholder={t("finance.accounts.mobile.memoPlaceholder")}
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
                ? t("finance.accounts.mobile.closeNoChanges")
                : t("finance.accounts.adjust.submit")}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
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
  headerBtn: {
    padding: 8,
  },
  accountCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 16,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  accountCardLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  scaleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  accountType: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
    textTransform: "capitalize" as const,
  },
  currentBalWrap: {
    alignItems: "flex-end" as const,
  },
  currentBalLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  currentBalValue: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: t.colors.textPrimary,
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldDesc: {
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
  },
  summaryCard: {
    padding: 16,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  summaryCardEqual: {
    backgroundColor: t.colors.successSubtle,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  summaryCardPositive: {
    backgroundColor: t.colors.successSubtle,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  summaryCardNegative: {
    backgroundColor: t.colors.destructiveSubtle,
    borderColor: "rgba(244, 63, 94, 0.35)",
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
    fontSize: 28,
    fontWeight: "800" as const,
    color: t.colors.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
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
