import { useState } from "react"
import {
  CRON_PRESETS,
  isValidCronExpression,
  discoverVariablesAtStep,
} from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
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
import { CRON_PRESET_LABEL_KEYS, getLocalizedCronSummary } from "./cron-label"
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
  const { t } = useI18n()
  const tz = useTimezone()
  const { spaceId } = useActiveSpaceContext()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState(
    trigger.name ? `${trigger.name} Key` : ""
  )

  const createAPIKeyMutation = useCreateAPIKeyMutation()

  const cfg = trigger.config ?? {}
  const selectedTopic = topics.find((topic) => topic.topic === cfg.topic)
  const triggerVars = discoverVariablesAtStep({
    steps: [],
    triggerPayloadSchema: selectedTopic?.payloadSchema,
  }).filter((v) => v.group === "trigger" || v.group === "space")

  const webhookUrl = trigger.id
    ? `${window.location.origin}/api/v1/platform/workflows/triggers/${trigger.id}:webhook`
    : t("workflows.trigger.webhookUnsaved")

  const curlSnippet = trigger.id
    ? `curl -X POST "${webhookUrl}" \\\n  -H "Authorization: Bearer sat_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event": "sample"}'`
    : ""

  const mappingEntries = Object.entries(cfg.inputMapping ?? {})

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({
        title: t("workflows.trigger.copied"),
        description: t("workflows.trigger.copiedDescription", { label }),
        type: "success",
      })
    } catch {
      toast.add({
        title: t("workflows.trigger.copyFailed"),
        description: t("workflows.trigger.clipboardUnavailable"),
        type: "error",
      })
    }
  }

  const handleMintKey = async () => {
    if (!spaceId) return
    try {
      const created = await createAPIKeyMutation.mutateAsync({
        apiKey: {
          name: newKeyName.trim() || t("workflows.trigger.keyDefaultName"),
          description: t("workflows.trigger.keyDescription"),
          scopes: ["workflows:execute"],
          spaceIds: [spaceId],
        },
      })
      setCreatedRawKey(created.rawKey ?? null)
    } catch (err) {
      toast.add({
        title: t("workflows.trigger.keyCreateFailed"),
        description:
          err instanceof Error ? err.message : t("workflows.unknownError"),
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
            {t("workflows.trigger.name")}
          </Label>
          <Input
            value={trigger.name}
            onChange={(e) => onChange({ ...trigger, name: e.target.value })}
            placeholder={t("workflows.trigger.namePlaceholder", {
              index: index + 1,
            })}
            aria-label={t("workflows.trigger.nameAria", { index: index + 1 })}
            className="h-9 rounded-xl text-xs font-semibold"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between py-1 text-xs font-medium text-foreground">
          <span>{t("workflows.trigger.enabled")}</span>
          <Switch
            checked={trigger.isEnabled}
            onCheckedChange={(checked) =>
              onChange({ ...trigger, isEnabled: Boolean(checked) })
            }
            aria-label={t("workflows.trigger.toggleAria", {
              name: trigger.name,
            })}
          />
        </label>
      </div>

      {trigger.type === "event" && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {t("workflows.trigger.topic")}
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
                <SelectValue placeholder={t("workflows.trigger.selectTopic")}>
                  {cfg.topic || t("workflows.trigger.selectTopic")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {topics.map((topic) => (
                  <SelectItem
                    key={topic.topic ?? ""}
                    value={topic.topic ?? ""}
                    className="font-mono text-xs"
                  >
                    {topic.topic}
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
              {t("workflows.trigger.webhookEndpoint")}
            </Label>
            <div className="flex items-center gap-1.5">
              {trigger.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleCopy(
                      webhookUrl,
                      t("workflows.trigger.labelWebhookUrl")
                    )
                  }
                  className="h-7 gap-1 rounded-lg px-2 text-xs"
                >
                  <Copy className="h-3 w-3" />
                  {t("workflows.trigger.copyUrl")}
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
                {t("workflows.trigger.createApiKey")}
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
                  {t("workflows.trigger.curlExample")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleCopy(curlSnippet, t("workflows.trigger.labelCurl"))
                  }
                  className="h-6 gap-1 rounded-md px-2 text-[11px]"
                >
                  <Copy className="h-3 w-3" />
                  {t("workflows.trigger.copy")}
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
              {t("workflows.trigger.schedulePreset")}
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
                  {(() => {
                    const preset = CRON_PRESETS.find(
                      (p) => p.cron === cronValue
                    )
                    return preset
                      ? t(CRON_PRESET_LABEL_KEYS[preset.id])
                      : t("workflows.trigger.customCron")
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.cron} className="text-xs">
                    {t(CRON_PRESET_LABEL_KEYS[p.id])} ({p.cron})
                  </SelectItem>
                ))}
                <SelectItem value="custom" className="text-xs">
                  {t("workflows.trigger.customExpression")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              {t("workflows.trigger.cronExpression", {
                timezone: tz.timezone,
              })}
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
                  ? getLocalizedCronSummary(cronValue, tz.timezone, t)
                  : t("workflows.trigger.cronInvalid")
                : t("workflows.trigger.cronTimezoneNote", {
                    timezone: tz.timezone,
                  })}
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
            {mappingEntries.length > 0
              ? t("workflows.trigger.advancedCount", {
                  count: mappingEntries.length,
                })
              : t("workflows.trigger.advanced")}
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
                  {t("workflows.trigger.celFilter")}
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
                  ariaLabel={t("workflows.trigger.celFilterAria")}
                />
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {t("workflows.trigger.inputMapping")}
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
                  {t("workflows.trigger.addMapping")}
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
          {t("workflows.trigger.removeTrigger")}
        </Button>
      </div>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("workflows.trigger.keyDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("workflows.trigger.keyDialogDescriptionStart")}{" "}
              <code>workflows:execute</code>{" "}
              {t("workflows.trigger.keyDialogDescriptionEnd")}
            </DialogDescription>
          </DialogHeader>

          {createdRawKey ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-amber-500">
                {t("workflows.trigger.keyWarning")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-muted px-3 py-2 font-mono text-xs break-all">
                  {createdRawKey}
                </code>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    handleCopy(
                      createdRawKey,
                      t("workflows.trigger.labelApiKey")
                    )
                  }
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {t("workflows.trigger.copy")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">
                {t("workflows.trigger.keyName")}
              </Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t("workflows.trigger.keyNamePlaceholder")}
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
                {t("common.done")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setKeyDialogOpen(false)}
                  className="rounded-xl"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={handleMintKey}
                  disabled={createAPIKeyMutation.isPending}
                  className="rounded-xl"
                >
                  {t("workflows.trigger.createKey")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
