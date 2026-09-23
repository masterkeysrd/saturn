import React from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native"
import { useRouter } from "expo-router"
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ScanLine,
  Wallet,
} from "lucide-react-native"
import { formatAmount, formatCents } from "@saturn/core"
import { useListSpacesQuery } from "@saturn/api/saturn/space/v1/space"
import { theme } from "../../../lib/theme"

export default function OverviewScreen() {
  const router = useRouter()
  const {
    data: spacesData,
    refetch,
    isRefetching,
  } = useListSpacesQuery({
    pageSize: 10,
    pageToken: "",
  })

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Net Worth Card */}
      <View style={styles.netWorthCard}>
        <Text style={styles.cardLabel}>TOTAL NET WORTH</Text>
        <Text style={styles.netWorthAmount}>
          {formatAmount("1450250", "USD")}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View
              style={[
                styles.statIconBadge,
                { backgroundColor: "rgba(52, 211, 153, 0.15)" },
              ]}
            >
              <ArrowDownLeft size={14} color={theme.colors.success} />
            </View>
            <View>
              <Text style={styles.statLabel}>Income (Sep)</Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                {formatAmount("450000", "USD")}
              </Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <View
              style={[
                styles.statIconBadge,
                { backgroundColor: "rgba(244, 63, 94, 0.15)" },
              ]}
            >
              <ArrowUpRight size={14} color={theme.colors.destructive} />
            </View>
            <View>
              <Text style={styles.statLabel}>Expenses (Sep)</Text>
              <Text
                style={[styles.statValue, { color: theme.colors.destructive }]}
              >
                {formatAmount("185000", "USD")}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions Row */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/modal/add-transaction")}
        >
          <View style={styles.actionIconCircle}>
            <Plus size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.actionText}>Add</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/(app)/(tabs)/transactions")}
        >
          <View style={styles.actionIconCircle}>
            <TrendingUp size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.actionText}>Activity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/(app)/(tabs)/budgets")}
        >
          <View style={styles.actionIconCircle}>
            <Wallet size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.actionText}>Budgets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/modal/add-transaction")}
        >
          <View style={styles.actionIconCircle}>
            <ScanLine size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.actionText}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Workspaces Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connected Workspaces</Text>
        <View style={styles.spacesCard}>
          {spacesData?.spaces?.length ? (
            spacesData.spaces.map((space) => (
              <View key={space.id || space.name} style={styles.spaceRow}>
                <Text style={styles.spaceName}>{space.name}</Text>
                <Text style={styles.spaceId}>{space.id || "Active"}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              Backend connected. Workspace ready: {formatCents(1450250)} units
            </Text>
          )}
        </View>
      </View>
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
    gap: 20,
  },
  netWorthCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    letterSpacing: 1,
  },
  netWorthAmount: {
    fontSize: 34,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginVertical: 10,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statIconBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
  },
  actionButton: {
    alignItems: "center",
    gap: 6,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  spacesCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
  },
  spaceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  spaceName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  spaceId: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
})
