import { useState } from "react"
import {
  useListActiveSessionsQuery,
  useRevokeSessionMutation,
  useRevokeAllSessionsMutation,
  type UserSession,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { parseUserAgent, cn } from "@/lib/utils"
import {
  LaptopIcon,
  SmartphoneIcon,
  MonitorIcon,
  GlobeIcon,
  ClockIcon,
  Trash2Icon,
  LogOutIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"

export function ActiveSessionsSettings() {
  const { data, isLoading, refetch } = useListActiveSessionsQuery({})
  const revokeSessionMutation = useRevokeSessionMutation({
    onSuccess: () => {
      refetch()
      toast.add({
        type: "success",
        title: "Session Terminated",
        description: "The selected session has been signed out successfully.",
      })
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: "Revocation Failed",
        description:
          err instanceof Error ? err.message : "Failed to revoke session",
      })
    },
  })

  const revokeAllSessionsMutation = useRevokeAllSessionsMutation({
    onSuccess: () => {
      window.dispatchEvent(new Event("auth:unauthorized"))
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: "Sign Out Failed",
        description:
          err instanceof Error ? err.message : "Failed to sign out all devices",
      })
    },
  })

  const [sessionToRevoke, setSessionToRevoke] = useState<UserSession | null>(
    null
  )
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)

  const sessions = data?.sessions || []

  const handleRevokeSingle = async () => {
    if (!sessionToRevoke?.sessionId) return
    try {
      await revokeSessionMutation.mutateAsync({
        session_id: sessionToRevoke.sessionId,
        req: { sessionId: sessionToRevoke.sessionId },
      })
      setSessionToRevoke(null)
    } catch {
      // handled in onError
    }
  }

  const handleRevokeAll = async () => {
    try {
      await revokeAllSessionsMutation.mutateAsync({})
      setRevokeAllOpen(false)
    } catch {
      // handled in onError
    }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <LaptopIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Active Sign-in Sessions & Logins
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {sessions.length} {sessions.length === 1 ? "Active" : "Active"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Devices and web browsers currently authenticated to your Saturn
              account.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {sessions.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevokeAllOpen(true)}
              disabled={revokeAllSessionsMutation.isPending}
              className="cursor-pointer text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOutIcon className="mr-1.5 h-3.5 w-3.5" />
              Sign Out Other Devices
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-8 w-8 cursor-pointer"
          >
            <RefreshCwIcon
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <div>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
              Loading authenticated sessions...
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center p-6 text-center select-none">
            <MonitorIcon className="mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              No active sessions found
            </p>
            <p className="text-xs text-muted-foreground">
              Your session list will appear here once authenticated.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {sessions.map((session, idx) => {
              const isCurrent = idx === 0 // Saturn sorts sessions with current/most recent first
              const parsed = parseUserAgent(session.userAgent || "")
              const lastActive = session.lastUsedAt
                ? new Date(session.lastUsedAt).toLocaleString()
                : "Active now"

              return (
                <div
                  key={session.sessionId || idx}
                  className="flex flex-col gap-3 py-4 transition-colors first:pt-5 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3.5 text-left">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                        isCurrent
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/70 text-foreground"
                      )}
                    >
                      {parsed.isMobile ? (
                        <SmartphoneIcon className="h-5 w-5" />
                      ) : (
                        <MonitorIcon className="h-5 w-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {parsed.device || "Web Client"}
                        </span>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            Current Device
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Other Session
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GlobeIcon className="h-3 w-3" />
                          <span className="font-mono">
                            {session.ipAddress || "Unknown IP"}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          <span>{isCurrent ? "Active now" : lastActive}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center self-end sm:self-center">
                    {!isCurrent ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSessionToRevoke(session)}
                        disabled={revokeSessionMutation.isPending}
                        className="h-8 cursor-pointer text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2Icon className="mr-1.5 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground select-none">
                        This session
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Revoke Single Session Dialog */}
      <Dialog
        open={!!sessionToRevoke}
        onOpenChange={(open) => !open && setSessionToRevoke(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
              Revoke Session
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this session? The device will be
              immediately signed out and forced to re-authenticate.
            </DialogDescription>
          </DialogHeader>

          {sessionToRevoke && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">
                {parseUserAgent(sessionToRevoke.userAgent || "").device}
              </div>
              <div className="mt-1 font-mono">
                IP: {sessionToRevoke.ipAddress || "Unknown"}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSessionToRevoke(null)}
              disabled={revokeSessionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeSingle}
              disabled={revokeSessionMutation.isPending}
            >
              {revokeSessionMutation.isPending
                ? "Revoking..."
                : "Revoke Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke All Other Sessions Dialog */}
      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <LogOutIcon className="h-5 w-5" />
              Sign Out of All Devices
            </DialogTitle>
            <DialogDescription>
              This will immediately invalidate all active sessions across all
              devices, including this browser. You will need to log back in.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRevokeAllOpen(false)}
              disabled={revokeAllSessionsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAll}
              disabled={revokeAllSessionsMutation.isPending}
            >
              {revokeAllSessionsMutation.isPending
                ? "Signing out..."
                : "Sign Out Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
