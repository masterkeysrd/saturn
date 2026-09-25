import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native"
import { useRouter } from "expo-router"
import {
  Smartphone,
  Laptop,
  Monitor,
  Globe,
  Trash2,
  LogOut,
  ShieldCheck,
  Clock,
  MapPin,
  RefreshCw,
} from "lucide-react-native"
import {
  useListActiveSessionsQuery,
  useRevokeSessionMutation,
  useRevokeAllSessionsMutation,
  type UserSession,
} from "@saturn/api/saturn/identity/v1/identity"
import { parseUserAgent } from "@saturn/core"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function SecuritySessionsScreen() {
  const router = useRouter()
  const toast = useToast()
  const { logout } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  // 1. Query active user sessions
  const {
    data: sessionsData,
    isLoading,
    refetch,
  } = useListActiveSessionsQuery({})

  const sessions = sessionsData?.sessions || []

  // 2. Mutations
  const revokeSessionMutation = useRevokeSessionMutation()
  const revokeAllSessionsMutation = useRevokeAllSessionsMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const promptRevokeSession = (session: UserSession) => {
    if (!session.sessionId) return
    const parsed = parseUserAgent(session.userAgent || "")
    haptics.warning()

    Alert.alert(
      "Revoke Session?",
      `Are you sure you want to disconnect "${parsed.device}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeSessionMutation.mutateAsync({
                session_id: session.sessionId || "",
                req: { sessionId: session.sessionId || "" },
              })
              haptics.success()
              toast.show({
                type: "success",
                title: "Session Revoked",
                message: `${parsed.device} was disconnected.`,
              })
              await refetch()
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: "Revocation Failed",
                message: err?.message || "Could not revoke session.",
              })
            }
          },
        },
      ]
    )
  }

  const promptRevokeAllSessions = () => {
    haptics.warning()
    Alert.alert(
      "Sign Out of All Devices?",
      "This will immediately invalidate all active sessions across every device, including this mobile phone. You will be redirected to the login screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out Everywhere",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeAllSessionsMutation.mutateAsync({})
              haptics.success()
              await logout()
              router.replace("/(auth)/login")
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: "Action Failed",
                message: err?.message || "Could not revoke all sessions.",
              })
            }
          },
        },
      ]
    )
  }

  const formatTimestamp = (ts?: string) => {
    if (!ts) return "Unknown"
    const d = new Date(ts)
    if (isNaN(d.getTime())) return "Unknown"
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getDeviceIcon = (parsed: ReturnType<typeof parseUserAgent>) => {
    if (parsed.isMobile) {
      return <Smartphone size={20} color={theme.colors.primary} />
    }
    if (parsed.os === "macOS" || parsed.os === "Windows") {
      return <Laptop size={20} color={theme.colors.accent} />
    }
    return <Monitor size={20} color={theme.colors.textSecondary} />
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
          />
        }
      >
        {/* Info Banner */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.infoIconBox}>
              <ShieldCheck size={20} color={theme.colors.success} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Authorized Logins</Text>
              <Text style={styles.infoSubtitle}>
                These devices currently hold valid refresh tokens to access your
                Saturn space.
              </Text>
            </View>
          </View>
        </Card>

        {/* Sessions List Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            ACTIVE SESSIONS ({sessions.length})
          </Text>
          {sessions.length > 1 && (
            <TouchableOpacity
              onPress={promptRevokeAllSessions}
              activeOpacity={0.7}
              disabled={revokeAllSessionsMutation.isPending}
            >
              <Text style={styles.revokeAllText}>Sign Out Everywhere</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sessions List */}
        {isLoading && sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <RefreshCw size={24} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Loading active sessions...</Text>
          </Card>
        ) : sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Globe size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No active sessions found.</Text>
          </Card>
        ) : (
          <View style={styles.sessionsList}>
            {sessions.map((session, idx) => {
              const parsed = parseUserAgent(session.userAgent || "")
              const isFirst = idx === 0 // Server typically returns current session first

              return (
                <Card key={session.sessionId || idx} style={styles.sessionCard}>
                  <View style={styles.sessionHeaderRow}>
                    <View style={styles.sessionLeft}>
                      <View style={styles.deviceIconBox}>
                        {getDeviceIcon(parsed)}
                      </View>
                      <View style={styles.sessionNameContainer}>
                        <View style={styles.deviceNameRow}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {parsed.device}
                          </Text>
                          {isFirst && (
                            <Badge
                              variant="success"
                              size="sm"
                              label="Current Device"
                            />
                          )}
                        </View>
                        <Text style={styles.sessionUa} numberOfLines={1}>
                          {session.userAgent || "Generic client"}
                        </Text>
                      </View>
                    </View>

                    {/* Revoke single session button */}
                    <TouchableOpacity
                      style={styles.revokeBtn}
                      activeOpacity={0.7}
                      onPress={() => promptRevokeSession(session)}
                      disabled={revokeSessionMutation.isPending}
                    >
                      <Trash2 size={16} color={theme.colors.destructive} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.divider} />

                  {/* Metadata Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <MapPin size={13} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>
                        {session.ipAddress || "Unknown IP"}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Clock size={13} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>
                        Active: {formatTimestamp(session.lastUsedAt)}
                      </Text>
                    </View>
                  </View>
                </Card>
              )
            })}
          </View>
        )}

        {/* Global Sign Out Button */}
        {sessions.length > 1 && (
          <Button
            variant="destructive"
            size="lg"
            leftIcon={<LogOut size={18} color={theme.colors.destructive} />}
            onPress={promptRevokeAllSessions}
            disabled={revokeAllSessionsMutation.isPending}
            style={styles.signOutAllBtn}
          >
            Sign Out of All Devices
          </Button>
        )}
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
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  infoCard: {
    padding: 14,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextContainer: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  infoSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
  },
  revokeAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  sessionsList: {
    gap: 12,
  },
  sessionCard: {
    padding: 14,
    gap: 12,
  },
  sessionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  deviceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionNameContainer: {
    flex: 1,
    gap: 2,
  },
  deviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  sessionUa: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  revokeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(244, 63, 94, 0.1)",
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  signOutAllBtn: {
    marginTop: 8,
  },
})
