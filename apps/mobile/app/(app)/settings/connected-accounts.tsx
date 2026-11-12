import { useState, useMemo } from "react"
import {
  StyleSheet,
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
  type ConnectedAccount,
} from "@saturn/hooks"
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_CAPABILITY_LABELS,
  CONNECTOR_CAPABILITY_DESCRIPTIONS,
  type ConnectorCapability,
} from "@saturn/schemas"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { SkeletonCard } from "@/components/ui/skeleton-loader"

WebBrowser.maybeCompleteAuthSession()

const ACCENT_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Slate", value: "#64748b" },
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

export default function ConnectedAccountsScreen() {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { activeSpaceId, activeSpaceRole } = useSpace()
  const tz = useTimezone()

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
          await queryClient.invalidateQueries({
            queryKey: ["connector", activeSpaceId || undefined],
          })
          await haptics.success()
          toast.show({
            type: "success",
            title: "Account Connected",
            message: "External account connected and authorized successfully.",
          })
        } else {
          await haptics.light()
        }
      }
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: "Connection Failed",
        message:
          err instanceof Error
            ? err.message
            : "Failed to initiate OAuth authorization session",
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
        title: "Capabilities Updated",
        message: `${CONNECTOR_CAPABILITY_LABELS[cap]} ${isEnabling ? "enabled" : "disabled"}.`,
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
          title: "Authorization Required",
          message: "Additional permission required. Opening browser...",
        })
        await handleConnect(account.provider || "google", account.id, newCaps)
      } else {
        await haptics.warning()
        toast.show({
          type: "error",
          title: "Update Failed",
          message: errMsg || "Could not update capability switch",
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
        title: "Color Updated",
        message: "Accent color tag updated successfully.",
      })
      setColorPickerAccount(null)
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: "Update Failed",
        message: err instanceof Error ? err.message : "Failed to update color",
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
        title: "Sync Triggered",
        message: "Account synchronization in progress.",
      })
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: "Sync Failed",
        message: err instanceof Error ? err.message : "Sync request failed",
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
        title: "Account Disconnected",
        message:
          "The connected account and its mirrors have been removed from this Space.",
      })
      setAccountToDisconnect(null)
    } catch (err) {
      await haptics.warning()
      toast.show({
        type: "error",
        title: "Disconnect Failed",
        message:
          err instanceof Error ? err.message : "Failed to disconnect account",
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
            <Lock size={16} color={theme.colors.warning} />
            <Text style={styles.readOnlyText}>
              Viewing in read-only mode. Workspace Admin or Owner privileges are
              required to manage connected accounts.
            </Text>
          </View>
        )}

        {/* Section 1: Provider Catalog */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderBlock}>
            <Text style={styles.sectionTitle}>Connect New Account</Text>
            <Text style={styles.sectionDescription}>
              Synchronize external calendars, emails, and address books into
              this workspace.
            </Text>
          </View>

          {/* Google Card */}
          <Card style={styles.catalogCard}>
            <View style={styles.catalogHeader}>
              <View style={styles.brandIconContainer}>
                <GoogleIcon size={24} />
              </View>
              <View style={styles.catalogInfo}>
                <Text style={styles.catalogTitle}>Google</Text>
                <Text style={styles.catalogSubtitle}>
                  Google Workspace & Personal Gmail
                </Text>
              </View>
            </View>

            <View style={styles.pillsRow}>
              <Badge
                variant="outline"
                size="sm"
                icon={<Calendar size={11} color={theme.colors.textMuted} />}
                label="Calendars"
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Mail size={11} color={theme.colors.textMuted} />}
                label="Mail"
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Contact size={11} color={theme.colors.textMuted} />}
                label="Contacts"
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
                  ? "Connecting..."
                  : "Connect Google"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                leftIcon={<Lock size={14} color={theme.colors.textMuted} />}
                disabled
              >
                Admin Only
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
                  <Text style={styles.catalogTitle}>Microsoft</Text>
                  <Badge variant="default" size="sm" label="Coming Soon" />
                </View>
                <Text style={styles.catalogSubtitle}>
                  Microsoft 365 & Outlook.com
                </Text>
              </View>
            </View>

            <View style={styles.pillsRow}>
              <Badge
                variant="outline"
                size="sm"
                icon={<Calendar size={11} color={theme.colors.textMuted} />}
                label="Calendars"
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Mail size={11} color={theme.colors.textMuted} />}
                label="Mail"
              />
              <Badge
                variant="outline"
                size="sm"
                icon={<Contact size={11} color={theme.colors.textMuted} />}
                label="Contacts"
              />
            </View>

            <Button variant="outline" size="sm" fullWidth disabled>
              Coming Soon
            </Button>
          </Card>
        </View>

        {/* Section 2: Connected Accounts List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderBlock}>
            <Text style={styles.sectionTitle}>Connected Accounts</Text>
            <Text style={styles.sectionDescription}>
              Manage your synchronized provider accounts, active capabilities,
              and accent tags.
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
                <Link2 size={24} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Connected Accounts</Text>
              <Text style={styles.emptySubtitle}>
                Connect Google above to start synchronizing calendars, email,
                and contacts into this Space.
              </Text>
            </Card>
          ) : (
            accounts.map((account) => {
              const status = (account.status || "healthy").toLowerCase()
              const isReauthRequired = status === "reauth_required"
              const isRateLimited = status === "rate_limited"
              const isError = status === "error" || status === "revoked"
              const isHealthy = status === "healthy"
              const accountAccentColor = account.color || theme.colors.primary
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
                              <CheckCircle2
                                size={12}
                                color={theme.colors.success}
                              />
                            }
                            label="Active"
                          />
                        )}
                        {isReauthRequired && (
                          <Badge
                            variant="warning"
                            size="sm"
                            icon={
                              <AlertTriangle
                                size={12}
                                color={theme.colors.warning}
                              />
                            }
                            label="Reconnect Required"
                          />
                        )}
                        {isRateLimited && (
                          <Badge
                            variant="warning"
                            size="sm"
                            icon={
                              <Clock size={12} color={theme.colors.warning} />
                            }
                            label="Rate Limited"
                          />
                        )}
                        {isError && (
                          <Badge
                            variant="destructive"
                            size="sm"
                            icon={
                              <AlertCircle
                                size={12}
                                color={theme.colors.destructive}
                              />
                            }
                            label="Error"
                          />
                        )}
                        <Text style={styles.lastSyncedText}>
                          {account.lastSyncTime
                            ? `Synced ${tz.formatRelative(account.lastSyncTime)}`
                            : "Never synced"}
                        </Text>
                      </View>
                    </View>

                    {/* Reconnect Banner */}
                    {isReauthRequired && (
                      <View style={styles.reconnectBanner}>
                        <View style={styles.reconnectLeft}>
                          <AlertTriangle
                            size={16}
                            color={theme.colors.warning}
                          />
                          <Text style={styles.reconnectText}>
                            Tokens have expired or authorization was revoked.
                            Please reconnect to resume synchronization.
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
                              Reconnect
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Capability Switches */}
                    <View style={styles.capabilityGroup}>
                      <Text style={styles.capabilityHeader}>
                        ACTIVE PLATFORM CAPABILITIES
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
                                  <Icon
                                    size={14}
                                    color={theme.colors.textMuted}
                                  />
                                </View>
                                <View style={styles.capTextContainer}>
                                  <Text style={styles.capTitle}>
                                    {CONNECTOR_CAPABILITY_LABELS[cap]}
                                  </Text>
                                  <Text style={styles.capDesc}>
                                    {CONNECTOR_CAPABILITY_DESCRIPTIONS[cap]}
                                  </Text>
                                </View>
                              </View>
                              {isUpdating ? (
                                <ActivityIndicator
                                  size="small"
                                  color={theme.colors.primary}
                                />
                              ) : (
                                <Switch
                                  value={isEnabled}
                                  disabled={!isWritable}
                                  onValueChange={() =>
                                    handleToggleCapability(account, cap)
                                  }
                                  trackColor={{
                                    false: theme.colors.surfaceHighlight,
                                    true: theme.colors.primary,
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
                              ? theme.colors.primary
                              : theme.colors.textSecondary
                          }
                        />
                        <Text style={styles.actionButtonText}>
                          {isSyncingThis ? "Syncing..." : "Sync Now"}
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
                          <Trash2 size={14} color={theme.colors.destructive} />
                          <Text style={styles.destructiveActionText}>
                            Disconnect
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
        title="Disconnect Account"
        message={`Are you sure you want to disconnect ${
          accountToDisconnect?.displayName || accountToDisconnect?.email || ""
        }? Synced external mirrors (calendars, mail, and contacts) in this Space will be permanently deleted.`}
        confirmText="Disconnect"
        cancelText="Cancel"
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
            <Text style={styles.modalTitle}>Accent Color Tag</Text>
            <Text style={styles.modalSubtitle}>
              Select a color tag for{" "}
              {colorPickerAccount?.displayName || colorPickerAccount?.email}
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
              Cancel
            </Button>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20,
  },
  readOnlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.warningSubtle,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  readOnlyText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.warning,
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
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionDescription: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  catalogCard: {
    padding: 16,
    gap: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  catalogCardDisabled: {
    opacity: 0.8,
  },
  catalogHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandIconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogInfo: {
    flex: 1,
    gap: 2,
  },
  catalogTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  catalogSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  titleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skeletonContainer: {
    gap: 12,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
    borderRadius: theme.radius.lg,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
  accountCard: {
    position: "relative",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
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
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  accountIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  avatarProviderBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  accountMeta: {
    flex: 1,
    gap: 2,
  },
  accountNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  colorPickerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metaSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  accountEmail: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  bulletSeparator: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  providerTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  providerName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: "capitalize",
    fontWeight: "500",
  },
  badgeContainer: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  lastSyncedText: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  reconnectBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.warningSubtle,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    gap: 10,
  },
  reconnectLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reconnectText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.warning,
    lineHeight: 16,
  },
  reconnectButton: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  reconnectButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000000",
  },
  capabilityGroup: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 10,
  },
  capabilityHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
  },
  capabilityList: {
    gap: 8,
  },
  capabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  capLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 8,
  },
  capIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  capTextContainer: {
    flex: 1,
  },
  capTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  capDesc: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  destructiveAction: {
    backgroundColor: theme.colors.destructiveSubtle,
  },
  destructiveActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  colorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: {
    borderColor: theme.colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
})
