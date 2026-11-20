import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateAPIKeyMutation,
  useDeleteAPIKeyMutation,
  useListAPIKeysQuery,
  useUpdateAPIKeyMutation,
  type APIKey,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { type TranslationKey } from "@saturn/i18n"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  API_KEY_EXPIRATION_PRESETS,
  API_KEY_SCOPES,
  API_KEY_SCOPE_GROUPS,
  CreateAPIKeySchema,
  UpdateAPIKeySchema,
  type APIKeyExpirationPreset,
  type APIKeyScope,
} from "@saturn/schemas"
import { useMySpaces } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"

const PRESET_LABEL_KEYS: Record<APIKeyExpirationPreset, TranslationKey> = {
  "30d": "settings.apiKeys.preset30d",
  "90d": "settings.apiKeys.preset90d",
  "1y": "settings.apiKeys.preset1y",
  custom: "settings.apiKeys.presetCustom",
  none: "settings.apiKeys.presetNone",
}

const SCOPE_GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  spaces: "settings.apiKeys.groupSpaces",
  finance: "settings.apiKeys.groupFinance",
  calendar: "settings.apiKeys.groupCalendar",
  mail: "settings.apiKeys.groupMail",
  ai: "settings.apiKeys.groupAi",
  workflows: "settings.apiKeys.groupWorkflows",
}

const SCOPE_LABEL_KEYS: Record<APIKeyScope, TranslationKey> = {
  "spaces:read": "settings.apiKeys.scopeSpacesRead",
  "finance:read": "settings.apiKeys.scopeFinanceRead",
  "finance:write": "settings.apiKeys.scopeFinanceWrite",
  "calendar:read": "settings.apiKeys.scopeCalendarRead",
  "calendar:write": "settings.apiKeys.scopeCalendarWrite",
  "mail:read": "settings.apiKeys.scopeMailRead",
  "mail:write": "settings.apiKeys.scopeMailWrite",
  "ai:read": "settings.apiKeys.scopeAiRead",
  "ai:execute": "settings.apiKeys.scopeAiExecute",
  "ai:write": "settings.apiKeys.scopeAiWrite",
  "workflows:read": "settings.apiKeys.scopeWorkflowsRead",
  "workflows:execute": "settings.apiKeys.scopeWorkflowsExecute",
  "workflows:write": "settings.apiKeys.scopeWorkflowsWrite",
}

const SCOPE_DESC_KEYS: Record<APIKeyScope, TranslationKey> = {
  "spaces:read": "settings.apiKeys.scopeDescSpacesRead",
  "finance:read": "settings.apiKeys.scopeDescFinanceRead",
  "finance:write": "settings.apiKeys.scopeDescFinanceWrite",
  "calendar:read": "settings.apiKeys.scopeDescCalendarRead",
  "calendar:write": "settings.apiKeys.scopeDescCalendarWrite",
  "mail:read": "settings.apiKeys.scopeDescMailRead",
  "mail:write": "settings.apiKeys.scopeDescMailWrite",
  "ai:read": "settings.apiKeys.scopeDescAiRead",
  "ai:execute": "settings.apiKeys.scopeDescAiExecute",
  "ai:write": "settings.apiKeys.scopeDescAiWrite",
  "workflows:read": "settings.apiKeys.scopeDescWorkflowsRead",
  "workflows:execute": "settings.apiKeys.scopeDescWorkflowsExecute",
  "workflows:write": "settings.apiKeys.scopeDescWorkflowsWrite",
}

