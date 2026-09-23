import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from "react-native"
import { PiggyBank, Landmark } from "lucide-react-native"
import { formatAmount, getBudgetColors } from "@saturn/core"
import { theme } from "@/lib/theme"

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Segment Switcher */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeSegment === "budgets" && styles.segmentActive,
          ]}
          onPress={() => setActiveSegment("budgets")}
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
          onPress={() => setActiveSegment("accounts")}
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
          <Text style={styles.sectionHeader}>Active Category Allocations</Text>
          {BUDGETS.map((b) => {
            const palette = getBudgetColors(b.color)
            const spentNum = parseInt(b.spent, 10)
            const limitNum = parseInt(b.limit, 10)
            const percentage = Math.min(
              Math.round((spentNum / limitNum) * 100),
              100
            )

            const hexColor =
              theme.budgetColors[palette.value] || theme.colors.primary

            return (
              <View key={b.id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.budgetTitleRow}>
                    <View
                      style={[styles.colorDot, { backgroundColor: hexColor }]}
                    />
                    <Text style={styles.budgetName}>{b.name}</Text>
                  </View>
                  <Text style={styles.budgetPercent}>{percentage}%</Text>
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
                            : hexColor,
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
              </View>
            )
          })}
        </View>
      ) : (
        <View style={styles.listSection}>
          <Text style={styles.sectionHeader}>Connected Accounts</Text>
          <View style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>Primary Checking</Text>
                <Text style={styles.accountMeta}>Chase Bank •••• 4210</Text>
              </View>
              <Text style={styles.accountBalance}>
                {formatAmount("845000", "USD")}
              </Text>
            </View>
          </View>

          <View style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>High Yield Savings</Text>
                <Text style={styles.accountMeta}>Marcus •••• 9811</Text>
              </View>
              <Text style={styles.accountBalance}>
                {formatAmount("605250", "USD")}
              </Text>
            </View>
          </View>

          <View style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>Sapphire Preferred</Text>
                <Text style={styles.accountMeta}>Chase Credit •••• 1044</Text>
              </View>
              <Text
                style={[
                  styles.accountBalance,
                  { color: theme.colors.destructive },
                ]}
              >
                -{formatAmount("142000", "USD")}
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.md,
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
    backgroundColor: theme.colors.surfaceHighlight,
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
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  budgetCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  budgetPercent: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accountName: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  accountMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  accountBalance: {
    fontSize: 15,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
})
