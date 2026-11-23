import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateSpaceOAuthClientMutation,
  useDeleteSpaceOAuthClientMutation,
  useListSpaceOAuthClientsQuery,
  useListSpaceOAuthGrantsQuery,
  useRevokeSpaceOAuthGrantMutation,
  useRotateSpaceOAuthClientSecretMutation,
  useUpdateSpaceOAuthClientMutation,
  type SpaceOAuthClient,
  type SpaceOAuthGrant,
} from "@saturn/api/gen/saturn/space/v1/space"
import { useI18n, useTimezone } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
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
import {
  OAuthClientSecretDialog,
  OAuthClientDialog,
  type OAuthClientFormValues,
} from "./oauth-client-dialog"
import {
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"

export function SpaceOAuthAppsSettings() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { t } = useI18n()
  const { spaceId, spaceName } = useActiveSpaceContext()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<SpaceOAuthClient | null>(
    null
  )
  const [revealedCredentials, setRevealedCredentials] = useState<{
    clientId: string
    rawSecret: string | null
  } | null>(null)
  const [clientToDelete, setClientToDelete] = useState<SpaceOAuthClient | null>(
    null
  )
  const [grantToRevoke, setGrantToRevoke] = useState<SpaceOAuthGrant | null>(
    null
  )

  const clientsQuery = useListSpaceOAuthClientsQuery(
    { spaceId: spaceId || "" },
    { enabled: Boolean(spaceId) }
  )
  const grantsQuery = useListSpaceOAuthGrantsQuery(
    { spaceId: spaceId || "" },
    { enabled: Boolean(spaceId) }
  )

  const createMutation = useCreateSpaceOAuthClientMutation()
  const updateMutation = useUpdateSpaceOAuthClientMutation()
  const rotateMutation = useRotateSpaceOAuthClientSecretMutation()
  const deleteMutation = useDeleteSpaceOAuthClientMutation()
  const revokeGrantMutation = useRevokeSpaceOAuthGrantMutation()

  const clients = clientsQuery.data?.oauthClients ?? []
  const grants = grantsQuery.data?.grants ?? []

  const invalidateSpaceOAuth = async () => {
    if (!spaceId) return
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/oauth-clients`],
      }),
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/oauth-grants`],
      }),
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/oauth/grants"],
      }),
    ])
  }

  const handleClientSubmit = async (values: OAuthClientFormValues) => {
    if (!spaceId) return
    try {
      if (editingClient?.id) {
        const updated = await updateMutation.mutateAsync({
          space_id: spaceId,
          client_id: editingClient.id,
          req: {
            spaceId,
            clientId: editingClient.id,
            oauthClient: {
              name: values.name,
              description: values.description,
              redirectUris: values.redirectUris,
              allowedScopes: values.allowedScopes,
              tokenEndpointAuthMethod: values.tokenEndpointAuthMethod,
              refreshTokenPolicy: values.refreshTokenPolicy,
            },
            updateMask: {
              paths: [
                "name",
                "description",
                "redirect_uris",
                "allowed_scopes",
                "token_endpoint_auth_method",
                "refresh_token_policy",
              ],
            },
          },
        })
        setSheetOpen(false)
        setEditingClient(null)
        if (updated.rawSecret) {
          setRevealedCredentials({
            clientId: updated.id || "",
            rawSecret: updated.rawSecret,
          })
        }
        toast.add({ type: "success", title: t("settings.oauth.clientUpdated") })
      } else {
        const created = await createMutation.mutateAsync({
          space_id: spaceId,
          req: {
            spaceId,
            oauthClient: {
              name: values.name,
              description: values.description,
              redirectUris: values.redirectUris,
              allowedScopes: values.allowedScopes,
              tokenEndpointAuthMethod: values.tokenEndpointAuthMethod,
              refreshTokenPolicy: values.refreshTokenPolicy,
            },
          },
        })
        setSheetOpen(false)
        setRevealedCredentials({
          clientId: created.id || "",
          rawSecret: created.rawSecret || null,
        })
        toast.add({
          type: "success",
          title: t("settings.oauth.workspaceClientCreated"),
        })
      }
      await invalidateSpaceOAuth()
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.saveClientFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleRotateSecret = async (client: SpaceOAuthClient) => {
    if (!spaceId || !client.id) return
    try {
      const res = await rotateMutation.mutateAsync({
        space_id: spaceId,
        client_id: client.id,
        req: { spaceId, clientId: client.id },
      })
      await invalidateSpaceOAuth()
      setRevealedCredentials({
        clientId: res.id || client.id,
        rawSecret: res.rawSecret || null,
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.rotateSecretFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleDeleteClient = async () => {
    if (!spaceId || !clientToDelete?.id) return
    try {
      await deleteMutation.mutateAsync({
        space_id: spaceId,
        client_id: clientToDelete.id,
        req: { spaceId, clientId: clientToDelete.id },
      })
      setClientToDelete(null)
      await invalidateSpaceOAuth()
      toast.add({ type: "success", title: t("settings.oauth.clientDeleted") })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.clientDeleteFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleRevokeGrant = async () => {
    if (!spaceId || !grantToRevoke?.grantId) return
    try {
      await revokeGrantMutation.mutateAsync({
        space_id: spaceId,
        grant_id: grantToRevoke.grantId,
        req: { spaceId, grantId: grantToRevoke.grantId },
      })
      setGrantToRevoke(null)
      await invalidateSpaceOAuth()
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

  if (!spaceId) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 text-sm text-muted-foreground">
        {t("settings.spaceKeys.noActiveWorkspace")}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheckIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("settings.oauth.workspaceTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("settings.oauth.workspaceDesc")}{" "}
                <span className="font-medium text-foreground">
                  {spaceName || spaceId}
                </span>
                .
              </p>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => {
              setEditingClient(null)
              setSheetOpen(true)
            }}
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            {t("settings.oauth.btnCreateClient")}
          </Button>
        </div>
      </div>

      {/* Registered Workspace Clients */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t("settings.oauth.registeredClientsTitle")}
        </h3>

        {clientsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-10">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
            <KeyRoundIcon className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("settings.oauth.registeredClientsEmpty")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
            {clients.map((client) => (
              <div
                key={client.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {client.name}
                    </span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {client.id}
                    </code>
                    <Badge variant="outline">
                      {client.tokenEndpointAuthMethod}
                    </Badge>
                    <Badge variant="secondary">
                      {client.refreshTokenPolicy || "rotate"}
                    </Badge>
                  </div>
                  {client.description && (
                    <p className="text-xs text-muted-foreground">
                      {client.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {(client.allowedScopes ?? []).map((scope) => (
                      <span
                        key={scope}
                        className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("settings.oauth.redirectsSummary", {
                      uris: (client.redirectUris ?? []).join(", "),
                    })}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setEditingClient(client)
                      setSheetOpen(true)
                    }}
                  >
                    <PencilIcon className="mr-1 h-3.5 w-3.5" />
                    {t("common.edit")}
                  </Button>
                  {client.tokenEndpointAuthMethod !== "none" && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleRotateSecret(client)}
                      disabled={rotateMutation.isPending}
                    >
                      <RefreshCwIcon className="mr-1 h-3.5 w-3.5" />
                      {t("settings.oauth.btnRotateSecret")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setClientToDelete(client)}
                  >
                    <Trash2Icon className="mr-1 h-3.5 w-3.5" />
                    {t("common.delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Workspace Grants */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t("settings.oauth.activeGrantsTitle")}
        </h3>

        {grantsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-10">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : grants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
            <p className="text-xs text-muted-foreground">
              {t("settings.oauth.activeGrantsEmpty")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
            {grants.map((grant) => (
              <div
                key={grant.grantId}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {grant.clientName || grant.clientId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      • {grant.userName || grant.userId}
                      {grant.userEmail ? ` (${grant.userEmail})` : ""}
                    </span>
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
      </div>

      <OAuthClientDialog
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditingClient(null)
        }}
        initialClient={editingClient}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleClientSubmit}
      />

      <OAuthClientSecretDialog
        clientId={revealedCredentials?.clientId ?? null}
        rawSecret={revealedCredentials?.rawSecret ?? null}
        onClose={() => setRevealedCredentials(null)}
      />

      <Dialog
        open={Boolean(clientToDelete)}
        onOpenChange={(open) => !open && setClientToDelete(null)}
      >
        <DialogContent mobileFullscreen={false}>
          <DialogHeader>
            <DialogTitle>{t("settings.oauth.btnDeleteClient")}</DialogTitle>
            <DialogDescription>
              {t("settings.oauth.deleteClientDescPrefix")}{" "}
              <span className="font-semibold text-foreground">
                {clientToDelete?.name}
              </span>
              {t("settings.oauth.deleteClientDescSuffix")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientToDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClient}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("settings.oauth.btnDeleteClient")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onClick={handleRevokeGrant}
              disabled={revokeGrantMutation.isPending}
            >
              {revokeGrantMutation.isPending && (
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