function computeExpirationISO(
  preset: APIKeyExpirationPreset,
  customDate: string,
  tz: ReturnType<typeof useTimezone>
): string | undefined {
  if (preset === "none") return undefined
  if (preset === "custom") {
    if (!customDate) return undefined
    const parsed = tz.endOfDay(customDate)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  const match = API_KEY_EXPIRATION_PRESETS.find((p) => p.id === preset)
  if (!match?.days) return undefined
  const target = new Date(tz.now().getTime() + match.days * 24 * 60 * 60 * 1000)
  return target.toISOString()
}

export function APIKeysSettings() {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { t } = useI18n()
  const { spaces } = useMySpaces()
  const { data, isLoading } = useListAPIKeysQuery({})
  const createMutation = useCreateAPIKeyMutation()
  const updateMutation = useUpdateAPIKeyMutation()
  const deleteMutation = useDeleteAPIKeyMutation()

  const spaceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const sp of spaces) {
      if (sp.id) {
        map.set(sp.id, sp.name || sp.id)
      }
    }
    return map
  }, [spaces])

  // Create / Edit drawer state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<APIKey | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [expirationPreset, setExpirationPreset] =
    useState<APIKeyExpirationPreset>("90d")
  const [customDate, setCustomDate] = useState("")
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [selectedScopes, setSelectedScopes] = useState<APIKeyScope[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  // One-time secret reveal dialog
  const [revealedKey, setRevealedKey] = useState<APIKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete confirmation dialog
  const [keyToDelete, setKeyToDelete] = useState<APIKey | null>(null)

  const apiKeys = data?.apiKeys ?? []

  const openCreateSheet = () => {
    setEditingKey(null)
    setName("")
    setDescription("")
    setExpirationPreset("90d")
    setCustomDate("")
    setSelectedSpaceIds(
      spaces.length === 1 && spaces[0]?.id ? [spaces[0].id] : []
    )
    setSelectedScopes(["spaces:read"])
    setFormError(null)
    setSheetOpen(true)
  }

  const openEditSheet = (key: APIKey) => {
    setEditingKey(key)
    setName(key.name || "")
    setDescription(key.description || "")
    setSelectedSpaceIds(key.spaceIds ?? [])
    setSelectedScopes((key.scopes ?? []) as APIKeyScope[])
    setFormError(null)
    setSheetOpen(true)
  }

  const toggleSpace = (id: string) => {
    setSelectedSpaceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const toggleScope = (scope: APIKeyScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((item) => item !== scope)
        : [...prev, scope]
    )
  }

  const allScopesSelected = API_KEY_SCOPES.every((s) =>
    selectedScopes.includes(s)
  )

  const toggleAllScopes = () => {
    if (allScopesSelected) {
      setSelectedScopes([])
    } else {
      setSelectedScopes([...API_KEY_SCOPES])
    }
  }

  const invalidateAPIKeyQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/api-keys"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/spaces"],
      }),
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0]
          return (
            typeof key === "string" &&
            key.startsWith("/api/v1/spaces/") &&
            key.endsWith("/api-keys")
          )
        },
      }),
    ])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (editingKey?.id) {
      const parsed = UpdateAPIKeySchema.safeParse({
        name,
        description,
        scopes: selectedScopes,
        spaceIds: selectedSpaceIds,
      })
      if (!parsed.success) {
        setFormError(
          parsed.error.issues[0]?.message ||
            t("settings.apiKeys.checkFormInputs")
        )
        return
      }
      try {
        await updateMutation.mutateAsync({
          id: editingKey.id,
          req: {
            id: editingKey.id,
            apiKey: {
              name: parsed.data.name,
              description: parsed.data.description || "",
              scopes: parsed.data.scopes,
              spaceIds: parsed.data.spaceIds,
            },
            updateMask: {
              paths: ["name", "description", "scopes", "space_ids"],
            },
          },
        })
        await invalidateAPIKeyQueries()
        setSheetOpen(false)
        toast.add({
          type: "success",
          title: t("settings.apiKeys.editOk"),
          description: t("settings.apiKeys.editOkDesc", {
            name: parsed.data.name,
          }),
        })
      } catch (err: unknown) {
        setFormError(
          err instanceof Error
            ? err.message
            : t("settings.apiKeys.editOkFailed")
        )
      }
      return
    }

    const expiresAt = computeExpirationISO(expirationPreset, customDate, tz)
    if (expirationPreset === "custom" && !expiresAt) {
      setFormError(t("settings.apiKeys.customDateInvalid"))
      return
    }

    const parsed = CreateAPIKeySchema.safeParse({
      name,
      description,
      scopes: selectedScopes,
      spaceIds: selectedSpaceIds,
      expiresAt,
    })
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message || t("settings.apiKeys.checkFormInputs")
      )
      return
    }

    try {
      const created = await createMutation.mutateAsync({
        apiKey: {
          name: parsed.data.name,
          description: parsed.data.description || "",
          scopes: parsed.data.scopes,
          spaceIds: parsed.data.spaceIds,
          ...(parsed.data.expiresAt
            ? { expiresAt: parsed.data.expiresAt }
            : {}),
        },
      })
      await invalidateAPIKeyQueries()
      setSheetOpen(false)
      setCopied(false)
      setRevealedKey(created)
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : t("settings.apiKeys.createFailed")
      )
    }
  }

  const handleDeleteConfirm = async () => {
    if (!keyToDelete?.id) return
    try {
      await deleteMutation.mutateAsync({
        id: keyToDelete.id,
        req: { id: keyToDelete.id },
      })
      await invalidateAPIKeyQueries()
      setKeyToDelete(null)
      toast.add({
        type: "success",
        title: t("settings.apiKeys.revokeOk"),
        description: t("settings.apiKeys.revokeOkDesc"),
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("settings.apiKeys.revokeFailed"),
        description:
          err instanceof Error
            ? err.message
            : t("settings.apiKeys.revokeFailedDesc"),
      })
    }
  }

  const handleCopySecret = async () => {
    if (!revealedKey?.rawKey) return
    try {
      await navigator.clipboard.writeText(revealedKey.rawKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.add({
        type: "error",
        title: t("settings.apiKeys.copyFailed"),
        description: t("settings.apiKeys.copyFailedDesc"),
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <KeyIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {t("settings.apiKeys.title")}
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {apiKeys.length}{" "}
                {apiKeys.length === 1
                  ? t("settings.apiKeys.badgeOneKey")
                  : t("settings.apiKeys.badgeKeys")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.apiKeys.desc")}
            </p>
          </div>
        </div>
        <Button onClick={openCreateSheet} size="sm">
          <PlusIcon className="mr-1.5 h-4 w-4" />
          {t("settings.apiKeys.btnCreate")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/40 py-12">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
          <KeyIcon className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {t("settings.apiKeys.emptyTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.apiKeys.emptyDesc")}
          </p>
          <Button
            onClick={openCreateSheet}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            {t("settings.apiKeys.btnCreateFirst")}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-xs">
          {apiKeys.map((apiKey) => {
            const grantedIds = apiKey.spaceIds ?? []
            return (
              <div
                key={apiKey.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {apiKey.name}
                    </span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {apiKey.keyPrefix}...
                    </code>
                    {grantedIds.length === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangleIcon className="h-3 w-3" />
                        {t("settings.apiKeys.noActiveSpaces")}
                      </span>
                    )}
                  </div>

                  {apiKey.description && (
                    <p className="text-xs text-muted-foreground">
                      {apiKey.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {grantedIds.map((sid) => (
                      <span
                        key={sid}
                        className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground"
                      >
                        {spaceNameMap.get(sid) || sid}
                      </span>
                    ))}
                    {(apiKey.scopes ?? []).map((scope) => (
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
                      {apiKey.lastUsedAt
                        ? tz.formatDateTime(apiKey.lastUsedAt)
                        : t("settings.apiKeys.neverUsed")}
                    </span>
                    <span>
                      {t("settings.apiKeys.expiresLabel")}{" "}
                      {apiKey.expiresAt
                        ? tz.formatDate(apiKey.expiresAt)
                        : t("settings.apiKeys.expiresNever")}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => openEditSheet(apiKey)}
                    aria-label={t("settings.apiKeys.ariaEditKey", {
                      name: apiKey.name ?? "",
                    })}
                  >
                    <PencilIcon className="mr-1 h-3 w-3" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setKeyToDelete(apiKey)}
                    aria-label={t("settings.apiKeys.ariaRevokeKey", {
                      name: apiKey.name ?? "",
                    })}
                  >
                    <Trash2Icon className="mr-1 h-3 w-3" />
                    {t("settings.apiKeys.revoke")}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12">
              <DialogTitle>
                {editingKey
                  ? t("settings.apiKeys.editDialogTitle")
                  : t("settings.apiKeys.createTitle")}
              </DialogTitle>
              <DialogDescription>
                {editingKey
                  ? t("settings.apiKeys.editDialogDesc")
                  : t("settings.apiKeys.createDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <ShieldAlertIcon className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="api-key-name">
                  {t("settings.apiKeys.name")}
                </Label>
                <Input
                  id="api-key-name"
                  placeholder={t("settings.apiKeys.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key-desc">
                  {t("settings.apiKeys.descriptionOptional")}
                </Label>
                <Textarea
                  id="api-key-desc"
                  rows={2}
                  placeholder={t("settings.apiKeys.descPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {!editingKey && (
                <div className="space-y-2">
                  <Label htmlFor="api-key-expiration">
                    {t("settings.apiKeys.expiration")}
                  </Label>
                  <Select
                    value={expirationPreset}
                    onValueChange={(val) =>
                      setExpirationPreset(val as APIKeyExpirationPreset)
                    }
                  >
                    <SelectTrigger id="api-key-expiration">
                      <SelectValue>
                        {t(PRESET_LABEL_KEYS[expirationPreset])}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {API_KEY_EXPIRATION_PRESETS.map((preset) => (
                        <SelectItem
                          key={preset.id}
                          value={preset.id}
                          label={t(PRESET_LABEL_KEYS[preset.id])}
                        >
                          {t(PRESET_LABEL_KEYS[preset.id])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {expirationPreset === "custom" && (
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      aria-label={t("settings.apiKeys.customAria")}
                    />
                  )}
                </div>
              )}

              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <Label>
                    {t("settings.apiKeys.workspaceGrants", {
                      count: selectedSpaceIds.length,
                    })}
                  </Label>
                  {spaces.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        setSelectedSpaceIds(
                          selectedSpaceIds.length === spaces.length
                            ? []
                            : spaces
                                .map((s) => s.id)
                                .filter((id): id is string => Boolean(id))
                        )
                      }
                    >
                      {selectedSpaceIds.length === spaces.length
                        ? t("settings.apiKeys.clearAll")
                        : t("settings.apiKeys.selectAll")}
                    </Button>
                  )}
                </div>
                <div className="space-y-2 pt-1">
                  {spaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("settings.apiKeys.noWorkspaces")}
                    </p>
                  ) : (
                    spaces.map((sp) => {
                      const sid = sp.id || ""
                      const checked = selectedSpaceIds.includes(sid)
                      return (
                        <label
                          key={sid}
                          className="flex cursor-pointer items-center gap-2.5 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSpace(sid)}
                          />
                          <span className="font-medium text-foreground">
                            {sp.name}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <Label>
                    {t("settings.apiKeys.permissionScopes", {
                      count: selectedScopes.length,
                    })}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={toggleAllScopes}
                  >
                    {allScopesSelected
                      ? t("settings.apiKeys.deselectAll")
                      : t("settings.apiKeys.selectAll")}
                  </Button>
                </div>
                <div className="space-y-3 pt-1">
                  {API_KEY_SCOPE_GROUPS.map((group) => (
                    <div key={group.id} className="space-y-1.5">
                      <div className="text-xs font-semibold text-foreground">
                        {t(
                          SCOPE_GROUP_LABEL_KEYS[group.id] ?? "common.unknown"
                        )}
                      </div>
                      <div className="space-y-1.5 pl-1">
                        {group.scopes.map((meta) => {
                          const checked = selectedScopes.includes(meta.scope)
                          return (
                            <label
                              key={meta.scope}
                              className="flex cursor-pointer items-start gap-2.5"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleScope(meta.scope)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-foreground">
                                    {t(SCOPE_LABEL_KEYS[meta.scope])}
                                  </span>
                                  <code className="font-mono text-[10px] text-muted-foreground">
                                    {meta.scope}
                                  </code>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {t(SCOPE_DESC_KEYS[meta.scope])}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-0 shrink-0 flex-row justify-end border-t border-border/60 bg-card px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingKey
                  ? t("settings.apiKeys.btnSaveChanges")
                  : t("settings.apiKeys.btnCreateKey")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-Time Secret Reveal Dialog */}
      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => !open && setRevealedKey(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="pr-8">
            <DialogTitle>{t("settings.apiKeys.revealTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.apiKeys.revealDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("settings.apiKeys.revealAmber")}</span>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Input
                readOnly
                value={revealedKey?.rawKey || ""}
                className="min-w-0 flex-1 font-mono text-xs"
                aria-label={t("settings.apiKeys.ariaGeneratedSecret")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleCopySecret}
              >
                {copied ? (
                  <>
                    <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    {t("settings.apiKeys.btnCopied")}
                  </>
                ) : (
                  <>
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.apiKeys.btnCopy")}
                  </>
                )}
              </Button>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("settings.apiKeys.usageExample")}
              </Label>
              <pre className="max-w-full overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-foreground">
                {`curl -H "Authorization: Bearer ${revealedKey?.rawKey || ""}" \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/finance/budgets`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
      >
        <DialogContent mobileFullscreen={false}>
          <DialogHeader className="pr-8">
            <DialogTitle>{t("settings.apiKeys.revokeDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.apiKeys.revokeDialogQ1")}{" "}
              <span className="font-semibold text-foreground">
                {keyToDelete?.name}
              </span>
              {t("settings.apiKeys.revokeDialogQ2")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyToDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("settings.apiKeys.btnRevokeKey")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
