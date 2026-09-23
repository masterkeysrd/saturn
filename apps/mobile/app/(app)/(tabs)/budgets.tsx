import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { PiggyBank, Landmark } from "lucide-react-native"
import { formatAmount, getBudgetColors } from "@saturn/core"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { MonoAmount, Title, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { haptics } from "@/lib/haptics"

interface MockBudget {
  id: string
  name: string
  color: string
  spent: string
  limit: string
  currency: string
}

const BUDGETS: MockBudget[] = [
  {
    id: "b-1",
    name: "Groceries & Food",
    color: "emerald",
    spent: "45000",
    limit: "60000",
    currency: "USD",
  },
  {
    id: "b-2",
    name: "Dining Out",
    color: "amber",
    spent: "28500",
    limit: "30000",
    currency: "USD",
  },
  {
    id: "b-3",
    name: "Personal & Tech",
    color: "indigo",
    spent: "12000",
    limit: "25000",
    currency: "USD",
  },
]

export default function BudgetsScreen() {
  const [activeSegment, setActiveSegment] = useState<"budgets" | "accounts">(
    "budgets"
  )

  const handleSelectSegment = (segment: "budgets" | "accounts") => {
    haptics.selection()
    setActiveSegment(segment)
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Segment Switcher */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeSegment === "budgets" && styles.segmentActive,
          ]}
          activeOpacity={0.7}
          onPress={() => handleSelectSegment("budgets")}
        >
          <PiggyBank
            size={16}
            color={
              activeSegment === "budgets"
                ? theme.colors.textPrimary
                : theme.colors.textMuted
            }
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.segmentText,
              activeSegment === "budgets" && styles.segmentTextActive,
            ]}
          >
            Budgets
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeSegment === "accounts" && styles.segmentActive,
          ]}
          activeOpacity={0.7}
          onPress={() => handleSelectSegment("accounts")}
        >
          <Landmark
            size={16}
            color={
              activeSegment === "accounts"
                ? theme.colors.textPrimary
                : theme.colors.textMuted
            }
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.segmentText,
              activeSegment === "accounts" && styles.segmentTextActive,
            ]}
          >
            Accounts
          </Text>
        </TouchableOpacity>
      </View>

      {activeSegment === "budgets" ? (
        <View style={styles.listSection}>
          <Caption style={styles.sectionHeader}>
            Active Category Allocations
          </Caption>
          {BUDGETS.map((b) => {
            const palette = getBudgetColors(b.color)
            const spentNum = parseInt(b.spent, 10)
            const limitNum = parseInt(b.limit, 10)
            const percentage = Math.min(
              Math.round((spentNum / limitNum) * 100),
              100
            )

            const nativeColors = getNativeBudgetColors(palette.value)

            return (
              <Card key={b.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.budgetTitleRow}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: nativeColors.bar },
                      ]}
                    />
                    <Text style={styles.budgetName}>{b.name}</Text>
                  </View>
                  <Badge
                    size="sm"
                    label={`${percentage}%`}
                    bg={
                      percentage >= 95
                        ? theme.colors.destructiveSubtle
                        : nativeColors.bg
                    }
                    border={
                      percentage >= 95
                        ? "rgba(244, 63, 94, 0.3)"
                        : nativeColors.border
                    }
                    color={
                      percentage >= 95
                        ? theme.colors.destructive
                        : nativeColors.text
                    }
                  />
                </View>

                {/* Progress Track */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${percentage}%`,
                        backgroundColor:
                          percentage >= 95
                            ? theme.colors.destructive
                            : nativeColors.bar,
                      },
                    ]}
                  />
                </View>

                <View style={styles.budgetFooter}>
                  <Text style={styles.spentText}>
                    Spent:{" "}
                    <Text style={styles.whiteText}>
                      {formatAmount(b.spent, b.currency)}
                    </Text>
                  </Text>
                  <Text style={styles.limitText}>
                    Limit: {formatAmount(b.limit, b.currency)}
                  </Text>
                </View>
              </Card>
            )
          })}
        </View>
      ) : (
        <View style={styles.listSection}>
          <Caption style={styles.sectionHeader}>Connected Accounts</Caption>
          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>Primary Checking</Text>
                <Text style={styles.accountMeta}>Chase Bank •••• 4210</Text>
              </View>
              <MonoAmount size="md">{formatAmount("845000", "USD")}</MonoAmount>
            </View>
          </Card>

          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>High Yield Savings</Text>
                <Text style={styles.accountMeta}>Marcus •••• 9811</Text>
              </View>
              <MonoAmount size="md" color={theme.colors.success}>
                {formatAmount("605250", "USD")}
              </MonoAmount>
            </View>
          </Card>

          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>Sapphire Preferred</Text>
                <Text style={styles.accountMeta}>Chase Credit •••• 1044</Text>
              </View>
              <MonoAmount size="md" color={theme.colors.destructive}>
                {formatAmount("-14250", "USD")}
              </MonoAmount>
            </View>
          </Card>
        </View>
      )}
    </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 16,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
  },
  segmentActive: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  segmentText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  listSection: {
    gap: 12,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  budgetCard: {
    padding: 16,
    gap: 12,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  budgetName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  budgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spentText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  whiteText: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  limitText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  accountCard: {
    padding: 16,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  accountMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
})
