import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
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
  Loader2,
  Lock,
} from "lucide-react"
import {
  useConnectorProviders,
  useConnectedAccounts,
  useInitiateOAuth,
  useUpdateConnectedAccount,
  useDeleteConnectedAccount,
  useSyncConnectedAccount,
  useCalendars,
  useUpdateCalendar,
  type ConnectedAccount,
} from "@saturn/hooks"
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_CAPABILITY_LABELS,
  CONNECTOR_CAPABILITY_DESCRIPTIONS,
  type ConnectorCapability,
} from "@saturn/schemas"
import { useTimezone } from "@saturn/hooks"
import { useSpacePermissions } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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

const CAPABILITY_ICONS: Record<ConnectorCapability, typeof Calendar> = {
  calendar: Calendar,
  mail: Mail,
  contacts: Contact,
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M13 1h10v10H13z" />
      <path fill="#00a4ef" d="M1 13h10v10H1z" />
      <path fill="#ffb900" d="M13 13h10v10H13z" />
    </svg>
  )
}

function ProviderIcon({
  provider,
  className,
}: {
  provider?: string
  className?: string
}) {
  const p = provider?.toLowerCase()
  if (p === "microsoft") {
    return <MicrosoftIcon className={className} />
  }
  return <GoogleIcon className={className} />
}

