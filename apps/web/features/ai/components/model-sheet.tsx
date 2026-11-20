import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateModelMutation,
  useListProvidersQuery,
  useUpdateModelMutation,
  type Model,
  type Provider,
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
import { ChevronDownIcon } from "lucide-react"
import { useI18n } from "@saturn/hooks"

interface ModelSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: Model | null
}

function ModelSheetForm({
  model,
  providers,
  onClose,
}: {
  model?: Model | null
  providers: Provider[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const isEditing = Boolean(model?.id)

  const [providerId, setProviderId] = useState(
    model?.providerId ?? providers[0]?.id ?? ""
  )
  const [modelId, setModelId] = useState(model?.modelId ?? "")
  const [displayName, setDisplayName] = useState(model?.displayName ?? "")
  const [isEnabled, setIsEnabled] = useState(model ? model.isEnabled : true)
  const [vision, setVision] = useState(
    Boolean(model?.profile?.capabilities?.vision)
  )
  const [toolCalling, setToolCalling] = useState(
    model ? Boolean(model.profile?.capabilities?.toolCalling) : true
  )
  const [reasoning, setReasoning] = useState(
    Boolean(model?.profile?.capabilities?.reasoning)
  )
  const [thinkingEnabled, setThinkingEnabled] = useState(
    model?.config?.thinking?.enabled ??
      Boolean(model?.profile?.capabilities?.reasoning)
  )
  const [thinkingEffort, setThinkingEffort] = useState(
    model?.config?.thinking?.effort ?? "default"
  )
  const [thinkingBudget, setThinkingBudget] = useState(
    model?.config?.thinking?.budgetTokens
      ? String(model.config.thinking.budgetTokens)
      : ""
  )
  const [temperature, setTemperature] = useState(
    model?.config?.temperature !== undefined
      ? String(model.config.temperature)
      : ""
  )
  const [maxTokens, setMaxTokens] = useState(
    model?.config?.maxTokens !== undefined ? String(model.config.maxTokens) : ""
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createModel = useCreateModelMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/models"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/providers"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const updateModel = useUpdateModelMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/models"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const parsedTemp = parseFloat(temperature)
    const parsedMax = parseInt(maxTokens, 10)
    const parsedBudget = parseInt(thinkingBudget, 10)

    const payload: Model = {
      id: model?.id ?? "",
      spaceId: model?.spaceId ?? "",
      providerId,
      providerName: model?.providerName ?? "",
      providerDriver: model?.providerDriver ?? "",
      modelId: modelId.trim(),
      displayName: displayName.trim() || modelId.trim(),
      source: model?.source ?? "custom",
      isEnabled,
      profile: {
        ...model?.profile,
        capabilities: {
          toolCalling,
          vision,
          document: Boolean(model?.profile?.capabilities?.document),
          audio: Boolean(model?.profile?.capabilities?.audio),
          reasoning,
          structuredOutput: true,
          streaming: true,
        },
      },
      config: {
        ...model?.config,
        ...(!Number.isNaN(parsedTemp) && { temperature: parsedTemp }),
        ...(!Number.isNaN(parsedMax) &&
          parsedMax > 0 && { maxTokens: parsedMax }),
        thinking: {
          enabled: reasoning && thinkingEnabled,
          ...(thinkingEffort !== "default" && { effort: thinkingEffort }),
          ...(!Number.isNaN(parsedBudget) &&
            parsedBudget > 0 && { budgetTokens: parsedBudget }),
        },
      },
    }

    if (isEditing && model?.id) {
      updateModel.mutate({
        id: model.id,
        req: {
          id: model.id,
          model: payload,
          updateMask: {
            paths: [
              "display_name",
              "is_enabled",
              "profile.capabilities",
              "config",
            ],
          },
        },
      })
    } else {
      createModel.mutate({ model: payload })
    }
  }

  const isPending = createModel.isPending || updateModel.isPending

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
          <Label>{t("ai.modelSheet.provider")}</Label>
          <Select
            value={providerId}
            onValueChange={(v) => setProviderId(v ?? "")}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("ai.modelSheet.chooseProvider")}>
                {providers.find((p) => p.id === providerId)?.name ||
                  t("ai.modelSheet.chooseProvider")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id ?? ""}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mdl-id">{t("ai.modelSheet.upstreamId")}</Label>
          <Input
            id="mdl-id"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={isEditing}
            required
            placeholder={t("ai.modelSheet.upstreamPlaceholder")}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mdl-display">{t("ai.modelSheet.displayName")}</Label>
          <Input
            id="mdl-display"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder={t("ai.modelSheet.displayPlaceholder")}
          />
        </div>

        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-enabled">{t("ai.shared.enabled")}</Label>
            <Switch
              id="mdl-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-tools">{t("ai.modelSheet.toolCalling")}</Label>
            <Switch
              id="mdl-tools"
              checked={toolCalling}
              onCheckedChange={setToolCalling}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-vision">{t("ai.modelSheet.vision")}</Label>
            <Switch
              id="mdl-vision"
              checked={vision}
              onCheckedChange={setVision}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-reasoning">
              {t("ai.modelSheet.reasoning")}
            </Label>
            <Switch
              id="mdl-reasoning"
              checked={reasoning}
              onCheckedChange={(checked) => {
                setReasoning(checked)
                setThinkingEnabled(checked)
              }}
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
              <Label htmlFor="mdl-temp">{t("ai.modelSheet.temperature")}</Label>
              <Input
                id="mdl-temp"
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mdl-max-tokens">
                {t("ai.modelSheet.maxTokens")}
              </Label>
              <Input
                id="mdl-max-tokens"
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
            {reasoning && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <Label htmlFor="mdl-thinking-enabled">
                    {t("ai.modelSheet.streamThinking")}
                  </Label>
                  <Switch
                    id="mdl-thinking-enabled"
                    checked={thinkingEnabled}
                    onCheckedChange={setThinkingEnabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("ai.modelSheet.thinkingEffort")}</Label>
                  <Select
                    value={thinkingEffort}
                    onValueChange={(v) => setThinkingEffort(v ?? "default")}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("ai.modelSheet.providerDefault")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {t("ai.modelSheet.providerDefault")}
                      </SelectItem>
                      <SelectItem value="low">
                        {t("ai.modelSheet.effortLow")}
                      </SelectItem>
                      <SelectItem value="medium">
                        {t("ai.modelSheet.effortMedium")}
                      </SelectItem>
                      <SelectItem value="high">
                        {t("ai.modelSheet.effortHigh")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mdl-thinking-budget">
                    {t("ai.modelSheet.thinkingBudget")}
                  </Label>
                  <Input
                    id="mdl-thinking-budget"
                    type="number"
                    min={0}
                    placeholder={t("ai.modelSheet.budgetPlaceholder")}
                    value={thinkingBudget}
                    onChange={(e) => setThinkingBudget(e.target.value)}
                  />
                </div>
              </>
            )}
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
              : t("ai.modelSheet.registerModel")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ModelSheet({ open, onOpenChange, model }: ModelSheetProps) {
  const { t } = useI18n()
  const { data: providersData } = useListProvidersQuery({})
  const providers = providersData?.providers ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="pr-8 text-base font-semibold">
            {model?.id
              ? t("ai.modelSheet.editTitle", { name: model.displayName ?? "" })
              : t("ai.modelSheet.registerTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("ai.modelSheet.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ModelSheetForm
            key={model?.id ?? "new"}
            model={model}
            providers={providers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
