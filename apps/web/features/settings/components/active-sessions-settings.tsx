import { useState } from "react"
import { useI18n, useTimezone } from "@saturn/hooks"
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
  const { t } = useI18n()
  const tz = useTimezone()
  const { data, isLoading, refetch } = useListActiveSessionsQuery({})
  const revokeSessionMutation = useRevokeSessionMutation({
    onSuccess: () => {
      refetch()
      toast.add({
        type: "success",
        title: t("settings.sessions.revokeOkToast"),
        description: t("settings.sessions.revokeOkDesc"),
      })
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: t("settings.sessions.revokeFailedToast"),
        description:
          err instanceof Error
            ? err.message
            : t("settings.sessions.revokeFailedDefault"),
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
        title: t("settings.sessions.revokeAllFailedToast"),
        description:
          err instanceof Error
            ? err.message
            : t("settings.sessions.revokeAllFailedDefault"),
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
                {t("settings.sessions.title")}
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {sessions.length} {t("settings.sessions.activeBadge")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.sessions.desc")}
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
              {t("settings.sessions.revokeAllBtn")}
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
              {t("settings.sessions.loading")}
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center p-6 text-center select-none">
            <MonitorIcon className="mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {t("settings.sessions.emptyTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.sessions.emptyDesc")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {sessions.map((session, idx) => {
              const isCurrent = Boolean(session.isCurrent ?? idx === 0)
              const parsed = parseUserAgent(session.userAgent || "")
              const lastActive = session.lastUsedAt
                ? tz.formatDateTime(session.lastUsedAt)
                : t("settings.sessions.activeNow")

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
                          {parsed.device || t("settings.sessions.webClient")}
                        </span>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            {t("settings.sessions.currentDevice")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {t("settings.sessions.otherSession")}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <GlobeIcon className="h-3 w-3" />
                          <span className="font-mono">
                            {session.ipAddress ||
                              t("settings.sessions.unknownIp")}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          <span>
                            {isCurrent
                              ? t("settings.sessions.activeNow")
                              : lastActive}
                          </span>
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
                        {t("settings.sessions.revoke")}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground select-none">
                        {t("settings.sessions.thisSession")}
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
        <DialogContent mobileFullscreen={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
              {t("settings.sessions.revokeSessionTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings.sessions.revokeSessionDesc")}
            </DialogDescription>
          </DialogHeader>

          {sessionToRevoke && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">
                {parseUserAgent(sessionToRevoke.userAgent || "").device}
              </div>
              <div className="mt-1 font-mono">
                {t("settings.sessions.ipLabel")}{" "}
                {sessionToRevoke.ipAddress || t("common.unknown")}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSessionToRevoke(null)}
              disabled={revokeSessionMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeSingle}
              disabled={revokeSessionMutation.isPending}
            >
              {revokeSessionMutation.isPending
                ? t("settings.sessions.revoking")
                : t("settings.sessions.revokeSessionTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke All Sessions Dialog */}
      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent mobileFullscreen={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <LogOutIcon className="h-5 w-5" />
              {t("settings.sessions.revokeAllBtn")}
            </DialogTitle>
            <DialogDescription>
              {t("settings.sessions.revokeAllDesc")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRevokeAllOpen(false)}
              disabled={revokeAllSessionsMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAll}
              disabled={revokeAllSessionsMutation.isPending}
            >
              {revokeAllSessionsMutation.isPending
                ? t("settings.sessions.signingOut")
                : t("settings.sessions.revokeAllSignOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
