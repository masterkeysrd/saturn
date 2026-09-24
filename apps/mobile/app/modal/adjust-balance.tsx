import { useState, useEffect, useMemo } from "react"
import {
  StyleSheet,
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
import {
  useGetAccountQuery,
  useAdjustAccountBalanceMutation,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount, formatCents, toCentsString } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

export default function AdjustBalanceModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { accountId } = useLocalSearchParams<{ accountId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: account, isLoading } = useGetAccountQuery(
    { id: accountId || "" },
    { enabled: !!accountId && !!activeSpaceId }
  )

  const [targetBalanceStr, setTargetBalanceStr] = useState("")
  const [note, setNote] = useState("Manual balance adjustment")
  const [error, setError] = useState("")

  const currentBalanceCents = Number(account?.currentBalance || "0")

  useEffect(() => {
    if (account?.currentBalance !== undefined) {
      setTargetBalanceStr(formatCents(account.currentBalance).toString())
    }
  }, [account?.currentBalance])

  const targetBalanceCents = useMemo(() => {
    if (!targetBalanceStr.trim()) return currentBalanceCents
    const parsed = Number(toCentsString(targetBalanceStr))
    return isNaN(parsed) ? currentBalanceCents : parsed
  }, [targetBalanceStr, currentBalanceCents])

  const differenceCents = targetBalanceCents - currentBalanceCents

  const adjustMutation = useAdjustAccountBalanceMutation()
  const isPending = adjustMutation.isPending

  const handleAdjust = async () => {
    if (!accountId) return
    haptics.light()

    if (differenceCents === 0) {
      toast.show({
        title: "No Adjustment Needed",
        message: "Current balance already matches your entered amount.",
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
          targetBalance: String(targetBalanceCents),
          adjustmentDate: new Date().toISOString(),
          note: note.trim() || undefined,
        },
      })

      haptics.success()
      toast.show({
        title: "Balance Adjusted",
        message: `Balance adjusted to ${formatAmount(String(targetBalanceCents), account?.currency)}.`,
        type: "success",
      })

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Adjustment Failed",
        message: err?.message || "Could not adjust account balance.",
        type: "error",
      })
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  if (!account) {
    return (
      <View style={styles.errorContainer}>
        <AlertCircle size={32} color={theme.colors.destructive} />
        <Text style={styles.errorTitle}>Account Not Found</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Adjust Balance",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ),
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
                <Scale size={20} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountType}>
                  {account.currency} • {account.type.replace("_", " ")}
                </Text>
              </View>
            </View>

            <View style={styles.currentBalWrap}>
              <Text style={styles.currentBalLabel}>Current Balance</Text>
              <Text style={styles.currentBalValue}>
                {formatAmount(account.currentBalance, account.currency)}
              </Text>
            </View>
          </Card>

          {/* Actual Target Balance Input Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>TARGET BALANCE</Text>
            <Text style={styles.fieldDesc}>
              Enter the new actual balance of your account to record a balance
              adjustment:
            </Text>

            <TextInput
              value={targetBalanceStr}
              onChangeText={(text) => {
                setTargetBalanceStr(text.replace(/[^0-9.-]/g, ""))
                setError("")
              }}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              error={error}
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
                <CheckCircle2 size={20} color={theme.colors.success} />
              ) : differenceCents > 0 ? (
                <TrendingUp size={20} color={theme.colors.success} />
              ) : (
                <TrendingDown size={20} color={theme.colors.destructive} />
              )}
              <Text style={styles.summaryTitle}>
                {differenceCents === 0
                  ? "Balances Match"
                  : differenceCents > 0
                    ? "Positive Adjustment"
                    : "Negative Adjustment"}
              </Text>
            </View>

            <Text style={styles.summaryAmount}>
              {differenceCents === 0
                ? "$0.00"
                : differenceCents > 0
                  ? `+${formatAmount(String(differenceCents), account.currency)}`
                  : `-${formatAmount(String(Math.abs(differenceCents)), account.currency)}`}
            </Text>

            <Text style={styles.summaryDesc}>
              {differenceCents === 0
                ? "Your app ledger exactly matches your real statement. No adjustments are necessary."
                : `A balancing entry will automatically be logged to align your account balance to ${formatAmount(String(targetBalanceCents), account.currency)}.`}
            </Text>
          </Card>

          {/* Note / Memo */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>ADJUSTMENT MEMO</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Reason for balance adjustment..."
              placeholderTextColor={theme.colors.textMuted}
            />
          </Card>

          {/* Action Button */}
          <View style={styles.actionFooter}>
            <Button
              onPress={handleAdjust}
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
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  accountCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  scaleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  accountType: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
    textTransform: "capitalize",
  },
  currentBalWrap: {
    alignItems: "flex-end",
  },
  currentBalLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  currentBalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  summaryCard: {
    padding: 16,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  summaryCardEqual: {
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  summaryCardPositive: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  summaryCardNegative: {
    backgroundColor: "rgba(244, 63, 94, 0.08)",
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  summaryDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  actionFooter: {
    marginTop: 8,
  },
})
