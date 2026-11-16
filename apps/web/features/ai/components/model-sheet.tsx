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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="space-y-4 p-5">
        {errorMsg && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Provider *</Label>
          <Select
            value={providerId}
            onValueChange={(v) => setProviderId(v ?? "")}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose provider">
                {providers.find((p) => p.id === providerId)?.name ||
                  "Choose provider"}
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
          <Label htmlFor="mdl-id">Upstream Model ID *</Label>
          <Input
            id="mdl-id"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={isEditing}
            required
            placeholder="e.g. gpt-4.1, gemini-2.5-flash"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mdl-display">Display Name *</Label>
          <Input
            id="mdl-display"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="e.g. GPT-4.1"
          />
        </div>

        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-enabled">Enabled</Label>
            <Switch
              id="mdl-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-tools">Tool Calling</Label>
            <Switch
              id="mdl-tools"
              checked={toolCalling}
              onCheckedChange={setToolCalling}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-vision">Vision (Images)</Label>
            <Switch
              id="mdl-vision"
              checked={vision}
              onCheckedChange={setVision}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mdl-reasoning">Reasoning</Label>
            <Switch
              id="mdl-reasoning"
              checked={reasoning}
              onCheckedChange={setReasoning}
            />
          </div>
        </div>

        <Collapsible
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          className="border-t border-border/40 pt-4"
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
            <span>Advanced</span>
            <ChevronDownIcon
              className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="mdl-temp">Default Temperature (0–2)</Label>
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
              <Label htmlFor="mdl-max-tokens">Max Output Tokens</Label>
              <Input
                id="mdl-max-tokens"
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <SheetFooter className="mt-auto border-t border-border/40 px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
              ? "Save Changes"
              : "Register Model"}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function ModelSheet({ open, onOpenChange, model }: ModelSheetProps) {
  const { data: providersData } = useListProvidersQuery({})
  const providers = providersData?.providers ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-[460px] flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b border-border/40 px-5 py-4">
          <SheetTitle className="text-base font-semibold">
            {model?.id ? `Edit ${model.displayName}` : "Register Custom Model"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Configure model identifier, capabilities, and generation defaults.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <ModelSheetForm
            key={model?.id ?? "new"}
            model={model}
            providers={providers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
