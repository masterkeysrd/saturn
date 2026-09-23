import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
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

export default function SettingsScreen() {
  const router = useRouter()
  const {
    user,
    logout,
    activeSpaceId,
    isBiometricSupported,
    isBiometricActive,
    toggleBiometrics,
  } = useAuth()

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out from Saturn?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout()
          router.replace("/(auth)/login")
        },
      },
    ])
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "ME"

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || "Saturn User"}</Text>
          <Text style={styles.profileEmail}>
            {user?.email || "user@saturn.local"}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {user?.role === "admin" ? "System Admin" : "Active Member"}
            </Text>
          </View>
        </View>
      </View>

      {/* Settings Navigation List */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>WORKSPACE</Text>
        <View style={styles.menuGroup}>
          <TouchableOpacity
            style={styles.menuItem}
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
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>SECURITY & PREFERENCES</Text>
        <View style={styles.menuGroup}>
          {isBiometricSupported && (
            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Fingerprint size={18} color={theme.colors.primary} />
                <Text style={styles.menuLabel}>Biometric Unlock</Text>
              </View>
              <Switch
                value={isBiometricActive}
                onValueChange={(val) => {
                  toggleBiometrics(val)
                }}
                trackColor={{
                  false: theme.colors.surfaceHighlight,
                  true: theme.colors.primary,
                }}
                thumbColor="#ffffff"
              />
            </View>
          )}

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuLeft}>
              <ShieldCheck size={18} color={theme.colors.success} />
              <Text style={styles.menuLabel}>Active Sessions & Devices</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuLeft}>
              <Bell size={18} color={theme.colors.warning} />
              <Text style={styles.menuLabel}>Notifications & Alerts</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuLeft}>
              <Sparkles size={18} color={theme.colors.accent} />
              <Text style={styles.menuLabel}>AI Agents & Providers</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut
          size={18}
          color={theme.colors.destructive}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
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
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
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
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginTop: 2,
  },
  roleText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginLeft: 4,
  },
  menuGroup: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuLabel: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  menuRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  menuValue: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    marginTop: 10,
  },
  signOutText: {
    color: theme.colors.destructive,
    fontWeight: "600",
    fontSize: 15,
  },
})
