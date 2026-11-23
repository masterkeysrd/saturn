import { useState, type FormEvent } from "react"
import { useI18n } from "@saturn/hooks"
import { FormDialog, FormFieldItem } from "@/components/ui/form-drawer"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ScopePicker } from "@/components/scope-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react"

export interface OAuthClientFormValues {
  name: string
  description: string
  redirectUris: string[]
  allowedScopes: string[]
  tokenEndpointAuthMethod: string
  refreshTokenPolicy: string
}

export interface EditableOAuthClient {
  id?: string
  name?: string
  description?: string
  redirectUris?: string[]
  allowedScopes?: string[]
  tokenEndpointAuthMethod?: string
  refreshTokenPolicy?: string
}

interface OAuthClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialClient: EditableOAuthClient | null
  isPending: boolean
  onSubmit: (values: OAuthClientFormValues) => Promise<void>
}

export function OAuthClientDialog({
  open,
  onOpenChange,
  initialClient,
  isPending,
  onSubmit,
}: OAuthClientDialogProps) {
  if (!open) {
    return null
  }
  return (
    <OAuthClientDialogInner
      key={initialClient?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      initialClient={initialClient}
      isPending={isPending}
      onSubmit={onSubmit}
    />
  )
}

function OAuthClientDialogInner({
  open,
  onOpenChange,
  initialClient,
  isPending,
  onSubmit,
}: OAuthClientDialogProps) {
  const { t } = useI18n()
  const [name, setName] = useState(initialClient?.name || "")
  const [description, setDescription] = useState(
    initialClient?.description || ""
  )
  const [redirectUrisText, setRedirectUrisText] = useState(
    (initialClient?.redirectUris ?? []).join("\n")
  )
  const [authMethod, setAuthMethod] = useState(
    initialClient?.tokenEndpointAuthMethod || "client_secret_basic"
  )
  const [refreshPolicy, setRefreshPolicy] = useState(
    initialClient?.refreshTokenPolicy || "rotate"
  )
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    initialClient?.allowedScopes && initialClient.allowedScopes.length > 0
      ? initialClient.allowedScopes
      : ["spaces:read", "finance:read"]
  )
  const [formError, setFormError] = useState<string | null>(null)

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError(t("settings.oauth.appNameRequired"))
      return
    }
    const redirectUris = redirectUrisText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (redirectUris.length === 0) {
      setFormError(t("settings.oauth.redirectUrisRequired"))
      return
    }
    if (selectedScopes.length === 0) {
      setFormError(t("settings.oauth.allowedScopesRequired"))
      return
    }

    await onSubmit({
      name: trimmedName,
      description: description.trim(),
      redirectUris,
      allowedScopes: selectedScopes,
      tokenEndpointAuthMethod: authMethod,
      refreshTokenPolicy: refreshPolicy,
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        initialClient
          ? t("settings.oauth.editClientTitle")
          : t("settings.oauth.btnCreateClient")
      }
      description={t("settings.oauth.sheetDescription")}
      icon={<KeyRoundIcon className="h-5 w-5 text-primary" />}
      submitLabel={
        initialClient ? t("common.save") : t("settings.oauth.btnSubmitCreate")
      }
      cancelLabel={t("common.cancel")}
      isPending={isPending}
      onSubmit={handleSubmit}
    >
      {formError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {formError}
        </div>
      )}

      <FormFieldItem
        label={t("settings.oauth.appNameLabel")}
        id="oauth-client-name"
      >
        <Input
          id="oauth-client-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("settings.oauth.appNamePlaceholder")}
          disabled={isPending}
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("settings.oauth.descriptionLabel")}
        id="oauth-client-description"
        optionalText={t("common.optional")}
      >
        <Input
          id="oauth-client-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("settings.oauth.descriptionPlaceholder")}
          disabled={isPending}
        />
      </FormFieldItem>

      <div className="grid grid-cols-1 gap-4 border-t border-border/40 pt-4 sm:grid-cols-2">
        <FormFieldItem
          label={t("settings.oauth.authMethodLabel")}
          id="oauth-client-auth-method"
        >
          <Select
            value={authMethod}
            onValueChange={(val) => {
              if (val) setAuthMethod(val)
            }}
          >
            <SelectTrigger id="oauth-client-auth-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_secret_basic">
                client_secret_basic
              </SelectItem>
              <SelectItem value="client_secret_post">
                client_secret_post
              </SelectItem>
              <SelectItem value="none">
                {t("settings.oauth.authMethodNone")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormFieldItem>

        <FormFieldItem
          label={t("settings.oauth.refreshPolicyLabel")}
          id="oauth-client-refresh-policy"
        >
          <Select
            value={refreshPolicy}
            onValueChange={(val) => {
              if (val) setRefreshPolicy(val)
            }}
          >
            <SelectTrigger id="oauth-client-refresh-policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rotate">
                {t("settings.oauth.refreshPolicyRotate")}
              </SelectItem>
              <SelectItem value="persistent">
                {t("settings.oauth.refreshPolicyPersistent")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormFieldItem>
      </div>

      <FormFieldItem
        label={t("settings.oauth.redirectUrisLabel")}
        id="oauth-client-redirects"
        subtext={t("settings.oauth.redirectUrisHint")}
        className="border-t border-border/40 pt-4"
      >
        <Textarea
          id="oauth-client-redirects"
          rows={3}
          value={redirectUrisText}
          onChange={(e) => setRedirectUrisText(e.target.value)}
          placeholder={
            "https://client.example.com/oauth/callback\nhttp://127.0.0.1/callback"
          }
          className="font-mono text-xs"
          disabled={isPending}
        />
      </FormFieldItem>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <div className="text-[13px] font-medium text-foreground/90">
          {t("settings.oauth.allowedScopesLabel")}
        </div>
        <ScopePicker
          selectedScopes={selectedScopes}
          onToggleScope={toggleScope}
          showDescriptions={false}
          disabled={isPending}
        />
      </div>
    </FormDialog>
  )
}

interface OAuthClientSecretDialogProps {
  clientId: string | null
  rawSecret: string | null
  onClose: () => void
}

export function OAuthClientSecretDialog({
  clientId,
  rawSecret,
  onClose,
}: OAuthClientSecretDialogProps) {
  const { t } = useI18n()
  const [copiedField, setCopiedField] = useState<"id" | "secret" | null>(null)

  const copyValue = async (val: string, field: "id" | "secret") => {
    try {
      await navigator.clipboard.writeText(val)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Clipboard blocked
    }
  }

  return (
    <Dialog
      open={Boolean(clientId)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent mobileFullscreen={false}>
        <DialogHeader>
          <DialogTitle>{t("settings.oauth.clientSecretOnceTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.oauth.clientSecretOnceDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {clientId && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {t("settings.oauth.clientIdLabel")}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  aria-label={t("settings.oauth.clientIdLabel")}
                  value={clientId}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyValue(clientId, "id")}
                >
                  {copiedField === "id" ? (
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
          {rawSecret && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {t("settings.oauth.clientSecretLabel")}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  aria-label={t("settings.oauth.clientSecretLabel")}
                  value={rawSecret}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyValue(rawSecret, "secret")}
                >
                  {copiedField === "secret" ? (
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
