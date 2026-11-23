import { useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Image,
  Modal,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Path } from "react-native-svg"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"
import { useQueryClient } from "@tanstack/react-query"
import {
  Link2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle2,
  Trash2,
  Calendar,
  Mail,
  Contact,
  Lock,
  Check,
} from "lucide-react-native"
import {
  useConnectorProviders,
  useConnectedAccounts,
  useInitiateOAuth,
  useUpdateConnectedAccount,
  useDeleteConnectedAccount,
  useSyncConnectedAccount,
  useTimezone,
  useI18n,
  type ConnectedAccount,
} from "@saturn/hooks"
import {
  CONNECTOR_CAPABILITIES,
  type ConnectorCapability,
} from "@saturn/schemas"
import type { TranslationKey } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { SkeletonCard } from "@/components/ui/skeleton-loader"

WebBrowser.maybeCompleteAuthSession()

const ACCENT_COLORS: { key: TranslationKey; value: string }[] = [
  { key: "settings.connectors.colorBlue", value: "#3b82f6" },
  { key: "settings.connectors.colorPurple", value: "#8b5cf6" },
  { key: "settings.connectors.colorEmerald", value: "#10b981" },
  { key: "settings.connectors.colorAmber", value: "#f59e0b" },
  { key: "settings.connectors.colorRose", value: "#f43f5e" },
  { key: "settings.connectors.colorIndigo", value: "#6366f1" },
  { key: "settings.connectors.colorCyan", value: "#06b6d4" },
  { key: "settings.connectors.colorSlate", value: "#64748b" },
]

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </Svg>
  )
}

function MicrosoftIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#f25022" d="M1 1h10v10H1z" />
      <Path fill="#7fba00" d="M13 1h10v10H13z" />
      <Path fill="#00a4ef" d="M1 13h10v10H1z" />
      <Path fill="#ffb900" d="M13 13h10v10H13z" />
    </Svg>
  )
}

function ProviderIcon({
  provider,
  size = 13,
}: {
  provider?: string
  size?: number
}) {
  const p = provider?.toLowerCase()
  if (p === "microsoft") {
    return <MicrosoftIcon size={size} />
  }
  return <GoogleIcon size={size} />
}

const CAPABILITY_ICONS: Record<ConnectorCapability, typeof Calendar> = {
  calendar: Calendar,
  mail: Mail,
  contacts: Contact,
}

const CAPABILITY_LABEL_KEYS: Record<ConnectorCapability, TranslationKey> = {
  calendar: "settings.connectors.capCalendar",
  mail: "settings.connectors.capMail",
  contacts: "settings.connectors.capContacts",
}

const CAPABILITY_DESC_KEYS: Record<ConnectorCapability, TranslationKey> = {
  calendar: "settings.connectors.capDescCalendar",
  mail: "settings.connectors.capDescMail",
  contacts: "settings.connectors.capDescContacts",
}

