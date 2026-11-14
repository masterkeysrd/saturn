import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListSpaceAPIKeyGrantsQuery,
  useRevokeSpaceAPIKeyGrantMutation,
  type APIKeyGrant,
} from "@saturn/api/gen/saturn/space/v1/space"
import { useTimezone } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
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
import { KeyIcon, Loader2Icon, ShieldCheckIcon, Trash2Icon } from "lucide-react"

export function SpaceAPIKeysSettings() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { spaceId, spaceName } = useActiveSpaceContext()
  const [grantToRevoke, setGrantToRevoke] = useState<APIKeyGrant | null>(null)

  const { data, isLoading } = useListSpaceAPIKeyGrantsQuery(
    { spaceId: spaceId || "" },
    { enabled: Boolean(spaceId) }
  )
  const revokeMutation = useRevokeSpaceAPIKeyGrantMutation()

  const grants = data?.grants ?? []

  const handleRevokeConfirm = async () => {
    if (!spaceId || !grantToRevoke?.apiKeyId) return
    try {
      await revokeMutation.mutateAsync({
        space_id: spaceId,
        api_key_id: grantToRevoke.apiKeyId,
        req: {
          spaceId,
          apiKeyId: grantToRevoke.apiKeyId,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/api-keys`],
      })
      setGrantToRevoke(null)
      toast.add({
        type: "success",
        title: "Workspace Access Revoked",
        description: `Access for "${grantToRevoke.keyName}" has been removed from this workspace.`,
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: "Failed to Revoke Access",
        description:
          err instanceof Error
            ? err.message
            : "Could not revoke workspace API key access.",
      })
    }
  }

  if (!spaceId) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 text-sm text-muted-foreground">
        Select an active workspace to manage its API key access grants.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <ShieldCheckIcon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Workspace API Key Grants
            </h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {grants.length} Active
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Member-owned API keys authorized to access{" "}
            <span className="font-medium text-foreground">
              {spaceName || spaceId}
            </span>
            . Revoking access here only removes this workspace from the key.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
          <KeyIcon className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            No API keys granted to this workspace
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            API keys created by workspace members with access to this space will
            appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
          {grants.map((grant) => {
            const initials = (grant.userName || grant.userEmail || "U")
              .slice(0, 2)
              .toUpperCase()
            return (
              <div
                key={grant.apiKeyId}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {grant.keyName}
                      </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {grant.keyPrefix}...
                      </code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Owner:{" "}
                      <span className="font-medium text-foreground">
                        {grant.userName || grant.userId}
                      </span>
                      {grant.userEmail ? ` (${grant.userEmail})` : ""}
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
                        Last used:{" "}
                        {grant.lastUsedAt
                          ? tz.formatDateTime(grant.lastUsedAt)
                          : "Never used"}
                      </span>
                      <span>
                        Expires:{" "}
                        {grant.expiresAt
                          ? tz.formatDate(grant.expiresAt)
                          : "No expiration"}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="xs"
                  className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setGrantToRevoke(grant)}
                >
                  <Trash2Icon className="mr-1.5 h-3.5 w-3.5" />
                  Revoke Access
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!grantToRevoke}
        onOpenChange={(open) => !open && setGrantToRevoke(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Workspace Access</DialogTitle>
            <DialogDescription>
              Remove access for{" "}
              <span className="font-semibold text-foreground">
                {grantToRevoke?.keyName}
              </span>{" "}
              from this workspace? The owner&apos;s grants to other workspaces
              will remain intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantToRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
