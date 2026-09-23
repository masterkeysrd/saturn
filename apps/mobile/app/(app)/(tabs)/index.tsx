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
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ScanLine,
  PiggyBank,
} from "lucide-react-native"
import { formatAmount, formatCents } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { MonoAmount, Title, Caption } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import { SkeletonCard } from "@/components/ui/skeleton-loader"
import { haptics } from "@/lib/haptics"

export default function OverviewScreen() {
  const router = useRouter()
  const { spaces, activeSpace, isLoading, refetchSpaces } = useSpace()

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              haptics.light()
              refetchSpaces()
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Net Worth Card */}
        <Card style={styles.netWorthCard}>
          <Caption style={styles.cardLabel}>TOTAL NET WORTH</Caption>
          <MonoAmount size="xl" style={styles.netWorthAmount}>
            {formatAmount("1450250", "USD")}
          </MonoAmount>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View
                style={[
                  styles.statIconBadge,
                  { backgroundColor: theme.colors.successSubtle },
                ]}
              >
                <ArrowDownLeft size={14} color={theme.colors.success} />
              </View>
              <View>
                <Caption>Income (Sep)</Caption>
                <MonoAmount size="sm" color={theme.colors.success}>
                  {formatAmount("450000", "USD")}
                </MonoAmount>
              </View>
            </View>

            <View style={styles.statItem}>
              <View
                style={[
                  styles.statIconBadge,
                  { backgroundColor: theme.colors.destructiveSubtle },
                ]}
              >
                <ArrowUpRight size={14} color={theme.colors.destructive} />
              </View>
              <View>
                <Caption>Expenses (Sep)</Caption>
                <MonoAmount size="sm" color={theme.colors.destructive}>
                  {formatAmount("185000", "USD")}
                </MonoAmount>
              </View>
            </View>
          </View>
        </Card>

        {/* Quick Actions Row */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push("/modal/add-transaction")
            }}
          >
            <View style={styles.actionIconCircle}>
              <Plus size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push("/(app)/(tabs)/transactions")
            }}
          >
            <View style={styles.actionIconCircle}>
              <ArrowRightLeft size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionText}>Activity</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push("/(app)/(tabs)/budgets")
            }}
          >
            <View style={styles.actionIconCircle}>
              <PiggyBank size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionText}>Budgets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              router.push("/modal/add-transaction")
            }}
          >
            <View style={styles.actionIconCircle}>
              <ScanLine size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionText}>Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Connected Workspaces Section */}
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>Connected Workspaces</Title>
          {isLoading ? (
            <SkeletonCard />
          ) : (
            <Card style={styles.spacesCard}>
              {spaces.length ? (
                spaces.map((space) => {
                  const isCurrent = space.id === activeSpace?.id
                  return (
                    <View key={space.id || space.name} style={styles.spaceRow}>
                      <Text style={styles.spaceName}>{space.name}</Text>
                      <Badge
                        variant={isCurrent ? "primary" : "default"}
                        size="sm"
                        label={isCurrent ? "Active" : "Connected"}
                      />
                    </View>
                  )
                })
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    Workspace ready: {formatCents(1450250)} units
                  </Text>
                </View>
              )}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
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
    padding: 16,
    paddingBottom: 80,
    gap: 20,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 2,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  netWorthCard: {
    padding: 20,
  },
  cardLabel: {
    letterSpacing: 1,
  },
  netWorthAmount: {
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
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  actionButton: {
    alignItems: "center",
    gap: 8,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
  },
  spacesCard: {
    padding: 16,
  },
  spaceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  spaceName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
  },
  emptyContainer: {
    paddingVertical: 8,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
})
