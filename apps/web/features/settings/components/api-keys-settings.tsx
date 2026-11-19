import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateAPIKeyMutation,
  useDeleteAPIKeyMutation,
  useListAPIKeysQuery,
  useUpdateAPIKeyMutation,
  type APIKey,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { useTimezone } from "@saturn/hooks"
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
          parsed.error.issues[0]?.message || "Please check the form inputs."
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
          title: "API Key Updated",
          description: `"${parsed.data.name}" has been updated.`,
        })
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : "Failed to update API key."
        )
      }
      return
    }

    const expiresAt = computeExpirationISO(expirationPreset, customDate, tz)
    if (expirationPreset === "custom" && !expiresAt) {
      setFormError("Please select a valid custom expiration date.")
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
        parsed.error.issues[0]?.message || "Please check the form inputs."
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
        err instanceof Error ? err.message : "Failed to create API key."
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
        title: "API Key Revoked",
        description: "The API key has been permanently deleted.",
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: "Failed to Revoke Key",
        description:
          err instanceof Error ? err.message : "Could not revoke API key.",
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
        title: "Copy Failed",
        description: "Unable to write to clipboard.",
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
                Personal API Keys
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {apiKeys.length} {apiKeys.length === 1 ? "Key" : "Keys"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fine-grained programmatic credentials scoped to explicit
              workspaces and permissions.
            </p>
          </div>
        </div>
        <Button onClick={openCreateSheet} size="sm">
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Create API Key
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
            No API keys yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a fine-grained API key for CLI scripts, webhooks, or external
            integrations.
          </p>
          <Button
            onClick={openCreateSheet}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Generate your first API key
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
                        No Active Spaces
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
                      Last used:{" "}
                      {apiKey.lastUsedAt
                        ? tz.formatDateTime(apiKey.lastUsedAt)
                        : "Never used"}
                    </span>
                    <span>
                      Expires:{" "}
                      {apiKey.expiresAt
                        ? tz.formatDate(apiKey.expiresAt)
                        : "No expiration"}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => openEditSheet(apiKey)}
                    aria-label={`Edit ${apiKey.name}`}
                  >
                    <PencilIcon className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setKeyToDelete(apiKey)}
                    aria-label={`Revoke ${apiKey.name}`}
                  >
                    <Trash2Icon className="mr-1 h-3 w-3" />
                    Revoke
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
                {editingKey ? "Edit API Key" : "Create Personal API Key"}
              </DialogTitle>
              <DialogDescription>
                {editingKey
                  ? "Update the key name, granted workspaces, or permission scopes."
                  : "Bind a fine-grained token to explicit workspaces and scopes."}
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
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  placeholder="e.g., Home Assistant Webhook"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key-desc">Description (optional)</Label>
                <Textarea
                  id="api-key-desc"
                  rows={2}
                  placeholder="What is this API key used for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {!editingKey && (
                <div className="space-y-2">
                  <Label htmlFor="api-key-expiration">Expiration</Label>
                  <Select
                    value={expirationPreset}
                    onValueChange={(val) =>
                      setExpirationPreset(val as APIKeyExpirationPreset)
                    }
                  >
                    <SelectTrigger id="api-key-expiration">
                      <SelectValue>
                        {API_KEY_EXPIRATION_PRESETS.find(
                          (p) => p.id === expirationPreset
                        )?.label ?? expirationPreset}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {API_KEY_EXPIRATION_PRESETS.map((preset) => (
                        <SelectItem
                          key={preset.id}
                          value={preset.id}
                          label={preset.label}
                        >
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {expirationPreset === "custom" && (
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      aria-label="Custom expiration date"
                    />
                  )}
                </div>
              )}

              <div className="space-y-2 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <Label>Workspace Grants ({selectedSpaceIds.length})</Label>
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
                        ? "Clear All"
                        : "Select All"}
                    </Button>
                  )}
                </div>
                <div className="space-y-2 pt-1">
                  {spaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No workspaces available.
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
                  <Label>Permission Scopes ({selectedScopes.length})</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={toggleAllScopes}
                  >
                    {allScopesSelected ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="space-y-3 pt-1">
                  {API_KEY_SCOPE_GROUPS.map((group) => (
                    <div key={group.id} className="space-y-1.5">
                      <div className="text-xs font-semibold text-foreground">
                        {group.label}
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
                                    {meta.label}
                                  </span>
                                  <code className="font-mono text-[10px] text-muted-foreground">
                                    {meta.scope}
                                  </code>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {meta.description}
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
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingKey ? "Save Changes" : "Create API Key"}
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
            <DialogTitle>Save Your API Key</DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. For your security, it will not
              be displayed again.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Store this secret in a password manager or environment variable.
                Anyone with this token can access the granted workspaces.
              </span>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Input
                readOnly
                value={revealedKey?.rawKey || ""}
                className="min-w-0 flex-1 font-mono text-xs"
                aria-label="Generated API key secret"
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
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Example usage
              </Label>
              <pre className="max-w-full overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-foreground">
                {`curl -H "Authorization: Bearer ${revealedKey?.rawKey || ""}" \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/finance/budgets`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
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
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently revoke{" "}
              <span className="font-semibold text-foreground">
                {keyToDelete?.name}
              </span>
              ? Any scripts or webhooks using this token will immediately fail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
