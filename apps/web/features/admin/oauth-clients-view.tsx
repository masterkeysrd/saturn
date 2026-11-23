import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateOAuthClientMutation,
  useDeleteOAuthClientMutation,
  useListOAuthClientsQuery,
  useRotateOAuthClientSecretMutation,
  useUpdateOAuthClientMutation,
  type OAuthClient,
} from "@saturn/api/gen/saturn/identity/admin/v1/admin_identity"
import { useI18n, useTimezone } from "@saturn/hooks"
import { PageLayout } from "@/components/ui/page-layout"
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
} from "@/features/settings/components/oauth-client-dialog"
import {
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"

export function AdminOAuthClientsView() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { t } = useI18n()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<OAuthClient | null>(null)
  const [revealedCredentials, setRevealedCredentials] = useState<{
    clientId: string
    rawSecret: string | null
  } | null>(null)
  const [clientToDelete, setClientToDelete] = useState<OAuthClient | null>(null)

  const clientsQuery = useListOAuthClientsQuery({})
  const createMutation = useCreateOAuthClientMutation()
  const updateMutation = useUpdateOAuthClientMutation()
  const rotateMutation = useRotateOAuthClientSecretMutation()
  const deleteMutation = useDeleteOAuthClientMutation()

  const clients = clientsQuery.data?.oauthClients ?? []

  const invalidateClients = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["/api/v1/admin/identity/oauth-clients"],
    })
  }

  const handleSubmit = async (values: OAuthClientFormValues) => {
    try {
      if (editingClient?.id) {
        const updated = await updateMutation.mutateAsync({
          id: editingClient.id,
          req: {
            id: editingClient.id,
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
          oauthClient: {
            name: values.name,
            description: values.description,
            redirectUris: values.redirectUris,
            allowedScopes: values.allowedScopes,
            tokenEndpointAuthMethod: values.tokenEndpointAuthMethod,
            refreshTokenPolicy: values.refreshTokenPolicy,
          },
        })
        setSheetOpen(false)
        setRevealedCredentials({
          clientId: created.id || "",
          rawSecret: created.rawSecret || null,
        })
        toast.add({ type: "success", title: t("settings.oauth.clientCreated") })
      }
      await invalidateClients()
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.saveClientFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleRotateSecret = async (client: OAuthClient) => {
    if (!client.id) return
    try {
      const res = await rotateMutation.mutateAsync({
        id: client.id,
        req: { id: client.id },
      })
      await invalidateClients()
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

  const handleDelete = async () => {
    if (!clientToDelete?.id) return
    try {
      await deleteMutation.mutateAsync({ id: clientToDelete.id })
      setClientToDelete(null)
      await invalidateClients()
      toast.add({ type: "success", title: t("settings.oauth.clientDeleted") })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.oauth.clientDeleteFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <PageLayout
      title={t("settings.oauth.adminTitle")}
      description={t("settings.oauth.adminDesc")}
      icon={ShieldCheckIcon}
      actions={
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
      }
    >
      {clientsQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
          <KeyRoundIcon className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("settings.oauth.adminEmpty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
          {clients.map((client) => {
            const isEditable =
              client.registrationSource !== "cimd" && !client.spaceId
            return (
              <div
                key={client.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {client.name}
                    </span>
                    <Badge variant="secondary">
                      {(client.registrationSource || "admin").toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {client.tokenEndpointAuthMethod}
                    </Badge>
                    <Badge variant="outline">
                      {client.refreshTokenPolicy || "rotate"}
                    </Badge>
                    {client.spaceId && (
                      <Badge variant="outline">{client.spaceId}</Badge>
                    )}
                  </div>
                  <div className="font-mono text-xs break-all text-muted-foreground">
                    {client.id}
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
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("settings.oauth.redirectsSummary", {
                        uris: (client.redirectUris ?? []).join(", "),
                      })}
                    </span>
                    {client.createTime && (
                      <span>
                        {t("settings.oauth.createdOn", {
                          date: tz.formatDate(client.createTime),
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isEditable && (
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
                  )}
                  {isEditable && client.tokenEndpointAuthMethod !== "none" && (
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
            )
          })}
        </div>
      )}

      <OAuthClientDialog
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditingClient(null)
        }}
        initialClient={editingClient}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSubmit}
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
              onClick={handleDelete}
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
    </PageLayout>
  )
}
