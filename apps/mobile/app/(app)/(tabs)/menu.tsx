import { useState } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  Link2,
  Sparkles,
  Workflow,
  Palette,
  Sun,
  Moon,
  Smartphone,
  ShieldCheck,
  KeyRound,
  ArrowLeftRight,
  Globe,
  Check,
  X,
} from "lucide-react-native"
import { useListInboxItemsQuery } from "@saturn/api/saturn/finance/v1/finance"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { SUPPORTED_UI_LOCALES } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { formatTabBadgeCount } from "@/lib/tab-badges"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
  type ThemeMode,
} from "@/lib/theme"
import { AIHeaderButton } from "@/components/app-header"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

const APPEARANCE_OPTIONS: readonly {
  value: ThemeMode
  label: string
  Icon: typeof Sun
}[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Smartphone },
]

export default function MenuScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { user } = useAuth()
  const {
    activeSpace,
    activeSpaceId,
    activeSpaceRole,
    locale,
    updateRegionalPreferences,
  } = useSpace()
  const { t, supportedLocales } = useI18n()
  const { mode, setMode, colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [languageModalVisible, setLanguageModalVisible] = useState(false)

  const activeLocaleOption =
    supportedLocales.find((opt) => opt.value === locale) ??
    SUPPORTED_UI_LOCALES[0]

  const handleSelectLanguage = async (nextLocale: string) => {
    setLanguageModalVisible(false)
    if (nextLocale === locale) return
    try {
      haptics.selection()
      await updateRegionalPreferences({ locale: nextLocale })
      toast.show({
        type: "success",
        title: t("settings.regional.saved"),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: "Update Failed",
        message:
          err instanceof Error ? err.message : "Failed to update language",
      })
    }
  }

  const { data: inboxData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 50,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: Boolean(activeSpaceId), retry: false }
  )
  const pendingInboxCount = inboxData?.inboxItems?.length ?? 0
  const pendingInboxBadge = formatTabBadgeCount(pendingInboxCount)

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 20, pageToken: "" },
    { enabled: Boolean(activeSpaceId) }
  )
  const hasApprovalNeeded = (threadsData?.threads ?? []).some(
    (t) => t.status === "awaiting_approval"
  )

  const displayName =
    user?.name && user.name !== "User"
      ? user.name
      : user?.username || user?.email || "Saturn User"

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
      <View
        style={[styles.topHeader, { paddingTop: Math.max(insets.top, 10) + 4 }]}
      >
        <Text style={styles.topHeaderTitle}>{t("nav.menu")}</Text>
        <AIHeaderButton />
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile & Workspace Switcher Card */}
        <Card style={styles.profileCard}>
          <TouchableOpacity
            style={styles.profileTopRow}
            activeOpacity={0.7}
            onPress={() => navigateTo("/(app)/settings")}
            accessibilityRole="button"
            accessibilityLabel="Open profile and settings"
            testID="menu-profile-row"
          >
            <Avatar name={displayName} imageUri={user?.avatarUrl} size={44} />
            <View style={styles.profileTextCol}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email ? (
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.workspaceRow}>
            <View style={styles.workspaceInfo}>
              <Text style={styles.workspaceCaption}>Active workspace</Text>
              <View style={styles.workspaceTitleRow}>
                <Text style={styles.workspaceName} numberOfLines={1}>
                  {activeSpace?.name || "Personal"}
                </Text>
                <Badge
                  variant={activeSpaceRole === "owner" ? "primary" : "default"}
                  size="sm"
                  label={activeSpaceRole.toUpperCase()}
                />
              </View>
            </View>
            <TouchableOpacity
              style={styles.switchBtn}
              activeOpacity={0.7}
              onPress={() => navigateTo("/modal/switch-space")}
              accessibilityRole="button"
              accessibilityLabel="Switch workspace"
              testID="menu-switch-space-btn"
            >
              <ArrowLeftRight size={13} color={colors.primary} />
              <Text style={styles.switchBtnText}>Switch</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Section 1: Triage & Automation */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Triage & Automation</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/inbox")}
              testID="menu-review-queue"
            >
              <View style={styles.menuLeft}>
                <Inbox size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>{t("nav.inbox")}</Text>
              </View>
              <View style={styles.menuRight}>
                {pendingInboxBadge !== undefined && (
                  <Badge
                    variant="primary"
                    size="sm"
                    label={String(pendingInboxBadge)}
                  />
                )}
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/ai")}
              testID="menu-ai-assistant"
            >
              <View style={styles.menuLeft}>
                <Sparkles size={18} color={colors.brandSecondary} />
                <Text style={styles.menuLabel}>AI Assistant</Text>
              </View>
              <View style={styles.menuRight}>
                {hasApprovalNeeded && (
                  <Badge variant="warning" size="sm" label="Approval needed" />
                )}
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/workflows")}
              testID="menu-workflows"
            >
              <View style={styles.menuLeft}>
                <Workflow size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>{t("nav.workflows")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 2: Finance */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{t("nav.finance")}</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/transactions")}
            >
              <View style={styles.menuLeft}>
                <ReceiptText size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>{t("nav.transactions")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/budgets")}
            >
              <View style={styles.menuLeft}>
                <PiggyBank size={18} color={colors.brandSecondary} />
                <Text style={styles.menuLabel}>{t("nav.budgets")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/accounts")}
            >
              <View style={styles.menuLeft}>
                <Landmark size={18} color={colors.success} />
                <Text style={styles.menuLabel}>{t("nav.accounts")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/recurring")}
            >
              <View style={styles.menuLeft}>
                <CalendarClock size={18} color={colors.warning} />
                <Text style={styles.menuLabel}>{t("nav.recurring")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/finance/borrowing")}
            >
              <View style={styles.menuLeft}>
                <HandCoins size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>{t("nav.borrowing")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
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
                <FileSpreadsheet size={18} color={colors.textMuted} />
                <Text style={styles.menuLabel}>{t("nav.reconciliation")}</Text>
              </View>
              <View style={styles.menuRight}>
                <Badge variant="outline" size="sm" label="Web Only" />
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 3: Workspace & Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Workspace & Preferences</Text>
          <Card style={styles.menuGroup}>
            <View style={[styles.appearanceRow, styles.menuItemBorder]}>
              <View style={styles.menuLeft}>
                <Sun size={18} color={colors.warning} />
                <Text style={styles.menuLabel}>Appearance</Text>
              </View>
              <View style={styles.appearanceStrip}>
                {APPEARANCE_OPTIONS.map(({ value, label, Icon }) => {
                  const isActive = mode === value
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.appearanceChip,
                        isActive && styles.appearanceChipActive,
                      ]}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`${label} theme`}
                      onPress={() => {
                        haptics.selection()
                        setMode(value)
                      }}
                    >
                      <Icon
                        size={12}
                        color={
                          isActive ? colors.primaryForeground : colors.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.appearanceChipLabel,
                          isActive && styles.appearanceChipLabelActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                setLanguageModalVisible(true)
              }}
              testID="menu-language-row"
              accessibilityRole="button"
              accessibilityLabel={t("settings.regional.language")}
            >
              <View style={styles.menuLeft}>
                <Globe size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.regional.language")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>{activeLocaleOption.label}</Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings/connected-accounts")}
            >
              <View style={styles.menuLeft}>
                <Link2 size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>Connected Accounts</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings/space")}
            >
              <View style={styles.menuLeft}>
                <Users size={18} color={colors.brandSecondary} />
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
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings/security")}
            >
              <View style={styles.menuLeft}>
                <ShieldCheck size={18} color={colors.success} />
                <Text style={styles.menuLabel}>Security & Biometrics</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings/api-keys")}
            >
              <View style={styles.menuLeft}>
                <KeyRound size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>API Keys</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, __DEV__ && styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => navigateTo("/(app)/settings")}
            >
              <View style={styles.menuLeft}>
                <Settings size={18} color={colors.textSecondary} />
                <Text style={styles.menuLabel}>{t("nav.settings")}</Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {__DEV__ && (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => navigateTo("/(app)/settings/design-system")}
              >
                <View style={styles.menuLeft}>
                  <Palette size={18} color={colors.primary} />
                  <Text style={styles.menuLabel}>Design System Gallery</Text>
                </View>
                <View style={styles.menuRight}>
                  <Badge variant="outline" size="sm" label="DEV" />
                  <ChevronRight size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            )}
          </Card>
        </View>
      </ScrollView>

      <Modal
        visible={languageModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            Platform.OS === "android" && {
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {t("settings.regional.language")}
              </Text>
              <Text style={styles.modalSubtitle}>
                {t("settings.regional.description")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setLanguageModalVisible(false)}
              style={styles.closeBtn}
              accessibilityLabel={t("common.close")}
            >
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={[...supportedLocales]}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const isSelected = item.value === locale
              return (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    isSelected && styles.modalItemActive,
                  ]}
                  onPress={() => void handleSelectLanguage(item.value)}
                  activeOpacity={0.7}
                  testID={`menu-language-option-${item.value}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={styles.modalItemDescription}>
                      {item.value}
                    </Text>
                  </View>
                  {isSelected && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              )
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.4,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 20,
  },
  profileCard: {
    overflow: "hidden" as const,
  },
  profileTopRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  profileTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  profileEmail: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  workspaceRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: t.colors.surfaceSubtle,
  },
  workspaceInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  workspaceCaption: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  workspaceTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  workspaceName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  switchBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: `${t.colors.primary}40`,
  },
  switchBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    paddingHorizontal: 4,
  },
  menuGroup: {
    overflow: "hidden" as const,
  },
  menuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  menuLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  menuLabel: {
    fontSize: 15,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  menuRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  menuValue: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  appearanceRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
  },
  appearanceStrip: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 2,
    gap: 2,
  },
  appearanceChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: t.radius.sm,
  },
  appearanceChipActive: {
    backgroundColor: t.colors.primary,
  },
  appearanceChipLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  appearanceChipLabelActive: {
    color: t.colors.primaryForeground,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  modalItemActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  modalItemText: {
    fontSize: 15,
    color: t.colors.textPrimary,
  },
  modalItemTextActive: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  modalItemDescription: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
})
