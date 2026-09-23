import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native"
import { useRouter } from "expo-router"
import {
  ShieldCheck,
  Layers,
  Bell,
  LogOut,
  ChevronRight,
  Sparkles,
  Fingerprint,
} from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

export default function SettingsScreen() {
  const router = useRouter()
  const toast = useToast()
  const {
    user,
    logout,
    activeSpaceId,
    isBiometricSupported,
    isBiometricActive,
    toggleBiometrics,
  } = useAuth()

  const [signOutModalVisible, setSignOutModalVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

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
      })
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Profile Card */}
      <Card style={styles.profileCard}>
        <Avatar name={user?.name || "User"} size={52} />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || "Saturn User"}</Text>
          <Text style={styles.profileEmail}>
            {user?.email || "user@saturn.local"}
          </Text>
          <Badge
            variant={user?.role === "admin" ? "primary" : "default"}
            size="sm"
            label={user?.role === "admin" ? "System Admin" : "Active Member"}
            style={{ marginTop: 2 }}
          />
        </View>
      </Card>

      {/* Settings Navigation List */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>WORKSPACE</Text>
        <Card style={styles.menuGroup}>
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => router.push("/modal/switch-space")}
          >
            <View style={styles.menuLeft}>
              <Layers size={18} color={theme.colors.primary} />
              <Text style={styles.menuLabel}>Switch Workspace</Text>
            </View>
            <View style={styles.menuRight}>
              <Text style={styles.menuValue}>
                {activeSpaceId || "Personal"}
              </Text>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>SECURITY & PREFERENCES</Text>
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
            style={[styles.menuItem, styles.menuItemBorder]}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <ShieldCheck size={18} color={theme.colors.success} />
              <Text style={styles.menuLabel}>Active Sessions & Devices</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>

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
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  profileEmail: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
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
    gap: 6,
  },
  menuValue: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
})