function AccountAvatar({
  avatarUrl,
  name,
  color,
}: {
  avatarUrl?: string
  name?: string
  color: string
}) {
  const [hasError, setHasError] = useState(false)
  const initial = (name || "A").slice(0, 1).toUpperCase()

  if (avatarUrl && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt={name || "Avatar"}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="h-10 w-10 rounded-full border border-border object-cover"
      />
    )
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white select-none"
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

export function ConnectedAccountsView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()

  const { data: providersData, isLoading: providersLoading } =
    useConnectorProviders()
  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useConnectedAccounts({ spaceId }, { enabled: Boolean(spaceId) })

  const initiateOAuthMutation = useInitiateOAuth()
  const updateAccountMutation = useUpdateConnectedAccount({ spaceId })
  const deleteAccountMutation = useDeleteConnectedAccount({ spaceId })
  const syncAccountMutation = useSyncConnectedAccount({ spaceId })
  const { data: calendarsData } = useCalendars()
  const updateCalendarMutation = useUpdateCalendar()
  const allCalendars = calendarsData?.calendars || []

  const [accountToDisconnect, setAccountToDisconnect] =
    useState<ConnectedAccount | null>(null)
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)
  const [updatingCapKey, setUpdatingCapKey] = useState<string | null>(null)

  // Handle OAuth callback search parameters (?connected_account_id=... or ?oauth_error=...)
  useEffect(() => {
    const connectedAccountId = searchParams.get("connected_account_id")
    const oauthError = searchParams.get("oauth_error")

    if (connectedAccountId) {
      toast.add({
        title: "Account connected",
        description: "External account connected and authorized successfully.",
        type: "success",
      })
      refetchAccounts()
      navigate(window.location.pathname, { replace: true })
    } else if (oauthError) {
      toast.add({
        title: "Connection failed",
        description: `Authorization failed: ${oauthError}`,
        type: "error",
      })
      navigate(window.location.pathname, { replace: true })
    }
  }, [searchParams, navigate, refetchAccounts])

  const accounts = accountsData?.accounts || []
  const providers = providersData?.providers || []

  const handleConnect = async (
    provider: string,
    existingAccountId?: string,
    requestedCapabilities?: string[]
  ) => {
    try {
      const returnUrl = window.location.href.split("?")[0]
      const res = await initiateOAuthMutation.mutateAsync({
        provider,
        returnUrl,
        capabilities: requestedCapabilities || ["calendar", "mail", "contacts"],
        connectedAccountId: existingAccountId,
      })

      if (res.authUrl) {
        window.location.assign(res.authUrl)
      }
    } catch (err) {
      toast.add({
        title: "Failed to initiate connection",
        description:
          err instanceof Error ? err.message : "Unexpected connection error",
        type: "error",
      })
    }
  }

  const handleToggleCapability = async (
    account: ConnectedAccount,
    capability: ConnectorCapability
  ) => {
    if (!isWritable || !account.id) return

    const currentCaps = account.enabledCapabilities || []
    const isEnabling = !currentCaps.includes(capability)
    const newCaps = isEnabling
      ? [...currentCaps, capability]
      : currentCaps.filter((c) => c !== capability)

    const opKey = `${account.id}-${capability}`
    setUpdatingCapKey(opKey)

    try {
      await updateAccountMutation.mutateAsync({
        id: account.id,
        spaceId,
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
      toast.add({
        title: "Capabilities updated",
        description: `${CONNECTOR_CAPABILITY_LABELS[capability]} ${isEnabling ? "enabled" : "disabled"}.`,
        type: "success",
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : ""
      const isScopeUpgradeRequired =
        errMsg.toLowerCase().includes("scope") ||
        errMsg.toLowerCase().includes("incremental oauth") ||
        errMsg.includes("MISSING_OAUTH_SCOPES")

      if (isScopeUpgradeRequired && isEnabling) {
        toast.add({
          title: "Authorization required",
          description:
            "Additional provider permission required. Redirecting to authorize...",
          type: "info",
        })
        await handleConnect(account.provider || "google", account.id, newCaps)
      } else {
        toast.add({
          title: "Failed to update capabilities",
          description: errMsg || "Could not update capability switch",
          type: "error",
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

    try {
      await updateAccountMutation.mutateAsync({
        id: account.id,
        spaceId,
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
      toast.add({
        title: "Accent color updated",
        description: "Account color tag saved successfully.",
        type: "success",
      })
    } catch (err) {
      toast.add({
        title: "Failed to update color",
        description: err instanceof Error ? err.message : "Update failed",
        type: "error",
      })
    }
  }

  const handleSyncNow = async (account: ConnectedAccount) => {
    if (!account.id) return
    setSyncingAccountId(account.id)
    try {
      await syncAccountMutation.mutateAsync({
        id: account.id,
        spaceId,
      })
      toast.add({
        title: "Sync triggered",
        description: "Account synchronization in progress.",
        type: "success",
      })
    } catch (err) {
      toast.add({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Sync request failed",
        type: "error",
      })
    } finally {
      setSyncingAccountId(null)
    }
  }

  const handleConfirmDisconnect = async () => {
    if (!accountToDisconnect?.id) return
    try {
      await deleteAccountMutation.mutateAsync({
        id: accountToDisconnect.id,
        spaceId,
      })
      toast.add({
        title: "Account disconnected",
        description:
          "The account and its synced external mirrors have been removed from this Space.",
        type: "success",
      })
      setAccountToDisconnect(null)
    } catch (err) {
      toast.add({
        title: "Disconnect failed",
        description:
          err instanceof Error ? err.message : "Failed to disconnect account",
        type: "error",
      })
    }
  }

  const isGoogleAvailable = providers.some((p) => p.id === "google")

  return (
    <div className="space-y-8">
      {/* Read-only banner for viewers / members */}
      {!isWritable && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            You are viewing Connected Accounts in read-only mode. Workspace
            Admin or Owner privileges are required to connect, update, or
            disconnect external accounts.
          </span>
        </div>
      )}

      {/* Provider Catalog Section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Connect New Account
          </h3>
          <p className="text-sm text-muted-foreground">
            Synchronize external calendars, emails, and address books into this
            workspace.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Google Card */}
          <Card
            size="sm"
            className="flex flex-col justify-between transition-shadow hover:shadow-xs"
          >
            <CardHeader className="pb-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 shadow-2xs">
                  <GoogleIcon className="h-5 w-5 shrink-0" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-sm font-semibold">
                    Google
                  </CardTitle>
                  <CardDescription className="truncate text-xs">
                    Google Workspace & Personal Gmail
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  Calendars
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Mail className="h-2.5 w-2.5 shrink-0" />
                  Mail
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Contact className="h-2.5 w-2.5 shrink-0" />
                  Contacts
                </span>
              </div>
              {isWritable ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center truncate text-xs"
                  disabled={
                    providersLoading ||
                    !isGoogleAvailable ||
                    initiateOAuthMutation.isPending
                  }
                  onClick={() => handleConnect("google")}
                >
                  {initiateOAuthMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <GoogleIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">Connect Google</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center truncate text-xs"
                  disabled
                >
                  <Lock className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Admin Only</span>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Microsoft Card (Coming Soon) */}
          <Card size="sm" className="flex flex-col justify-between opacity-80">
            <CardHeader className="pb-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80 shadow-2xs">
                    <MicrosoftIcon className="h-5 w-5 shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm font-semibold">
                      Microsoft
                    </CardTitle>
                    <CardDescription className="truncate text-xs">
                      Microsoft 365 & Outlook.com
                    </CardDescription>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  Coming Soon
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                  Calendars
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Mail className="h-2.5 w-2.5 shrink-0" />
                  Mail
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/50 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground">
                  <Contact className="h-2.5 w-2.5 shrink-0" />
                  Contacts
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-center truncate text-xs"
                disabled
              >
                <span className="truncate">Coming Soon</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Connected Accounts List Section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Connected Accounts
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage your synchronized provider accounts, active capabilities, and
            accent tags.
          </p>
        </div>

        {accountsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-32 w-full animate-pulse rounded-xl border bg-muted/30"
              />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="mt-3 text-sm font-semibold">
              No Connected Accounts
            </h4>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Connect Google above to start synchronizing calendars, email, and
              contacts into this Space.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => {
              const status = (account.status || "healthy").toLowerCase()
              const isReauthRequired = status === "reauth_required"
              const isRateLimited = status === "rate_limited"
              const isError = status === "error" || status === "revoked"
              const isHealthy = status === "healthy"

              const accountAccentColor = account.color || "#3b82f6"
              const isSyncingThis = syncingAccountId === account.id

              return (
                <Card
                  key={account.id}
                  size="sm"
                  className={cn(
                    "relative overflow-hidden transition-all",
                    isReauthRequired &&
                      "border-amber-500/40 bg-amber-500/[0.02]"
                  )}
                >
                  {/* Left accent color bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 w-1.5"
                    style={{ backgroundColor: accountAccentColor }}
                  />

                  <CardContent className="space-y-4 p-4 pl-6">
                    {/* Header Row: Avatar, Identity & Status Badge */}
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="relative shrink-0">
                          <AccountAvatar
                            avatarUrl={account.avatarUrl}
                            name={account.displayName || account.email}
                            color={accountAccentColor}
                          />
                          <div className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border border-border/60 bg-background p-0.5 shadow-2xs">
                            <ProviderIcon
                              provider={account.provider}
                              className="h-2.5 w-2.5"
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-semibold text-foreground">
                              {account.displayName || account.email}
                            </span>
                            {/* Accent color picker */}
                            {isWritable && (
                              <Popover>
                                <PopoverTrigger
                                  type="button"
                                  aria-label="Change account accent color"
                                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full border border-border shadow-xs transition-transform hover:scale-110"
                                  style={{
                                    backgroundColor: accountAccentColor,
                                  }}
                                />
                                <PopoverContent
                                  className="w-auto p-2"
                                  align="start"
                                >
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {ACCENT_COLORS.map((c) => (
                                      <button
                                        key={c.value}
                                        type="button"
                                        title={c.name}
                                        className={cn(
                                          "h-6 w-6 rounded-full border transition-transform hover:scale-110",
                                          account.color === c.value
                                            ? "ring-2 ring-primary ring-offset-2"
                                            : "border-border"
                                        )}
                                        style={{ backgroundColor: c.value }}
                                        onClick={() =>
                                          handleColorChange(account, c.value)
                                        }
                                      />
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="truncate">{account.email}</span>
                            <span className="shrink-0">•</span>
                            <span className="inline-flex shrink-0 items-center gap-1 capitalize">
                              <ProviderIcon
                                provider={account.provider}
                                className="h-3 w-3 shrink-0"
                              />
                              {account.provider}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Status Badges & Last Synced */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        {isHealthy && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            Active
                          </span>
                        )}
                        {isReauthRequired && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Reconnect Required
                          </span>
                        )}
                        {isRateLimited && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-yellow-600 dark:text-yellow-400">
                            <Clock className="h-3 w-3 shrink-0" />
                            Rate Limited
                          </span>
                        )}
                        {isError && (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-red-600 dark:text-red-400">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            Error
                          </span>
                        )}

                        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                          {account.lastSyncTime
                            ? `Synced ${tz.formatRelative(account.lastSyncTime)}`
                            : "Never synced"}
                        </span>
                      </div>
                    </div>

                    {/* Reconnect Banner if token expired/invalid */}
                    {isReauthRequired && (
                      <div className="flex flex-col gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 sm:flex-row sm:items-center sm:justify-between dark:text-amber-400">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                          <span className="leading-tight">
                            Tokens have expired or authorization was revoked.
                            Please reconnect to resume synchronization.
                          </span>
                        </div>
                        {isWritable && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 shrink-0 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700"
                            onClick={() =>
                              handleConnect(
                                account.provider || "google",
                                account.id,
                                account.enabledCapabilities
                              )
                            }
                          >
                            Reconnect
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Capability Switches */}
                    <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                      <div className="text-xs font-medium text-muted-foreground">
                        Active Platform Capabilities
                      </div>
                      <div className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-card">
                        {CONNECTOR_CAPABILITIES.map((cap) => {
                          const Icon = CAPABILITY_ICONS[cap]
                          const isEnabled =
                            account.enabledCapabilities?.includes(cap) ?? false
                          const isUpdating =
                            updatingCapKey === `${account.id}-${cap}`
                          const switchId = `cap-${account.id}-${cap}`

                          return (
                            <div
                              key={cap}
                              className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/25"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/50 text-muted-foreground">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <label
                                    htmlFor={switchId}
                                    className="block cursor-pointer text-xs font-semibold text-foreground hover:underline"
                                  >
                                    {CONNECTOR_CAPABILITY_LABELS[cap]}
                                  </label>
                                  <span className="block text-[11px] text-muted-foreground">
                                    {CONNECTOR_CAPABILITY_DESCRIPTIONS[cap]}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center pl-2">
                                {isUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <Switch
                                    id={switchId}
                                    checked={isEnabled}
                                    disabled={!isWritable}
                                    onCheckedChange={() =>
                                      handleToggleCapability(account, cap)
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Synchronized Sub-Calendars */}
                    {account.enabledCapabilities?.includes("calendar") &&
                      (() => {
                        const accountCalendars = allCalendars.filter(
                          (c) => c.connectedAccountId === account.id
                        )
                        if (accountCalendars.length === 0) return null
                        return (
                          <div className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                            <div className="text-xs font-medium text-muted-foreground">
                              Synchronized Calendars
                            </div>
                            <div className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-card">
                              {accountCalendars.map((cal) => (
                                <div
                                  key={cal.id}
                                  className="flex items-center justify-between gap-3 p-2.5 transition-colors hover:bg-muted/25"
                                >
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          cal.color || accountAccentColor,
                                      }}
                                    />
                                    <span className="truncate text-xs font-medium text-foreground">
                                      {cal.name}
                                    </span>
                                  </div>
                                  <Switch
                                    checked={cal.isEnabled}
                                    disabled={!isWritable}
                                    onCheckedChange={() =>
                                      updateCalendarMutation.mutate({
                                        id: cal.id,
                                        calendar: { isEnabled: !cal.isEnabled },
                                        updateMask: { paths: ["isEnabled"] },
                                      })
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                    {/* Actions Row */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        disabled={isSyncingThis || !isWritable}
                        onClick={() => handleSyncNow(account)}
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isSyncingThis && "animate-spin"
                          )}
                        />
                        <span>{isSyncingThis ? "Syncing..." : "Sync Now"}</span>
                      </Button>

                      {isWritable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setAccountToDisconnect(account)}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Disconnect</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Destructive Disconnect Confirmation Dialog */}
      {Boolean(accountToDisconnect) && (
        <AlertDialog
          open={Boolean(accountToDisconnect)}
          onOpenChange={(open) => !open && setAccountToDisconnect(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to disconnect{" "}
                <strong>
                  {accountToDisconnect?.displayName ||
                    accountToDisconnect?.email}
                </strong>
                ? Synced external mirrors (calendars, mail, and contacts) in
                this Space will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
                onClick={handleConfirmDisconnect}
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
