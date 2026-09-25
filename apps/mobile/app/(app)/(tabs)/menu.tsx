import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native"
import { useRouter } from "expo-router"
import {
  ReceiptText,
  PiggyBank,
  Landmark,
  CalendarClock,
  HandCoins,
  Inbox,
  FileSpreadsheet,
  Users,
  Settings,
  ChevronRight,
} from "lucide-react-native"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { haptics } from "@/lib/haptics"

export default function MenuScreen() {
  const router = useRouter()
  const { activeSpaceRole } = useSpace()

  const navigateTo = (path: string) => {
    haptics.light()
    router.push(path as never)
  }

  const showWebOnlyNotice = (featureName: string, description: string) => {
    haptics.light()
    Alert.alert(
      `${featureName} (Web Feature)`,
      `${description}\n\nPlease access the Saturn web dashboard on desktop to use this tool.`,
      [{ text: "Got it" }]
    )
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Finance (Web + Mobile Parity) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>FINANCE</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/transactions")}
            >
              <View style={styles.menuLeft}>
                <ReceiptText size={18} color={theme.colors.primary} />
                <Text style={styles.menuLabel}>Transactions</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/budgets")}
            >
              <View style={styles.menuLeft}>
                <PiggyBank size={18} color={theme.colors.accent} />
                <Text style={styles.menuLabel}>Budgets</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/accounts")}
            >
              <View style={styles.menuLeft}>
                <Landmark size={18} color={theme.colors.success} />
                <Text style={styles.menuLabel}>Accounts</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/recurring")}
            >
              <View style={styles.menuLeft}>
                <CalendarClock size={18} color={theme.colors.warning} />
                <Text style={styles.menuLabel}>Recurring & Subscriptions</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/borrowing")}
            >
              <View style={styles.menuLeft}>
                <HandCoins size={18} color={theme.colors.primary} />
                <Text style={styles.menuLabel}>Borrowing & Debts</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() =>
                showWebOnlyNotice(
                  "Review Queue / Inbox",
                  "Email-forwarded bank alerts and receipt ingestion review is an administrative workflow optimized for wide desktop screens."
                )
              }
            >
              <View style={styles.menuLeft}>
                <Inbox size={18} color="#818cf8" />
                <Text style={styles.menuLabel}>Review Queue (Inbox)</Text>
              </View>
              <View style={styles.menuRight}>
                <Badge variant="outline" size="sm" label="Web Only" />
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() =>
                showWebOnlyNotice(
                  "Bank Reconciliation",
                  "Reconciliation against uploaded bank statements and CSV lines is handled on the Saturn web app."
                )
              }
            >
              <View style={styles.menuLeft}>
                <FileSpreadsheet size={18} color={theme.colors.textMuted} />
                <Text style={styles.menuLabel}>Reconciliation</Text>
              </View>
              <View style={styles.menuRight}>
                <Badge variant="outline" size="sm" label="Web Only" />
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 2: Workspace */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>WORKSPACE</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings/space")}
            >
              <View style={styles.menuLeft}>
                <Users size={18} color={theme.colors.accent} />
                <Text style={styles.menuLabel}>
                  Workspace Details & Members
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Badge
                  variant={activeSpaceRole === "owner" ? "primary" : "default"}
                  size="sm"
                  label={activeSpaceRole.toUpperCase()}
                />
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 3: Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SETTINGS</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings")}
            >
              <View style={styles.menuLeft}>
                <Settings size={18} color={theme.colors.textSecondary} />
                <Text style={styles.menuLabel}>Settings & Preferences</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </Card>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    paddingHorizontal: 4,
    letterSpacing: 0.8,
  },
  menuGroup: {
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLabel: {
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  menuRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
})
