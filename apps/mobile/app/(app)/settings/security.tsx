import { useState, useEffect } from "react"
import {
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
import { useTimezone, useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { t } = useI18n()
  const tz = useTimezone()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
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
      t("settings.sessions.mobile.revokeDevice", { device: parsed.device }),
      t("settings.sessions.mobile.revokeDeviceDesc", { device: parsed.device }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.sessions.revoke"),
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
                title: t("settings.sessions.mobile.sessionRevokedTitle"),
                message: t("settings.sessions.mobile.sessionRevokedDesc", {
                  device: parsed.device,
                }),
              })
              await refetch()
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: t("settings.sessions.revokeFailedToast"),
                message:
                  err?.message || t("settings.sessions.revokeFailedDefault"),
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
      t("settings.sessions.mobile.revokeAllTitle"),
      t("settings.sessions.mobile.revokeAllDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.sessions.mobile.revokeAllConfirm"),
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
                title: t("settings.sessions.revokeAllFailedToast"),
                message:
                  err?.message || t("settings.sessions.revokeAllFailedDefault"),
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
        title: t("settings.devices.mobile.enrolledToastTitle"),
        message: t("settings.devices.mobile.enrolledToastDesc"),
      })
      setMfaModalVisible(false)
      const storedId = await getStoredDeviceId()
      setCurrentDeviceId(storedId)
      await Promise.all([refetchDevices(), refetchMfa()])
    } catch (err: any) {
      const msg =
        err?.message || t("settings.devices.mobile.enrollFailedDefault")
      if (
        msg.toLowerCase().includes("mfa") ||
        msg.toLowerCase().includes("totp") ||
        msg.toLowerCase().includes("verification")
      ) {
        setMfaModalVisible(true)
        if (code) {
          setMfaError(t("settings.devices.mobile.invalidCode"))
        }
      } else {
        haptics.error()
        toast.show({
          type: "error",
          title: t("settings.devices.mobile.enrollFailedToast"),
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
      isThisDevice
        ? t("settings.devices.mobile.removeThisDevice")
        : t("settings.devices.revokeDevice"),
      isThisDevice
        ? t("settings.devices.mobile.removeThisDeviceDesc", {
            name: device.deviceName,
          })
        : t("settings.devices.revokeConfirmDesc", { name: device.deviceName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.devices.revoke"),
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
                title: t("settings.devices.mobile.revokedTitle"),
                message: t("settings.devices.mobile.revokedDesc", {
                  name: device.deviceName,
                }),
              })
              await refetchDevices()
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: t("settings.sessions.revokeFailedToast"),
                message:
                  err?.message || t("settings.devices.revokeFailedDefault"),
              })
            }
          },
        },
      ]
    )
  }

  const formatTimestamp = (ts?: string) => {
    if (!ts) return t("settings.sessions.mobile.unknown")
    return (
      tz.format(ts, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) || t("settings.sessions.mobile.unknown")
    )
  }

  const getDeviceIcon = (parsed: ReturnType<typeof parseUserAgent>) => {
    if (parsed.isMobile) {
      return <Smartphone size={20} color={colors.primary} />
    }
    if (parsed.os === "macOS" || parsed.os === "Windows") {
      return <Laptop size={20} color={colors.accent} />
    }
    return <Monitor size={20} color={colors.textSecondary} />
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
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      >
        {/* Info Banner */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.infoIconBox}>
              <ShieldCheck size={20} color={colors.success} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>
                {t("settings.sessions.mobile.infoTitle")}
              </Text>
              <Text style={styles.infoSubtitle}>
                {t("settings.sessions.mobile.infoDesc")}
              </Text>
            </View>
          </View>
        </Card>

        {/* Section: Password & Credentials */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            {t("settings.sessions.mobile.passwordSection").toUpperCase()}
          </Text>
        </View>

        <Card style={styles.actionCard}>
          <View style={styles.actionHeader}>
            <View style={styles.actionIconBox}>
              <KeyRound size={20} color={colors.primary} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>
                {t("settings.password.title")}
              </Text>
              <Text style={styles.actionSubtitle}>
                {t("settings.password.desc")}
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setChangePasswordVisible(true)}
            style={styles.changePasswordBtn}
          >
            {t("settings.password.btnChange")}
          </Button>
        </Card>

        <Card style={styles.actionCard}>
          <View style={styles.actionHeader}>
            <View style={styles.actionIconBox}>
              <KeyRound size={20} color={colors.primary} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>
                {t("settings.apiKeys.title")}
              </Text>
              <Text style={styles.actionSubtitle}>
                {t("settings.sessions.mobile.apiKeyCardDesc")}
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              haptics.light()
              router.push("/(app)/settings/api-keys")
            }}
            style={styles.changePasswordBtn}
          >
            {t("settings.sessions.mobile.manageApiKeys")}
          </Button>
        </Card>

        {/* Section: Trusted Hardware Devices */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            {devices.length > 0
              ? t("settings.devices.mobile.trustedDevicesCount", {
                  count: devices.length,
                }).toUpperCase()
              : t(
                  "settings.devices.mobile.trustedDevicesSection"
                ).toUpperCase()}
          </Text>
        </View>

        {/* Enrollment Card if current device is not enrolled */}
        {!isDeviceEnrolled && isBiometricSupported && (
          <Card style={styles.enrollCard}>
            <View style={styles.enrollHeader}>
              <View style={styles.enrollIconBox}>
                <Fingerprint size={22} color={colors.primary} />
              </View>
              <View style={styles.enrollTextContainer}>
                <Text style={styles.enrollTitle}>
                  {t("settings.devices.mobile.enableBiometrics")}
                </Text>
                <Text style={styles.enrollSubtitle}>
                  {t("settings.devices.mobile.enrollDesc")}
                </Text>
              </View>
            </View>
            <Button
              variant="primary"
              size="md"
              loading={enrolling}
              onPress={handleEnrollPress}
              leftIcon={
                <Fingerprint size={16} color={colors.primaryForeground} />
              }
              style={styles.enrollBtn}
            >
              {t("settings.devices.mobile.enrollThisDevice")}
            </Button>
          </Card>
        )}

        {/* Devices List */}
        {isDevicesLoading && devices.length === 0 ? (
          <Card style={styles.emptyCard}>
            <RefreshCw size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {t("settings.devices.loading")}
            </Text>
          </Card>
        ) : devices.length === 0 && !isBiometricSupported ? (
          <Card style={styles.emptyCard}>
            <Shield size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {t("settings.devices.emptyTitle")}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("settings.devices.mobile.noHardware")}
            </Text>
          </Card>
        ) : devices.length === 0 && isDeviceEnrolled ? (
          <Card style={styles.emptyCard}>
            <Shield size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {t("settings.devices.mobile.noDevicesFound")}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("settings.devices.mobile.noDevicesFoundDesc")}
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
                        <Fingerprint size={20} color={colors.primary} />
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
                              label={t("settings.devices.mobile.enrolledBadge")}
                            />
                          )}
                        </View>
                        <Text style={styles.sessionUa} numberOfLines={1}>
                          {t("settings.devices.mobile.algorithmLabel", {
                            algorithm: device.algorithm || "ES256",
                          })}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.revokeBtn}
                      activeOpacity={0.7}
                      onPress={() => promptRevokeDevice(device)}
                      disabled={revokeDeviceMutation.isPending}
                      accessibilityLabel={t("settings.devices.revokeDevice", {
                        name: device.deviceName,
                      })}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Clock size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t("settings.devices.enrolledOn", {
                          date: formatTimestamp(device.createTime),
                        })}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Clock size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t("settings.devices.expiresOn", {
                          date: formatTimestamp(device.expireTime),
                        })}
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
            {t("settings.sessions.mobile.activeSessionsCount", {
              count: sessions.length,
            }).toUpperCase()}
          </Text>
          {sessions.length > 1 && (
            <TouchableOpacity
              onPress={promptRevokeAllSessions}
              activeOpacity={0.7}
              disabled={revokeAllSessionsMutation.isPending}
            >
              <Text style={styles.revokeAllText}>
                {t("settings.sessions.mobile.revokeAllAction")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sessions List */}
        {isLoading && sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <RefreshCw size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {t("settings.sessions.mobile.loadingSessions")}
            </Text>
          </Card>
        ) : sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Globe size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {t("settings.sessions.mobile.noSessions")}
            </Text>
          </Card>
        ) : (
          <View style={styles.sessionsList}>
            {sessions.map((session, idx) => {
              const parsed = parseUserAgent(session.userAgent || "")
              const isCurrent = Boolean(session.isCurrent ?? idx === 0)

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
                          {isCurrent && (
                            <Badge
                              variant="success"
                              size="sm"
                              label={t("settings.sessions.currentDevice")}
                            />
                          )}
                        </View>
                        <Text style={styles.sessionUa} numberOfLines={1}>
                          {session.userAgent ||
                            t("settings.sessions.mobile.genericClient")}
                        </Text>
                      </View>
                    </View>

                    {/* Revoke single session button */}
                    {!isCurrent && (
                      <TouchableOpacity
                        style={styles.revokeBtn}
                        activeOpacity={0.7}
                        onPress={() => promptRevokeSession(session)}
                        disabled={revokeSessionMutation.isPending}
                      >
                        <Trash2 size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.divider} />

                  {/* Metadata Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <MapPin size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {session.ipAddress || t("settings.sessions.unknownIp")}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Clock size={13} color={colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t("settings.sessions.mobile.activeLabel", {
                          date: formatTimestamp(session.lastUsedAt),
                        })}
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
            leftIcon={<LogOut size={18} color={colors.destructive} />}
            onPress={promptRevokeAllSessions}
            disabled={revokeAllSessionsMutation.isPending}
            style={styles.signOutAllBtn}
          >
            {t("settings.sessions.mobile.signOutOfAllDevices")}
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

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
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
    backgroundColor: t.colors.successSubtle,
    borderColor: "rgba(16, 185, 129, 0.25)",
    borderWidth: 1,
  },
  infoHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: t.colors.successSubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  infoTextContainer: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  infoSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.8,
  },
  revokeAllText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  sessionsList: {
    gap: 12,
  },
  sessionCard: {
    padding: 14,
    gap: 12,
  },
  sessionHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  sessionLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  deviceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sessionNameContainer: {
    flex: 1,
    gap: 2,
  },
  deviceNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flexWrap: "wrap" as const,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  sessionUa: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  revokeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: t.colors.destructiveSubtle,
  },
  divider: {
    height: 1,
    backgroundColor: t.colors.border,
  },
  metaRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  metaItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  emptySubtext: {
    fontSize: 12,
    color: t.colors.textMuted,
    textAlign: "center" as const,
  },
  signOutAllBtn: {
    marginTop: 8,
  },
  enrollCard: {
    padding: 16,
    gap: 14,
    backgroundColor: t.colors.surfaceElevated,
    borderColor: t.colors.primary,
    borderWidth: 1,
  },
  enrollHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  enrollIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  enrollTextContainer: {
    flex: 1,
    gap: 3,
  },
  enrollTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  enrollSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
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
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  actionTextContainer: {
    flex: 1,
    gap: 3,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  actionSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 16,
  },
  changePasswordBtn: {
    alignSelf: "flex-start" as const,
  },
})
