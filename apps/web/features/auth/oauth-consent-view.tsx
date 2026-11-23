import { useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import {
  useDecideOAuthConsentMutation,
  useInspectOAuthConsentQuery,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { useI18n } from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScopePicker } from "@/components/scope-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangleIcon,
  GlobeIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react"

interface OAuthConsentViewProps {
  onRedirect?: (url: string) => void
}

function ConsentSurface({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string
  subtitle: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="w-full rounded-2xl border border-border/70 bg-card p-6 shadow-xl sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      <div className="mt-6">{children}</div>
    </div>
  )
}

export function OAuthConsentView({ onRedirect }: OAuthConsentViewProps) {
  const [searchParams] = useSearchParams()
  const { t } = useI18n()

  useEffect(() => {
    document.title = `${t("settings.oauth.consentTitle")} | Saturn`
  }, [t])

  const clientId = searchParams.get("client_id") || ""
  const redirectUri = searchParams.get("redirect_uri") || ""
  const responseType = searchParams.get("response_type") || ""
  const scope = searchParams.get("scope") || ""
  const state = searchParams.get("state") || ""
  const codeChallenge = searchParams.get("code_challenge") || ""
  const codeChallengeMethod = searchParams.get("code_challenge_method") || ""
  const resource = searchParams.get("resource") || ""

  const { data, isLoading, error } = useInspectOAuthConsentQuery(
    {
      clientId,
      redirectUri,
      responseType,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      resource,
    },
    {
      enabled: Boolean(clientId && redirectUri),
      retry: false,
    }
  )

  const decideMutation = useDecideOAuthConsentMutation()

  const spaces = data?.spaces ?? []
  const [selectedSpaceId, setSelectedSpaceId] = useState("")
  const [customScopes, setCustomScopes] = useState<string[] | null>(null)
  const [decisionPending, setDecisionPending] = useState<
    "approve" | "deny" | null
  >(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const effectiveSpaceId = data?.lockedSpaceId
    ? data.lockedSpaceId
    : selectedSpaceId && spaces.some((s) => s.spaceId === selectedSpaceId)
      ? selectedSpaceId
      : (spaces[0]?.spaceId ?? "")

  const activeSpaceOption = spaces.find((s) => s.spaceId === effectiveSpaceId)

  const availableScopes =
    activeSpaceOption?.allowedScopes ?? data?.effectiveScopes ?? []

  const selectedScopes = customScopes ?? availableScopes

  const toggleScope = (s: string) => {
    const base = customScopes ?? availableScopes
    setCustomScopes(
      base.includes(s) ? base.filter((item) => item !== s) : [...base, s]
    )
  }

  const navigateCallback = (handoffToken: string) => {
    const callbackUrl = `/oauth/authorize/callback?handoff=${encodeURIComponent(handoffToken)}`
    if (onRedirect) {
      onRedirect(callbackUrl)
    } else {
      window.location.assign(callbackUrl)
    }
  }

  const handleDecision = async (approved: boolean) => {
    setSubmitError(null)
    setDecisionPending(approved ? "approve" : "deny")
    try {
      const res = await decideMutation.mutateAsync({
        clientId,
        redirectUri,
        responseType,
        scope,
        approvedScopes: approved ? selectedScopes : [],
        spaceId: approved ? effectiveSpaceId : "",
        state,
        codeChallenge,
        codeChallengeMethod,
        resource,
        approved,
      })
      if (res.handoffToken) {
        navigateCallback(res.handoffToken)
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : t("settings.oauth.consentSubmitFailed")
      )
      setDecisionPending(null)
    }
  }

  if (!clientId || !redirectUri) {
    return (
      <ConsentSurface
        title={t("settings.oauth.invalidRequestTitle")}
        subtitle={t("settings.oauth.consentMissingParams")}
      >
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangleIcon className="h-4 w-4 shrink-0" />
          <span>{t("settings.oauth.consentInvalidDesc")}</span>
        </div>
      </ConsentSurface>
    )
  }

  if (isLoading) {
    return (
      <ConsentSurface
        title={t("settings.oauth.consentTitle")}
        subtitle={t("settings.oauth.consentSubtitle")}
      >
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
        </div>
      </ConsentSurface>
    )
  }

  if (error || !data) {
    return (
      <ConsentSurface
        title={t("settings.oauth.invalidRequestTitle")}
        subtitle={
          error instanceof Error
            ? error.message
            : t("settings.oauth.consentVerifyFailed")
        }
      >
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertTriangleIcon className="h-4 w-4 shrink-0" />
          <span>
            {error instanceof Error
              ? error.message
              : t("settings.oauth.consentInvalidDesc")}
          </span>
        </div>
      </ConsentSurface>
    )
  }

  return (
    <ConsentSurface
      title={t("settings.oauth.consentTitle")}
      subtitle={t("settings.oauth.consentSubtitle")}
      badge={
        <Badge variant={data.isWorkspaceClient ? "secondary" : "outline"}>
          {data.isWorkspaceClient
            ? t("settings.oauth.workspaceAppBadge")
            : t("settings.oauth.instanceAppBadge")}
        </Badge>
      }
    >
      <div className="flex flex-col space-y-5">
        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {submitError}
          </div>
        )}

        {/* Application identity */}
        <div className="space-y-1 border-t border-border/40 pt-4">
          <div className="text-base font-semibold text-foreground">
            {data.clientName}
          </div>
          {data.clientDescription && (
            <p className="text-xs text-muted-foreground">
              {data.clientDescription}
            </p>
          )}
        </div>

        {/* Workspace & Redirect Host */}
        <div className="grid grid-cols-1 gap-4 border-t border-border/40 pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="oauth-workspace-select"
              className="text-[13px] font-medium"
            >
              {t("settings.oauth.workspaceLabel")}
            </Label>
            {data.lockedSpaceId ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-sm">
                <span className="truncate font-medium text-foreground">
                  {activeSpaceOption?.spaceName || data.lockedSpaceId}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <LockIcon className="h-3 w-3" />
                  {t("settings.oauth.workspaceLockedHint")}
                </span>
              </div>
            ) : (
              <Select
                value={effectiveSpaceId}
                onValueChange={(val) => {
                  if (val) {
                    setSelectedSpaceId(val)
                    setCustomScopes(null)
                  }
                }}
              >
                <SelectTrigger
                  id="oauth-workspace-select"
                  aria-label={t("settings.oauth.workspaceLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((sp) => (
                    <SelectItem key={sp.spaceId} value={sp.spaceId || ""}>
                      {sp.spaceName || sp.spaceId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[13px] font-medium text-foreground">
              {t("settings.oauth.redirectHostLabel")}
            </div>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-border/50 bg-muted/40 px-3 text-xs text-muted-foreground">
              <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
              <code className="truncate font-mono text-foreground">
                {data.redirectUriHost}
              </code>
            </div>
          </div>
        </div>

        {/* Interactive Scopes */}
        <div className="space-y-2.5 border-t border-border/40 pt-4">
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.oauth.scopesLabel")}
          </div>
          <ScopePicker
            scopes={availableScopes}
            selectedScopes={selectedScopes}
            onToggleScope={toggleScope}
            className="grid max-h-80 grid-cols-1 gap-2 space-y-0 overflow-y-auto pr-1 sm:grid-cols-2"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 border-t border-border/40 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="sm:min-w-28"
            disabled={decisionPending !== null}
            onClick={() => handleDecision(false)}
          >
            {decisionPending === "deny" ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                {t("settings.oauth.denying")}
              </>
            ) : (
              t("settings.oauth.btnDeny")
            )}
          </Button>
          <Button
            type="button"
            className="sm:min-w-36"
            disabled={
              decisionPending !== null ||
              !effectiveSpaceId ||
              selectedScopes.length === 0
            }
            onClick={() => handleDecision(true)}
          >
            {decisionPending === "approve" ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                {t("settings.oauth.authorizing")}
              </>
            ) : (
              t("settings.oauth.btnAuthorize")
            )}
          </Button>
        </div>
      </div>
    </ConsentSurface>
  )
}
