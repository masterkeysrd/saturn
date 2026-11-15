import { useState } from "react"
import {
  CRON_PRESETS,
  isValidCronExpression,
  summarizeCron,
  discoverVariablesAtStep,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import { useCreateAPIKeyMutation } from "@saturn/api/gen/saturn/identity/v1/identity"
import type {
  Catalog_TriggerTopic,
  Flow_Trigger,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { VariablePickerInput } from "./variable-picker-input"
import { toast } from "@/components/ui/toast"
import { Copy, Key, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react"

interface TriggerEditorCardProps {
  trigger: Flow_Trigger
  index: number
  topics: Catalog_TriggerTopic[]
  onChange: (next: Flow_Trigger) => void
  onRemove: () => void
}

export function TriggerEditorCard({
  trigger,
  index,
  topics,
  onChange,
  onRemove,
}: TriggerEditorCardProps) {
  const tz = useTimezone()
  const { spaceId } = useActiveSpaceContext()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState(
    `${trigger.name || "Webhook"} Key`
  )

  const createAPIKeyMutation = useCreateAPIKeyMutation()

  const cfg = trigger.config ?? {}
  const selectedTopic = topics.find((t) => t.topic === cfg.topic)
  const triggerVars = discoverVariablesAtStep({
    steps: [],
    triggerPayloadSchema: selectedTopic?.payloadSchema,
  }).filter((v) => v.group === "trigger" || v.group === "space")

  const webhookUrl = trigger.id
    ? `${window.location.origin}/api/v1/platform/workflows/triggers/${trigger.id}:webhook`
    : "(Save workflow to generate trigger webhook URL)"

  const curlSnippet = trigger.id
    ? `curl -X POST "${webhookUrl}" \\\n  -H "Authorization: Bearer sat_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event": "sample"}'`
    : ""

  const mappingEntries = Object.entries(cfg.inputMapping ?? {})

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({
        title: "Copied",
        description: `${label} copied to clipboard.`,
        type: "success",
      })
    } catch {
      toast.add({
        title: "Copy failed",
        description: "Clipboard access is unavailable.",
        type: "error",
      })
    }
  }

  const handleMintKey = async () => {
    if (!spaceId) return
    try {
      const created = await createAPIKeyMutation.mutateAsync({
        apiKey: {
          name: newKeyName.trim() || "Workflow Webhook Key",
          description: "Workflow webhook trigger key",
          scopes: ["workflows:execute"],
          spaceIds: [spaceId],
        },
      })
      setCreatedRawKey(created.rawKey ?? null)
    } catch (err) {
      toast.add({
        title: "Failed to create API key",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      })
    }
  }

  const cronValue = cfg.cron ?? ""
  const cronValid = !cronValue || isValidCronExpression(cronValue)

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Trigger Name
          </Label>
          <Input
            value={trigger.name}
            onChange={(e) => onChange({ ...trigger, name: e.target.value })}
            placeholder={`Trigger ${index + 1}`}
            aria-label={`Trigger ${index + 1} name`}
            className="h-9 rounded-xl text-xs font-semibold"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between py-1 text-xs font-medium text-foreground">
          <span>Trigger Enabled</span>
          <Switch
            checked={trigger.isEnabled}
            onCheckedChange={(checked) =>
              onChange({ ...trigger, isEnabled: Boolean(checked) })
            }
            aria-label={`Toggle trigger ${trigger.name}`}
          />
        </label>
      </div>

      {trigger.type === "event" && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Domain Event Topic
            </Label>
            <Select
              value={cfg.topic ?? ""}
              onValueChange={(topic) =>
                onChange({
                  ...trigger,
                  config: { ...cfg, topic: topic ?? "" },
                })
              }
            >
              <SelectTrigger className="h-9 rounded-xl font-mono text-xs">
                <SelectValue placeholder="Select domain event topic">
                  {cfg.topic || "Select domain event topic"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {topics.map((t) => (
                  <SelectItem
                    key={t.topic ?? ""}
                    value={t.topic ?? ""}
                    className="font-mono text-xs"
                  >
                    {t.topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTopic?.description && (
              <p className="text-[11px] text-muted-foreground">
                {selectedTopic.description}
              </p>
            )}
          </div>
        </div>
      )}

      {trigger.type === "webhook" && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Webhook Endpoint
            </Label>
            <div className="flex items-center gap-1.5">
              {trigger.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(webhookUrl, "Webhook URL")}
                  className="h-7 gap-1 rounded-lg px-2 text-xs"
                >
                  <Copy className="h-3 w-3" />
                  Copy URL
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCreatedRawKey(null)
                  setKeyDialogOpen(true)
                }}
                className="h-7 gap-1 rounded-lg px-2 text-xs"
              >
                <Key className="h-3 w-3" />
                Create API Key
              </Button>
            </div>
          </div>

          <code className="block rounded-xl bg-muted/50 px-3 py-2 font-mono text-[11px] break-all text-foreground">
            {webhookUrl}
          </code>

          {curlSnippet && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  cURL Example
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(curlSnippet, "cURL snippet")}
                  className="h-6 gap-1 rounded-md px-2 text-[11px]"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-xl bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">
                {curlSnippet}
              </pre>
            </div>
          )}
        </div>
      )}

      {trigger.type === "schedule" && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Schedule Preset
            </Label>
            <Select
              value={
                CRON_PRESETS.find((p) => p.cron === cronValue)?.cron ?? "custom"
              }
              onValueChange={(val) => {
                if (val && val !== "custom") {
                  onChange({
                    ...trigger,
                    config: { ...cfg, cron: val },
                  })
                }
              }}
            >
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue>
                  {CRON_PRESETS.find((p) => p.cron === cronValue)?.label ??
                    "Custom Cron Expression"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.cron} className="text-xs">
                    {p.label} ({p.cron})
                  </SelectItem>
                ))}
                <SelectItem value="custom" className="text-xs">
                  Custom Expression
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Cron Expression ({tz.timezone})
            </Label>
            <Input
              value={cronValue}
              onChange={(e) =>
                onChange({
                  ...trigger,
                  config: { ...cfg, cron: e.target.value },
                })
              }
              placeholder="0 9 * * 1-5"
              className="h-9 rounded-xl font-mono text-xs"
            />
            <p
              className={`text-[11px] ${cronValid ? "text-muted-foreground" : "text-destructive"}`}
            >
              {cronValue
                ? cronValid
                  ? summarizeCron(cronValue, tz.timezone)
                  : "Invalid 5-field cron expression"
                : `Evaluated in workspace timezone (${tz.timezone})`}
            </p>
          </div>
        </div>
      )}

      {/* Progressive Disclosure: Advanced CEL Filter & Input Mapping */}
      <div className="border-t border-border/40 pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full cursor-pointer items-center justify-between py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <span>
            Advanced (Filter &amp; Input Mapping
            {mappingEntries.length > 0 ? ` • ${mappingEntries.length}` : ""})
          </span>
          {advancedOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4">
            {trigger.type === "event" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  CEL Pre-Filter
                </Label>
                <VariablePickerInput
                  value={cfg.filter ?? ""}
                  onChange={(filter) =>
                    onChange({
                      ...trigger,
                      config: { ...cfg, filter: filter || undefined },
                    })
                  }
                  variables={triggerVars}
                  rawMode
                  placeholder="trigger.data.amount > 0"
                  ariaLabel="Trigger CEL filter"
                />
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Input Mapping
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const nextKey = `field_${mappingEntries.length + 1}`
                    onChange({
                      ...trigger,
                      config: {
                        ...cfg,
                        inputMapping: {
                          ...(cfg.inputMapping ?? {}),
                          [nextKey]: "{{ trigger.data }}",
                        },
                      },
                    })
                  }}
                  className="h-7 gap-1 rounded-lg px-2 text-xs text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Mapping
                </Button>
              </div>

              {mappingEntries.map(([key, rawVal], mIdx) => (
                <div
                  key={`${key}-${mIdx}`}
                  className="space-y-2 border-l-2 border-border/50 pl-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={key}
                      onChange={(e) => {
                        const next = { ...(cfg.inputMapping ?? {}) }
                        delete next[key]
                        next[e.target.value] = rawVal
                        onChange({
                          ...trigger,
                          config: { ...cfg, inputMapping: next },
                        })
                      }}
                      placeholder="input_key"
                      className="h-8 flex-1 rounded-lg font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        const next = { ...(cfg.inputMapping ?? {}) }
                        delete next[key]
                        onChange({
                          ...trigger,
                          config: {
                            ...cfg,
                            inputMapping:
                              Object.keys(next).length > 0 ? next : undefined,
                          },
                        })
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <VariablePickerInput
                    value={
                      typeof rawVal === "string"
                        ? rawVal
                        : JSON.stringify(rawVal)
                    }
                    onChange={(nextVal) =>
                      onChange({
                        ...trigger,
                        config: {
                          ...cfg,
                          inputMapping: {
                            ...(cfg.inputMapping ?? {}),
                            [key]: nextVal,
                          },
                        },
                      })
                    }
                    variables={triggerVars}
                    placeholder="{{ trigger.data.field }}"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-8 gap-1.5 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove Trigger
        </Button>
      </div>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Webhook API Key</DialogTitle>
            <DialogDescription>
              Mints a Space-scoped API key with the{" "}
              <code>workflows:execute</code> scope for calling this webhook
              externally.
            </DialogDescription>
          </DialogHeader>

          {createdRawKey ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-amber-500">
                Copy this key now. It will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-muted px-3 py-2 font-mono text-xs break-all">
                  {createdRawKey}
                </code>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCopy(createdRawKey, "API Key")}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">API Key Name</Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Webhook Trigger Key"
                className="rounded-xl"
              />
            </div>
          )}

          <DialogFooter>
            {createdRawKey ? (
              <Button
                type="button"
                onClick={() => setKeyDialogOpen(false)}
                className="rounded-xl"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setKeyDialogOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleMintKey}
                  disabled={createAPIKeyMutation.isPending}
                  className="rounded-xl"
                >
                  Create Key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
