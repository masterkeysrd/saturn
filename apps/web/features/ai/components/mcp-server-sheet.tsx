import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateMCPServerMutation,
  useUpdateMCPServerMutation,
  type MCPServer,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useI18n } from "@saturn/hooks"

interface MCPServerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: MCPServer | null
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

function MCPServerSheetForm({
  server,
  onClose,
}: {
  server?: MCPServer | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const isEditing = Boolean(server?.id)

  const [name, setName] = useState(server?.name ?? "")
  const [slug, setSlug] = useState(server?.slug ?? "")
  const [description, setDescription] = useState(server?.description ?? "")
  const [url, setUrl] = useState(server?.config?.url ?? "")
  const [authType, setAuthType] = useState(server?.config?.authType || "none")
  const [bearerToken, setBearerToken] = useState("")
  const [customHeaders, setCustomHeaders] = useState<
    Array<{ key: string; value: string }>
  >([{ key: "", value: "" }])
  const [trustReadHints, setTrustReadHints] = useState(
    server?.config?.trustReadHints ?? true
  )
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(server?.config?.timeoutSeconds ?? 30)
  )
  const [isEnabled, setIsEnabled] = useState(server ? server.isEnabled : true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createServer = useCreateMCPServerMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/mcp-servers"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const updateServer = useUpdateMCPServerMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/mcp-servers"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const normalizedHeaders: Record<string, string> = {}
    if (authType === "custom_headers") {
      for (const h of customHeaders) {
        const k = h.key.trim()
        if (k) {
          normalizedHeaders[k] = h.value
        }
      }
    }
    const hasCustomHeaders = Object.keys(normalizedHeaders).length > 0

    const payload: MCPServer = {
      id: server?.id ?? "",
      spaceId: server?.spaceId ?? "",
      isSystem: server?.isSystem ?? false,
      slug: slug || slugify(name),
      name: name.trim(),
      description: description.trim(),
      transport: server?.transport ?? "http",
      hasAuthSecret: server?.hasAuthSecret ?? false,
      isEnabled,
      config: {
        url: url.trim(),
        authType,
        trustReadHints,
        timeoutSeconds: parseInt(timeoutSeconds, 10) || 30,
      },
      ...(authType === "bearer" &&
        bearerToken.trim() && {
          authSecret: {
            bearerToken: bearerToken.trim(),
            headers: {},
          },
        }),
      ...(authType === "custom_headers" &&
        hasCustomHeaders && {
          authSecret: {
            bearerToken: "",
            headers: normalizedHeaders,
          },
        }),
    }

    if (isEditing && server?.id) {
      const paths = [
        "name",
        "description",
        "is_enabled",
        "config.trust_read_hints",
        "config.timeout_seconds",
      ]
      if (!server.isSystem) {
        paths.push("slug", "config.url", "config.auth_type")
      }
      if (authType === "bearer" && bearerToken.trim()) {
        paths.push("auth_secret.bearer_token")
      }
      if (authType === "custom_headers" && hasCustomHeaders) {
        paths.push("auth_secret.headers")
      }
      updateServer.mutate({
        id: server.id,
        req: {
          id: server.id,
          mcpServer: payload,
          updateMask: { paths },
        },
      })
    } else {
      createServer.mutate({ mcpServer: payload })
    }
  }

  const isPending = createServer.isPending || updateServer.isPending

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {errorMsg && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mcp-name">{t("ai.mcpSheet.nameLabel")}</Label>
          <Input
            id="mcp-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!isEditing) {
                setSlug(slugify(e.target.value))
              }
            }}
            required
            placeholder={t("ai.mcpSheet.namePlaceholder")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mcp-slug">{t("ai.mcpSheet.slugLabel")}</Label>
          <Input
            id="mcp-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={Boolean(server?.isSystem)}
            required
            placeholder="github"
            className="font-mono text-xs"
          />
        </div>

        {!server?.isSystem && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">{t("ai.mcpSheet.endpoint")}</Label>
              <Input
                id="mcp-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://mcp.example.com/mcp"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("ai.mcpSheet.auth")}</Label>
              <Select
                value={authType}
                onValueChange={(v) => setAuthType(v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("ai.mcpSheet.authNone")}
                  </SelectItem>
                  <SelectItem value="bearer">
                    {t("ai.mcpSheet.authBearer")}
                  </SelectItem>
                  <SelectItem value="custom_headers">
                    {t("ai.mcpSheet.authHeaders")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {authType === "bearer" && (
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token">
                  {t("ai.mcpSheet.authBearer")}{" "}
                  {!isEditing || !server?.hasAuthSecret ? "*" : ""}
                </Label>
                <Input
                  id="mcp-token"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  required={!isEditing}
                  placeholder={
                    server?.hasAuthSecret
                      ? t("ai.mcpSheet.keepToken")
                      : t("ai.mcpSheet.bearerPlaceholder")
                  }
                />
              </div>
            )}

            {authType === "custom_headers" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("ai.mcpSheet.authHeaders")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCustomHeaders((prev) => [
                        ...prev,
                        { key: "", value: "" },
                      ])
                    }
                    className="h-7 gap-1 px-2 text-xs text-primary"
                  >
                    <PlusIcon className="size-3.5" />
                    {t("ai.mcpSheet.addHeader")}
                  </Button>
                </div>
                {isEditing && server?.hasAuthSecret && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("ai.mcpSheet.keepHeaders")}
                  </p>
                )}
                <div className="space-y-2">
                  {customHeaders.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        aria-label={t("ai.mcpSheet.headerNameAria", {
                          n: idx + 1,
                        })}
                        placeholder={t("ai.mcpSheet.headerNamePlaceholder")}
                        value={header.key}
                        onChange={(e) =>
                          setCustomHeaders((prev) =>
                            prev.map((h, i) =>
                              i === idx ? { ...h, key: e.target.value } : h
                            )
                          )
                        }
                        className="font-mono text-xs"
                      />
                      <Input
                        aria-label={t("ai.mcpSheet.headerValueAria", {
                          n: idx + 1,
                        })}
                        type="password"
                        placeholder={t("ai.mcpSheet.headerValuePlaceholder")}
                        value={header.value}
                        onChange={(e) =>
                          setCustomHeaders((prev) =>
                            prev.map((h, i) =>
                              i === idx ? { ...h, value: e.target.value } : h
                            )
                          )
                        }
                        className="font-mono text-xs"
                      />
                      {customHeaders.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("ai.mcpSheet.removeHeaderAria", {
                            n: idx + 1,
                          })}
                          onClick={() =>
                            setCustomHeaders((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                        >
                          <Trash2Icon className="size-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="mcp-enabled">{t("ai.shared.enabled")}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t("ai.mcpSheet.enabledHint")}
              </p>
            </div>
            <Switch
              id="mcp-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="mcp-trust">{t("ai.mcpSheet.trustHints")}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t("ai.mcpSheet.trustHintsHint")}
              </p>
            </div>
            <Switch
              id="mcp-trust"
              checked={trustReadHints}
              onCheckedChange={setTrustReadHints}
            />
          </div>
        </div>

        <Collapsible
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          className="border-t border-border/40 pt-4"
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
            <span>{t("ai.shared.advanced")}</span>
            <ChevronDownIcon
              className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-desc">{t("ai.shared.description")}</Label>
              <Input
                id="mcp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-timeout">{t("ai.mcpSheet.timeout")}</Label>
              <Input
                id="mcp-timeout"
                type="number"
                min={1}
                max={300}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(e.target.value)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter className="shrink-0 border-t border-border/60 bg-card px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("common.saving")
            : isEditing
              ? t("ai.shared.saveChanges")
              : t("ai.mcpSheet.addServer")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function MCPServerSheet({
  open,
  onOpenChange,
  server,
}: MCPServerSheetProps) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="pr-8 text-base font-semibold">
            {server?.id
              ? t("ai.mcpSheet.editTitle", { name: server.name ?? "" })
              : t("ai.mcpSheet.addTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("ai.mcpSheet.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MCPServerSheetForm
            key={server?.id ?? "new"}
            server={server}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
