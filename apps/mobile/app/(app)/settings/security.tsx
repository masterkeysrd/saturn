import { useState, useEffect } from "react"
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
  Fingerprint,
  Shield,
  KeyRound,
} from "lucide-react-native"
import {
  useListActiveSessionsQuery,
  useRevokeSessionMutation,
  useRevokeAllSessionsMutation,
  useListDevicesQuery,
  useRevokeDeviceMutation,
  useListMFAFactorsQuery,
  type UserSession,
  type Device,
} from "@saturn/api/saturn/identity/v1/identity"
import { parseUserAgent } from "@saturn/core"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MfaStepUpModal } from "@/components/ui/mfa-stepup-modal"
import { ChangePasswordModal } from "@/components/ui/change-password-modal"
import { useToast } from "@/components/ui/toast"
import { getStoredDeviceId } from "@/lib/storage"
import { haptics } from "@/lib/haptics"

export default function SecuritySessionsScreen() {
  const router = useRouter()
  const toast = useToast()
  const {
    logout,
    isDeviceEnrolled,
    isBiometricSupported,
    enrollBiometrics,
    unenrollBiometrics,
  } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [mfaModalVisible, setMfaModalVisible] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [changePasswordVisible, setChangePasswordVisible] = useState(false)

  // Load current device ID from storage
  useEffect(() => {
    async function loadCurrentDevice() {
      const id = await getStoredDeviceId()
      setCurrentDeviceId(id)
    }
    loadCurrentDevice()
  }, [isDeviceEnrolled])

  // 1. Query active user sessions
  const {
    data: sessionsData,
    isLoading,
    refetch,
  } = useListActiveSessionsQuery({})
  const sessions = sessionsData?.sessions || []

  // 2. Query trusted hardware devices
  const {
    data: devicesData,
    isLoading: isDevicesLoading,
    refetch: refetchDevices,
  } = useListDevicesQuery({})
  const devices = devicesData?.devices || []

  // 3. Query MFA factors to know if enrollment requires OTP upfront
  const { data: mfaData, refetch: refetchMfa } = useListMFAFactorsQuery({})
  const hasActiveMfa = Boolean(mfaData?.factors && mfaData.factors.length > 0)

  // 4. Mutations
  const revokeSessionMutation = useRevokeSessionMutation()
  const revokeAllSessionsMutation = useRevokeAllSessionsMutation()
  const revokeDeviceMutation = useRevokeDeviceMutation()

  const handleRefresh = async () => {
    haptics.light()
    setRefreshing(true)
    try {
      await Promise.all([refetch(), refetchDevices(), refetchMfa()])
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

  const handleEnrollPress = () => {
    if (hasActiveMfa) {
      setMfaError(null)
      setMfaModalVisible(true)
    } else {
      handleEnrollDevice()
    }
  }

  const handleEnrollDevice = async (code?: string) => {
    setEnrolling(true)
    setMfaError(null)
    try {
      await enrollBiometrics(undefined, code)
      haptics.success()
      toast.show({
        type: "success",
        title: "Device Enrolled",
        message: "Biometrics is now enabled on this device.",
      })
      setMfaModalVisible(false)
      const storedId = await getStoredDeviceId()
      setCurrentDeviceId(storedId)
      await Promise.all([refetchDevices(), refetchMfa()])
    } catch (err: any) {
      const msg = err?.message || "Failed to enroll device"
      if (
        msg.toLowerCase().includes("mfa") ||
        msg.toLowerCase().includes("totp") ||
        msg.toLowerCase().includes("verification")
      ) {
        setMfaModalVisible(true)
        if (code) {
          setMfaError("Invalid verification code. Please try again.")
        }
      } else {
        haptics.error()
        toast.show({
          type: "error",
          title: "Enrollment Failed",
          message: msg,
        })
      }
    } finally {
      setEnrolling(false)
    }
  }

  const promptRevokeDevice = (device: Device) => {
    if (!device.id) return
    const isThisDevice = device.id === currentDeviceId
    haptics.warning()

    Alert.alert(
      isThisDevice ? "Remove This Device?" : "Revoke Device?",
      isThisDevice
        ? `Are you sure you want to remove biometric authentication for this device ("${device.deviceName}")? You will need to re-enroll with your password.`
        : `Are you sure you want to revoke "${device.deviceName}"? This device will no longer be able to use biometric sign-in.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              if (isThisDevice) {
                await unenrollBiometrics()
                setCurrentDeviceId(null)
              }
              await revokeDeviceMutation.mutateAsync({
                device_id: device.id!,
                req: { deviceId: device.id! },
              })
              haptics.success()
              toast.show({
                type: "success",
                title: "Device Revoked",
                message: `${device.deviceName} has been revoked.`,
              })
              await refetchDevices()
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: "Revocation Failed",
                message: err?.message || "Could not revoke device.",
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
              <Text style={styles.infoTitle}>
                Authorized Logins & Hardware Devices
              </Text>
              <Text style={styles.infoSubtitle}>
                Manage hardware-backed biometric authenticators and active
                sign-in sessions for your Saturn account.
              </Text>
            </View>
          </View>
        </Card>

        {/* Section: Password & Credentials */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>PASSWORD & CREDENTIALS</Text>
        </View>

        <Card style={styles.actionCard}>
          <View style={styles.actionHeader}>
            <View style={styles.actionIconBox}>
              <KeyRound size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Password</Text>
              <Text style={styles.actionSubtitle}>
                Update your account password across all devices.
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setChangePasswordVisible(true)}
            style={styles.changePasswordBtn}
          >
            Change Password
          </Button>
        </Card>

        {/* Section: Trusted Hardware Devices */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            {devices.length > 0
              ? `TRUSTED HARDWARE DEVICES (${devices.length})`
              : "TRUSTED HARDWARE DEVICES"}
          </Text>
        </View>

        {/* Enrollment Card if current device is not enrolled */}
        {!isDeviceEnrolled && isBiometricSupported && (
          <Card style={styles.enrollCard}>
            <View style={styles.enrollHeader}>
              <View style={styles.enrollIconBox}>
                <Fingerprint size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.enrollTextContainer}>
                <Text style={styles.enrollTitle}>Enable Biometrics</Text>
                <Text style={styles.enrollSubtitle}>
                  Sign in securely with hardware-backed biometric verification
                  without entering your password.
                </Text>
              </View>
            </View>
            <Button
              variant="primary"
              size="md"
              loading={enrolling}
              onPress={handleEnrollPress}
              leftIcon={
                <Fingerprint size={16} color={theme.colors.primaryForeground} />
              }
              style={styles.enrollBtn}
            >
              Enroll This Device
            </Button>
          </Card>
        )}

        {/* Devices List */}
        {isDevicesLoading && devices.length === 0 ? (
          <Card style={styles.emptyCard}>
            <RefreshCw size={24} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Loading trusted devices...</Text>
          </Card>
        ) : devices.length === 0 && !isBiometricSupported ? (
          <Card style={styles.emptyCard}>
            <Shield size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No trusted devices registered.</Text>
            <Text style={styles.emptySubtext}>
              Biometric hardware authentication is not available on this device.
            </Text>
          </Card>
        ) : devices.length === 0 && isDeviceEnrolled ? (
          <Card style={styles.emptyCard}>
            <Shield size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No registered devices found.</Text>
            <Text style={styles.emptySubtext}>
              Enrolled credentials may have expired or been revoked.
            </Text>
          </Card>
        ) : devices.length > 0 ? (
          <View style={styles.sessionsList}>
            {devices.map((device) => {
              const isThisDevice = device.id === currentDeviceId
              return (
                <Card key={device.id} style={styles.sessionCard}>
                  <View style={styles.sessionHeaderRow}>
                    <View style={styles.sessionLeft}>
                      <View style={styles.deviceIconBox}>
                        <Fingerprint size={20} color={theme.colors.primary} />
                      </View>
                      <View style={styles.sessionNameContainer}>
                        <View style={styles.deviceNameRow}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {device.deviceName}
                          </Text>
                          {isThisDevice && (
                            <Badge
                              variant="success"
                              size="sm"
                              label="This Device"
                            />
                          )}
                        </View>
                        <Text style={styles.sessionUa} numberOfLines={1}>
                          Algorithm: {device.algorithm || "ES256"}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.revokeBtn}
                      activeOpacity={0.7}
                      onPress={() => promptRevokeDevice(device)}
                      disabled={revokeDeviceMutation.isPending}
                      accessibilityLabel={`Revoke ${device.deviceName}`}
                    >
                      <Trash2 size={16} color={theme.colors.destructive} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Clock size={13} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>
                        Enrolled: {formatTimestamp(device.createTime)}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Clock size={13} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>
                        Expires: {formatTimestamp(device.expireTime)}
                      </Text>
                    </View>
                  </View>
                </Card>
              )
            })}
          </View>
        ) : null}

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

      {/* MFA Step-up Modal */}
      <MfaStepUpModal
        visible={mfaModalVisible}
        onClose={() => {
          setMfaModalVisible(false)
          setMfaError(null)
        }}
        onConfirm={(code) => handleEnrollDevice(code)}
        loading={enrolling}
        error={mfaError}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        visible={changePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
        hasActiveMfa={hasActiveMfa}
      />
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
  emptySubtext: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  signOutAllBtn: {
    marginTop: 8,
  },
  enrollCard: {
    padding: 16,
    gap: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.primary,
    borderWidth: 1,
  },
  enrollHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  enrollIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  enrollTextContainer: {
    flex: 1,
    gap: 3,
  },
  enrollTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  enrollSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  enrollBtn: {
    marginTop: 2,
  },
  actionCard: {
    padding: 16,
    gap: 12,
  },
  actionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextContainer: {
    flex: 1,
    gap: 3,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  actionSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  changePasswordBtn: {
    alignSelf: "flex-start",
  },
})