export default function ConnectedAccountsScreen() {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { activeSpaceId, activeSpaceRole } = useSpace()
  const tz = useTimezone()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const isWritable = activeSpaceRole === "owner" || activeSpaceRole === "admin"

  const { data: providersData, isLoading: providersLoading } =
    useConnectorProviders()
  const { data: accountsData, isLoading: accountsLoading } =
    useConnectedAccounts(
      { spaceId: activeSpaceId || undefined },
      { enabled: Boolean(activeSpaceId) }
    )

  const initiateOAuthMutation = useInitiateOAuth()
  const updateAccountMutation = useUpdateConnectedAccount({
    spaceId: activeSpaceId || undefined,
  })
  const deleteAccountMutation = useDeleteConnectedAccount({
    spaceId: activeSpaceId || undefined,
  })
  const syncAccountMutation = useSyncConnectedAccount({
    spaceId: activeSpaceId || undefined,
  })

  const [connectingProvider, setConnectingProvider] = useState<string | null>(
    null
  )
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)
  const [updatingCapKey, setUpdatingCapKey] = useState<string | null>(null)
  const [accountToDisconnect, setAccountToDisconnect] =
    useState<ConnectedAccount | null>(null)
  const [colorPickerAccount, setColorPickerAccount] =
    useState<ConnectedAccount | null>(null)

  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )
  const providers = useMemo(
    () => providersData?.providers || [],
    [providersData?.providers]
  )
  const isGoogleAvailable = providers.some((p) => p.id === "google")

  const handleConnect = async (
    provider: string,
    existingAccountId?: string,
    requestedCapabilities?: string[]
  ) => {
    if (!isWritable) return
    await haptics.light()
    setConnectingProvider(provider)

    try {
      const redirectUrl = Linking.createURL("oauth-callback")
      const res = await initiateOAuthMutation.mutateAsync({
        provider,
        returnUrl: redirectUrl,
        capabilities: requestedCapabilities || ["calendar", "mail", "contacts"],
        connectedAccountId: existingAccountId,
      })

      if (res.authUrl) {
        const result = await WebBrowser.openAuthSessionAsync(
          res.authUrl,
          redirectUrl
        )

        if (result.type === "success") {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["connector"] }),
            queryClient.invalidateQueries({ queryKey: ["calendar"] }),
            queryClient.invalidateQueries({ queryKey: ["mail"] }),
          ])
          await haptics.success()
          toast.show({
            type: "success",
            title: t("settings.connectors.connectedToast"),
            message: t("settings.connectors.connectedToastDesc"),
          })
        } else {
          await haptics.light()
        }
      }
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: t("settings.connectors.connectionFailedToast"),
        message:
          err instanceof Error
            ? t("settings.connectors.connectionFailedToastDesc", {
                error: err.message,
              })
            : t("settings.connectors.connectInitFailedToastDefault"),
      })
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleToggleCapability = async (
    account: ConnectedAccount,
    cap: ConnectorCapability
  ) => {
    if (!isWritable || !account.id) return
    await haptics.selection()

    const currentCaps = account.enabledCapabilities || []
    const isEnabling = !currentCaps.includes(cap)
    const newCaps = isEnabling
      ? [...currentCaps, cap]
      : currentCaps.filter((c) => c !== cap)

    const opKey = `${account.id}-${cap}`
    setUpdatingCapKey(opKey)

    try {
      await updateAccountMutation.mutateAsync({
        id: account.id,
        spaceId: activeSpaceId || undefined,
        req: {
          id: account.id,
          account: {
            ...account,
            enabledCapabilities: newCaps,
          },
          updateMask: {
            paths: ["enabled_capabilities"],
          },
        },
      })
      await haptics.success()
      toast.show({
        type: "success",
        title: t("settings.connectors.capabilitiesUpdatedToast"),
        message: t(
          isEnabling
            ? "settings.connectors.capabilitiesEnabledToast"
            : "settings.connectors.capabilitiesDisabledToast",
          { capability: t(CAPABILITY_LABEL_KEYS[cap]) }
        ),
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : ""
      const isScopeUpgradeRequired =
        errMsg.toLowerCase().includes("scope") ||
        errMsg.toLowerCase().includes("incremental oauth") ||
        errMsg.includes("MISSING_OAUTH_SCOPES")

      if (isScopeUpgradeRequired && isEnabling) {
        await haptics.warning()
        toast.show({
          type: "info",
          title: t("settings.connectors.authRequiredToast"),
          message: t("settings.connectors.authRequiredToastDesc"),
        })
        await handleConnect(account.provider || "google", account.id, newCaps)
      } else {
        await haptics.warning()
        toast.show({
          type: "error",
          title: t("settings.connectors.capabilitiesFailedToast"),
          message:
            errMsg || t("settings.connectors.capabilitiesFailedToastDefault"),
        })
      }
    } finally {
      setUpdatingCapKey(null)
    }
  }

  const handleColorChange = async (
    account: ConnectedAccount,
    color: string
  ) => {
    if (!isWritable || !account.id) return
    await haptics.selection()

    try {
      await updateAccountMutation.mutateAsync({
        id: account.id,
        spaceId: activeSpaceId || undefined,
        req: {
          id: account.id,
          account: {
            ...account,
            color,
          },
          updateMask: {
            paths: ["color"],
          },
        },
      })
      await haptics.success()
      toast.show({
        type: "success",
        title: t("settings.connectors.colorUpdatedToast"),
        message: t("settings.connectors.colorUpdatedToastDesc"),
      })
      setColorPickerAccount(null)
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: t("settings.connectors.colorFailedToastDefault"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.connectors.colorFailedToast"),
      })
    }
  }

  const handleSyncNow = async (account: ConnectedAccount) => {
    if (!account.id) return
    await haptics.light()
    setSyncingAccountId(account.id)

    try {
      await syncAccountMutation.mutateAsync({
        id: account.id,
        spaceId: activeSpaceId || undefined,
      })
      await haptics.success()
      toast.show({
        type: "success",
        title: t("settings.connectors.syncOkToast"),
        message: t("settings.connectors.syncOkToastDesc"),
      })
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: t("settings.connectors.syncFailedToast"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.connectors.syncFailedToastDefault"),
      })
    } finally {
      setSyncingAccountId(null)
    }
  }

  const handleConfirmDisconnect = async () => {
    if (!accountToDisconnect?.id) return
    await haptics.heavy()

    try {
      await deleteAccountMutation.mutateAsync({
        id: accountToDisconnect.id,
        spaceId: activeSpaceId || undefined,
      })
      await haptics.success()
      toast.show({
        type: "success",
        title: t("settings.connectors.disconnectedToast"),
        message: t("settings.connectors.disconnectedToastDesc"),
      })
      setAccountToDisconnect(null)
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: t("settings.connectors.disconnectFailedToast"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.connectors.disconnectFailedToastDefault"),
      })
    }
  }

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Read-only banner for viewers and members */}
        {!isWritable && (
          <View style={styles.readOnlyBanner}>
            <Lock size={16} color={colors.warning} />
            <Text style={styles.readOnlyText}>
              {t("settings.connectors.readOnlyBanner")}
            </Text>
          </View>
        )}

        {/* Section 1: Provider Catalog */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderBlock}>
            <Text style={styles.sectionTitle}>
              {t("settings.connectors.connectNewTitle")}
            </Text>
            <Text style={styles.sectionDescription}>
              {t("settings.connectors.connectNewDesc")}
            </Text>
          </View>

          {/* Google Card */}
          <Card style={styles.catalogCard}>
            <View style={styles.catalogHeader}>
              <View style={styles.brandIconContainer}>
                <GoogleIcon size={24} />
              </View>
              <View style={styles.catalogInfo}>
                <Text style={styles.catalogTitle}>
                  {t("settings.connectors.google")}
                </Text>
                <Text style={styles.catalogSubtitle}>
                  {t("settings.connectors.descGoogle")}
                </Text>
              </View>
            </View>

            <View style={styles.pillsRow}>
              <Badge
                variant="outline"
                size="sm"
                icon={<Calendar size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capCalendar")}
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Mail size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capMail")}
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Contact size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capContacts")}
              />
            </View>

            {isWritable ? (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                leftIcon={
                  connectingProvider === "google" ? undefined : (
                    <GoogleIcon size={16} />
                  )
                }
                loading={connectingProvider === "google"}
                disabled={
                  providersLoading ||
                  !isGoogleAvailable ||
                  connectingProvider !== null
                }
                onPress={() => handleConnect("google")}
              >
                {connectingProvider === "google"
                  ? t("settings.connectors.connectingBtn")
                  : t("settings.connectors.connectGoogle")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                leftIcon={<Lock size={14} color={colors.textMuted} />}
                disabled
              >
                {t("settings.connectors.adminOnly")}
              </Button>
            )}
          </Card>

          {/* Microsoft Card (Coming Soon) */}
          <Card style={[styles.catalogCard, styles.catalogCardDisabled]}>
            <View style={styles.catalogHeader}>
              <View style={styles.brandIconContainer}>
                <MicrosoftIcon size={24} />
              </View>
              <View style={styles.catalogInfo}>
                <View style={styles.titleWithBadge}>
                  <Text style={styles.catalogTitle}>
                    {t("settings.connectors.microsoft")}
                  </Text>
                  <Badge
                    variant="default"
                    size="sm"
                    label={t("settings.connectors.comingSoon")}
                  />
                </View>
                <Text style={styles.catalogSubtitle}>
                  {t("settings.connectors.descMicrosoft")}
                </Text>
              </View>
            </View>

            <View style={styles.pillsRow}>
              <Badge
                variant="outline"
                size="sm"
                icon={<Calendar size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capCalendar")}
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Mail size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capMail")}
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Contact size={11} color={colors.textMuted} />}
                label={t("settings.connectors.capContacts")}
              />
            </View>

            <Button variant="outline" size="sm" fullWidth disabled>
              {t("settings.connectors.comingSoon")}
            </Button>
          </Card>
        </View>

        {/* Section 2: Connected Accounts List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderBlock}>
            <Text style={styles.sectionTitle}>
              {t("settings.connectors.connectedAccountsTitle")}
            </Text>
            <Text style={styles.sectionDescription}>
              {t("settings.connectors.connectedAccountsDesc")}
            </Text>
          </View>

          {accountsLoading ? (
            <View style={styles.skeletonContainer}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : accounts.length === 0 ? (
            <Card style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Link2 size={24} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {t("settings.connectors.emptyTitle")}
              </Text>
              <Text style={styles.emptySubtitle}>
                {t("settings.connectors.emptyDesc")}
              </Text>
            </Card>
          ) : (
            accounts.map((account) => {
              const status = (account.status || "healthy").toLowerCase()
              const isReauthRequired = status === "reauth_required"
              const isRateLimited = status === "rate_limited"
              const isError = status === "error" || status === "revoked"
              const isHealthy = status === "healthy"
              const accountAccentColor = account.color || colors.primary
              const isSyncingThis = syncingAccountId === account.id

              return (
                <Card key={account.id} style={styles.accountCard}>
                  {/* Left accent color indicator */}
                  <View
                    style={[
                      styles.accentBar,
                      { backgroundColor: accountAccentColor },
                    ]}
                  />

                  <View style={styles.cardInner}>
                    {/* Account Header */}
                    <View style={styles.accountHeader}>
                      <View style={styles.accountIdentity}>
                        <View style={styles.avatarWrapper}>
                          {account.avatarUrl ? (
                            <Image
                              source={{ uri: account.avatarUrl }}
                              style={styles.avatarImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.avatarCircle,
                                { backgroundColor: accountAccentColor },
                              ]}
                            >
                              <Text style={styles.avatarLetter}>
                                {(account.displayName || account.email || "A")
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.avatarProviderBadge}>
                            <ProviderIcon
                              provider={account.provider}
                              size={10}
                            />
                          </View>
                        </View>

                        <View style={styles.accountMeta}>
                          <View style={styles.accountNameRow}>
                            <Text style={styles.accountName} numberOfLines={1}>
                              {account.displayName || account.email}
                            </Text>
                            {isWritable && (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                  haptics.selection()
                                  setColorPickerAccount(account)
                                }}
                                style={[
                                  styles.colorPickerDot,
                                  { backgroundColor: accountAccentColor },
                                ]}
                                hitSlop={{
                                  top: 8,
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                }}
                              />
                            )}
                          </View>
                          <View style={styles.metaSubtitleRow}>
                            <Text style={styles.accountEmail} numberOfLines={1}>
                              {account.email}
                            </Text>
                            <Text style={styles.bulletSeparator}>•</Text>
                            <View style={styles.providerTagRow}>
                              <ProviderIcon
                                provider={account.provider}
                                size={12}
                              />
                              <Text style={styles.providerName}>
                                {account.provider}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Status Badges & Last Synced */}
                      <View style={styles.badgeContainer}>
                        {isHealthy && (
                          <Badge
                            variant="success"
                            size="sm"
                            icon={
                              <CheckCircle2 size={12} color={colors.success} />
                            }
                            label={t("settings.connectors.statusActive")}
                          />
                        )}
                        {isReauthRequired && (
                          <Badge
                            variant="warning"
                            size="sm"
                            icon={
                              <AlertTriangle size={12} color={colors.warning} />
                            }
                            label={t("settings.connectors.reconnectRequired")}
                          />
                        )}
                        {isRateLimited && (
                          <Badge
                            variant="warning"
                            size="sm"
                            icon={<Clock size={12} color={colors.warning} />}
                            label={t("settings.connectors.rateLimited")}
                          />
                        )}
                        {isError && (
                          <Badge
                            variant="destructive"
                            size="sm"
                            icon={
                              <AlertCircle
                                size={12}
                                color={colors.destructive}
                              />
                            }
                            label={t("settings.connectors.error")}
                          />
                        )}
                        <Text style={styles.lastSyncedText}>
                          {account.lastSyncTime
                            ? t("settings.connectors.syncedLabel", {
                                relative: tz.formatRelative(
                                  account.lastSyncTime
                                ),
                              })
                            : t("settings.connectors.neverSynced")}
                        </Text>
                      </View>
                    </View>

                    {/* Reconnect Banner */}
                    {isReauthRequired && (
                      <View style={styles.reconnectBanner}>
                        <View style={styles.reconnectLeft}>
                          <AlertTriangle size={16} color={colors.warning} />
                          <Text style={styles.reconnectText}>
                            {t("settings.connectors.reconnectBanner")}
                          </Text>
                        </View>
                        {isWritable && (
                          <TouchableOpacity
                            style={styles.reconnectButton}
                            activeOpacity={0.7}
                            onPress={() =>
                              handleConnect(
                                account.provider || "google",
                                account.id,
                                account.enabledCapabilities
                              )
                            }
                          >
                            <Text style={styles.reconnectButtonText}>
                              {t("settings.connectors.reconnect")}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Capability Switches */}
                    <View style={styles.capabilityGroup}>
                      <Text style={styles.capabilityHeader}>
                        {t(
                          "settings.connectors.capabilitiesSection"
                        ).toUpperCase()}
                      </Text>
                      <View style={styles.capabilityList}>
                        {CONNECTOR_CAPABILITIES.map((cap) => {
                          const Icon = CAPABILITY_ICONS[cap]
                          const isEnabled =
                            account.enabledCapabilities?.includes(cap) ?? false
                          const isUpdating =
                            updatingCapKey === `${account.id}-${cap}`

                          return (
                            <View key={cap} style={styles.capabilityRow}>
                              <View style={styles.capLeft}>
                                <View style={styles.capIconCircle}>
                                  <Icon size={14} color={colors.textMuted} />
                                </View>
                                <View style={styles.capTextContainer}>
                                  <Text style={styles.capTitle}>
                                    {t(CAPABILITY_LABEL_KEYS[cap])}
                                  </Text>
                                  <Text style={styles.capDesc}>
                                    {t(CAPABILITY_DESC_KEYS[cap])}
                                  </Text>
                                </View>
                              </View>
                              {isUpdating ? (
                                <ActivityIndicator
                                  size="small"
                                  color={colors.primary}
                                />
                              ) : (
                                <Switch
                                  value={isEnabled}
                                  disabled={!isWritable}
                                  onValueChange={() =>
                                    handleToggleCapability(account, cap)
                                  }
                                  trackColor={{
                                    false: colors.surfaceHighlight,
                                    true: colors.primary,
                                  }}
                                  thumbColor="#ffffff"
                                />
                              )}
                            </View>
                          )
                        })}
                      </View>
                    </View>

                    {/* Action Buttons Row */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.7}
                        disabled={isSyncingThis || !isWritable}
                        onPress={() => handleSyncNow(account)}
                      >
                        <RefreshCw
                          size={14}
                          color={
                            isSyncingThis
                              ? colors.primary
                              : colors.textSecondary
                          }
                        />
                        <Text style={styles.actionButtonText}>
                          {isSyncingThis
                            ? t("settings.connectors.syncingBtn")
                            : t("settings.connectors.syncBtn")}
                        </Text>
                      </TouchableOpacity>

                      {isWritable && (
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            styles.destructiveAction,
                          ]}
                          activeOpacity={0.7}
                          onPress={() => {
                            haptics.light()
                            setAccountToDisconnect(account)
                          }}
                        >
                          <Trash2 size={14} color={colors.destructive} />
                          <Text style={styles.destructiveActionText}>
                            {t("settings.connectors.disconnectBtn")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </Card>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        visible={Boolean(accountToDisconnect)}
        isDestructive
        title={t("settings.connectors.disconnectConfirmTitle")}
        message={`${t("settings.connectors.disconnectConfirmQ1")} ${
          accountToDisconnect?.displayName || accountToDisconnect?.email || ""
        }${t("settings.connectors.disconnectConfirmQ2")}`}
        confirmText={t("settings.connectors.disconnect")}
        cancelText={t("common.cancel")}
        onConfirm={handleConfirmDisconnect}
        onCancel={() => {
          haptics.light()
          setAccountToDisconnect(null)
        }}
      />

      {/* Accent Color Palette Modal */}
      <Modal
        visible={Boolean(colorPickerAccount)}
        transparent
        animationType="fade"
        onRequestClose={() => setColorPickerAccount(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setColorPickerAccount(null)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t("settings.connectors.accentColorTitle")}
            </Text>
            <Text style={styles.modalSubtitle}>
              {t("settings.connectors.accentColorSelect", {
                name:
                  colorPickerAccount?.displayName ||
                  colorPickerAccount?.email ||
                  "",
              })}
            </Text>

            <View style={styles.colorsGrid}>
              {ACCENT_COLORS.map((c) => {
                const isSelected = colorPickerAccount?.color === c.value
                return (
                  <TouchableOpacity
                    key={c.value}
                    activeOpacity={0.75}
                    onPress={() =>
                      colorPickerAccount &&
                      handleColorChange(colorPickerAccount, c.value)
                    }
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c.value },
                      isSelected && styles.colorSwatchActive,
                    ]}
                  >
                    {isSelected && <Check size={16} color="#ffffff" />}
                  </TouchableOpacity>
                )
              })}
            </View>

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onPress={() => setColorPickerAccount(null)}
            >
              {t("common.cancel")}
            </Button>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20,
  },
  readOnlyBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: t.colors.warningSubtle,
    borderRadius: t.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  readOnlyText: {
    flex: 1,
    fontSize: 12,
    color: t.colors.warning,
    lineHeight: 16,
  },
  section: {
    gap: 12,
  },
  sectionHeaderBlock: {
    gap: 2,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionDescription: {
    fontSize: 13,
    color: t.colors.textMuted,
    lineHeight: 18,
  },
  catalogCard: {
    padding: 16,
    gap: 14,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  catalogCardDisabled: {
    opacity: 0.8,
  },
  catalogHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  brandIconContainer: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  catalogInfo: {
    flex: 1,
    gap: 2,
  },
  catalogTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  catalogSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  titleWithBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  pillsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  skeletonContainer: {
    gap: 12,
  },
  emptyCard: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 32,
    gap: 8,
    borderRadius: t.radius.lg,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    maxWidth: 280,
    lineHeight: 18,
  },
  accountCard: {
    position: "relative" as const,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    overflow: "hidden" as const,
  },
  accentBar: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 1,
  },
  cardInner: {
    padding: 16,
    paddingLeft: 20,
    gap: 14,
  },
  accountHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "space-between" as const,
    gap: 10,
  },
  accountIdentity: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  avatarWrapper: {
    position: "relative" as const,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#ffffff",
  },
  avatarProviderBadge: {
    position: "absolute" as const,
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  accountMeta: {
    flex: 1,
    gap: 2,
  },
  accountNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  colorPickerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  metaSubtitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    flexWrap: "wrap" as const,
  },
  accountEmail: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  bulletSeparator: {
    fontSize: 10,
    color: t.colors.textMuted,
  },
  providerTagRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  providerName: {
    fontSize: 12,
    color: t.colors.textSecondary,
    textTransform: "capitalize" as const,
    fontWeight: "500" as const,
  },
  badgeContainer: {
    alignItems: "flex-end" as const,
    gap: 4,
    flexShrink: 0,
  },
  lastSyncedText: {
    fontSize: 10,
    color: t.colors.textMuted,
  },
  reconnectBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.warningSubtle,
    borderRadius: t.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    gap: 10,
  },
  reconnectLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  reconnectText: {
    flex: 1,
    fontSize: 12,
    color: t.colors.warning,
    lineHeight: 16,
  },
  reconnectButton: {
    backgroundColor: t.colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.sm,
  },
  reconnectButtonText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#000000",
  },
  capabilityGroup: {
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 12,
    gap: 10,
  },
  capabilityHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
  },
  capabilityList: {
    gap: 8,
  },
  capabilityRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 10,
  },
  capLeft: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginRight: 8,
  },
  capIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  capTextContainer: {
    flex: 1,
  },
  capTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  capDesc: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: t.radius.sm,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  destructiveAction: {
    backgroundColor: t.colors.destructiveSubtle,
  },
  destructiveActionText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  modalCard: {
    width: "100%" as const,
    maxWidth: 320,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    padding: 20,
    gap: 12,
    alignItems: "center" as const,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 16,
  },
  colorsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
    gap: 12,
    paddingVertical: 12,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: {
    borderColor: t.colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
})
