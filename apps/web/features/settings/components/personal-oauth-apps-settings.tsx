import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListUserOAuthGrantsQuery,
  useRevokeUserOAuthGrantMutation,
  type UserOAuthGrant,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { useI18n, useTimezone } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { AppWindowIcon, Loader2Icon, Trash2Icon } from "lucide-react"

export function PersonalOAuthAppsSettings() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { t } = useI18n()

  const { data, isLoading } = useListUserOAuthGrantsQuery({})
  const revokeMutation = useRevokeUserOAuthGrantMutation()
  const [grantToRevoke, setGrantToRevoke] = useState<UserOAuthGrant | null>(
    null
  )

  const grants = data?.grants ?? []

  const handleRevokeConfirm = async () => {
    if (!grantToRevoke?.id) return
    try {
      await revokeMutation.mutateAsync({
        grant_id: grantToRevoke.id,
        req: { grantId: grantToRevoke.id },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/oauth/grants"],
      })
      setGrantToRevoke(null)
      toast.add({
        type: "success",
        title: t("settings.oauth.revokeGrantOk"),
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.revokeGrantFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <AppWindowIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("settings.oauth.personalTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.oauth.personalDesc")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
          <AppWindowIcon className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {t("settings.oauth.personalEmptyTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.oauth.personalEmptyDesc")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
          {grants.map((grant) => (
            <div
              key={grant.id}
              className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {grant.clientName || grant.clientId}
                  </span>
                  <Badge
                    variant={grant.isWorkspaceClient ? "secondary" : "outline"}
                  >
                    {grant.isWorkspaceClient
                      ? t("settings.oauth.workspaceAppBadge")
                      : t("settings.oauth.instanceAppBadge")}
                  </Badge>
                  <Badge variant="outline">
                    {grant.spaceName || grant.spaceId}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(grant.scopes ?? []).map((scope) => (
                    <span
                      key={scope}
                      className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("settings.apiKeys.lastUsed")}{" "}
                    {grant.lastUsedAt
                      ? tz.formatDateTime(grant.lastUsedAt)
                      : t("settings.apiKeys.neverUsed")}
                  </span>
                  {grant.createTime && (
                    <span>
                      {t("settings.oauth.authorizedOn", {
                        date: tz.formatDate(grant.createTime),
                      })}
                    </span>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="xs"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setGrantToRevoke(grant)}
              >
                <Trash2Icon className="mr-1.5 h-3.5 w-3.5" />
                {t("settings.oauth.btnRevokeGrant")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(grantToRevoke)}
        onOpenChange={(open) => !open && setGrantToRevoke(null)}
      >
        <DialogContent mobileFullscreen={false}>
          <DialogHeader>
            <DialogTitle>{t("settings.oauth.revokeGrantTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.oauth.revokeGrantDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantToRevoke(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("settings.oauth.btnRevokeGrant")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
