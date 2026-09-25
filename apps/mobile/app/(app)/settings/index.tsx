import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import AsyncStorage from "@react-native-async-storage/async-storage"
import Constants from "expo-constants"
import {
  ShieldCheck,
  Layers,
  Users,
  Bell,
  LogOut,
  ChevronRight,
  Sparkles,
  Fingerprint,
  HardDrive,
  Coins,
  Info,
  CheckCircle2,
} from "lucide-react-native"
import { useListActiveSessionsQuery } from "@saturn/api/saturn/identity/v1/identity"
import { useGetFinanceSettingsQuery } from "@saturn/api/saturn/finance/v1/finance"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function SettingsScreen() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const {
    user,
    logout,
    isBiometricSupported,
    isBiometricActive,
    toggleBiometrics,
  } = useAuth()
  const { activeSpace, activeSpaceRole, activeSpaceId } = useSpace()

  // 1. Query active sessions for device count indicator
  const { data: sessionsData } = useListActiveSessionsQuery({})
  const sessionCount = sessionsData?.sessions?.length ?? 1

  // 2. Query workspace finance settings for base currency
  const { data: financeSettings } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = financeSettings?.baseCurrency || "USD"

  const [signOutModalVisible, setSignOutModalVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)

  const handleConfirmSignOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      toast.show({
        type: "info",
        title: "Signed Out",
        message: "You have been logged out",
      })
      router.replace("/(auth)/login")
    } catch {
      setSigningOut(false)
      setSignOutModalVisible(false)
    }
  }

  const handleToggleBiometrics = async (val: boolean) => {
    const success = await toggleBiometrics(val)
    if (success) {
      toast.show({
        type: "success",
        title: val ? "Biometrics Enabled" : "Biometrics Disabled",
        message: val
          ? "Face ID / Fingerprint will be required to unlock Saturn."
          : "Biometric requirement removed.",
      })
    }
  }

  const handleClearCache = () => {
    haptics.warning()
    Alert.alert(
      "Clear Offline Cache?",
      "This will purge stored offline data and refetch the latest transactions and balances from the Saturn server.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            setClearingCache(true)
            try {
              await AsyncStorage.removeItem("SATURN_QUERY_OFFLINE_CACHE")
              await queryClient.clear()
              await queryClient.invalidateQueries()
              haptics.success()
              toast.show({
                type: "success",
                title: "Cache Cleared",
                message: "Local storage flushed and queries revalidated.",
              })
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: "Clear Failed",
                message: err?.message || "Could not clear cache.",
              })
            } finally {
              setClearingCache(false)
            }
          },
        },
      ]
    )
  }

  const appVersion = Constants.expoConfig?.version || "0.0.1"

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* User Profile Overview Card */}
        <Card style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            <Avatar name={user?.name || "User"} size={54} />
            <View style={styles.verifiedBadge}>
              <CheckCircle2 size={12} color="#ffffff" />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.name || "Saturn User"}
            </Text>
            {user?.username && (
              <Text style={styles.profileUsername}>@{user.username}</Text>
            )}
            <Text style={styles.profileEmail}>
              {user?.email || "user@saturn.local"}
            </Text>
            {user?.id && (
              <Text style={styles.profileId} numberOfLines={1}>
                {user.id}
              </Text>
            )}
            <View style={styles.profileBadgeRow}>
              <Badge
                variant={user?.role === "admin" ? "primary" : "default"}
                size="sm"
                label={
                  user?.role === "admin" ? "System Admin" : "Active Member"
                }
              />
            </View>
          </View>
        </Card>

        {/* Section 1: Workspace & Finance */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>WORKSPACE & FINANCE</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/modal/switch-space")}
            >
              <View style={styles.menuLeft}>
                <Layers size={18} color={theme.colors.primary} />
                <Text style={styles.menuLabel}>Active Workspace</Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>
                  {activeSpace?.name || "Personal"}
                </Text>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/(app)/settings/space")}
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

            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Coins size={18} color={theme.colors.success} />
                <Text style={styles.menuLabel}>Base Currency</Text>
              </View>
              <View style={styles.menuRight}>
                <Badge variant="outline" size="sm" label={baseCurrency} />
              </View>
            </View>
          </Card>
        </View>

        {/* Section 2: Security & Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SECURITY & PRIVACY</Text>
          <Card style={styles.menuGroup}>
            {isBiometricSupported && (
              <View style={[styles.menuItem, styles.menuItemBorder]}>
                <View style={styles.menuLeft}>
                  <Fingerprint size={18} color={theme.colors.primary} />
                  <Text style={styles.menuLabel}>Biometric Unlock</Text>
                </View>
                <Switch
                  value={isBiometricActive}
                  onValueChange={(val) => {
                    handleToggleBiometrics(val)
                  }}
                  trackColor={{
                    false: theme.colors.surfaceHighlight,
                    true: theme.colors.primary,
                  }}
                  thumbColor="#ffffff"
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => router.push("/(app)/settings/security")}
            >
              <View style={styles.menuLeft}>
                <ShieldCheck size={18} color={theme.colors.success} />
                <Text style={styles.menuLabel}>Active Sessions & Devices</Text>
              </View>
              <View style={styles.menuRight}>
                <Badge
                  variant="primary"
                  size="sm"
                  label={`${sessionCount} ${sessionCount === 1 ? "device" : "devices"}`}
                />
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 3: Preferences & Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PREFERENCES & AGENTS</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
            >
              <View style={styles.menuLeft}>
                <Bell size={18} color={theme.colors.warning} />
                <Text style={styles.menuLabel}>Notifications & Alerts</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
              <View style={styles.menuLeft}>
                <Sparkles size={18} color={theme.colors.accent} />
                <Text style={styles.menuLabel}>AI Agents & Providers</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 4: Storage & System Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & SYSTEM</Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={handleClearCache}
              disabled={clearingCache}
            >
              <View style={styles.menuLeft}>
                <HardDrive size={18} color={theme.colors.info} />
                <Text style={styles.menuLabel}>Clear Offline Cache</Text>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Info size={18} color={theme.colors.textMuted} />
                <Text style={styles.menuLabel}>App Version</Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>v{appVersion}</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Sign Out Button */}
        <Button
          variant="destructive"
          size="lg"
          leftIcon={<LogOut size={18} color={theme.colors.destructive} />}
          onPress={() => setSignOutModalVisible(true)}
        >
          Sign Out
        </Button>

        {/* Sign Out Confirmation Dialog */}
        <ConfirmDialog
          visible={signOutModalVisible}
          title="Sign Out"
          message="Are you sure you want to sign out from Saturn on this device?"
          confirmText="Sign Out"
          cancelText="Cancel"
          isDestructive
          loading={signingOut}
          onConfirm={handleConfirmSignOut}
          onCancel={() => setSignOutModalVisible(false)}
        />
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
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  avatarWrapper: {
    position: "relative",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  profileUsername: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  profileEmail: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  profileId: {
    fontSize: 10,
    fontFamily: "monospace",
    color: theme.colors.textMuted,
    opacity: 0.7,
  },
  profileBadgeRow: {
    marginTop: 4,
    flexDirection: "row",
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
  menuValue: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
})
