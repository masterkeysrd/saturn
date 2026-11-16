import { useState } from "react"
import { useListModelsQuery } from "@saturn/api/gen/saturn/platform/ai/v1/ai"
import type { ModelConfig } from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  ModelSelector,
  ModelSelectorButton,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

type ModelMode = "default" | "role" | "model"

interface ModelConfigEditorProps {
  value?: ModelConfig
  onChange: (next?: ModelConfig) => void
  defaultLabel?: string
}

export function ModelConfigEditor({
  value,
  onChange,
  defaultLabel = "Workspace Default",
}: ModelConfigEditorProps) {
  const { data: modelsData } = useListModelsQuery({ isEnabled: true })
  const models = modelsData?.models ?? []
  const [pickerOpen, setPickerOpen] = useState(false)

  const mode: ModelMode = value?.modelId
    ? "model"
    : value?.role
      ? "role"
      : "default"

  const selectedModel = models.find((m) => m.id === value?.modelId)

  const handleModeChange = (nextMode: ModelMode) => {
    if (nextMode === "default") {
      onChange(undefined)
      return
    }
    if (nextMode === "role") {
      onChange({ role: "default", generation: value?.generation })
      return
    }
    onChange({
      modelId: models[0]?.id ?? "",
      generation: value?.generation,
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">
          Model Strategy
        </Label>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
          {(
            [
              { id: "default", label: defaultLabel },
              { id: "role", label: "Role Slot" },
              { id: "model", label: "Specific Model" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleModeChange(opt.id)}
              className={`cursor-pointer truncate rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                mode === opt.id
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "role" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Workspace Role
          </Label>
          <Select
            value={value?.role ?? "default"}
            onValueChange={(role) =>
              onChange({
                ...value,
                modelId: undefined,
                role: role ?? "default",
              })
            }
          >
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="default" className="text-xs">
                Default
              </SelectItem>
              <SelectItem value="fast" className="text-xs">
                Fast (Low-latency)
              </SelectItem>
              <SelectItem value="reasoning" className="text-xs">
                Reasoning
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "model" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Registered Model
          </Label>
          <ModelSelector open={pickerOpen} onOpenChange={setPickerOpen}>
            <ModelSelectorTrigger
              render={
                <ModelSelectorButton className="h-9 w-full justify-between rounded-xl">
                  <span className="flex min-w-0 items-center gap-2">
                    <ModelSelectorLogo driver={selectedModel?.providerDriver} />
                    <span className="truncate">
                      {selectedModel?.displayName ||
                        value?.modelId ||
                        "Choose model"}
                    </span>
                  </span>
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                </ModelSelectorButton>
              }
            />
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search workspace models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>
                  No enabled models found.
                </ModelSelectorEmpty>
                <ModelSelectorGroup heading="Registered Models">
                  {models.map((m) => (
                    <ModelSelectorItem
                      key={m.id}
                      value={`${m.displayName} ${m.modelId} ${m.providerName}`}
                      onSelect={() => {
                        onChange({
                          ...value,
                          role: undefined,
                          modelId: m.id,
                        })
                        setPickerOpen(false)
                      }}
                    >
                      <ModelSelectorLogo driver={m.providerDriver} />
                      <ModelSelectorName>{m.displayName}</ModelSelectorName>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {m.providerName}
                      </span>
                      {value?.modelId === m.id && (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                    </ModelSelectorItem>
                  ))}
                </ModelSelectorGroup>
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </div>
      )}

      {mode !== "default" && (
        <div className="space-y-3 border-t border-border/40 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Temperature (0 – 2)
            </Label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={value?.generation?.temperature ?? ""}
              placeholder="Model default"
              onChange={(e) => {
                const raw = e.target.value
                const parsed = parseFloat(raw)
                onChange({
                  ...value,
                  generation: {
                    ...value?.generation,
                    temperature:
                      raw === "" || Number.isNaN(parsed) ? undefined : parsed,
                  },
                })
              }}
              className="h-9 rounded-xl font-mono text-xs"
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between text-xs font-medium">
            <span>Enable Extended Thinking</span>
            <Switch
              checked={Boolean(value?.generation?.thinking?.enabled)}
              onCheckedChange={(enabled) =>
                onChange({
                  ...value,
                  generation: {
                    ...value?.generation,
                    thinking: {
                      ...value?.generation?.thinking,
                      enabled: Boolean(enabled),
                    },
                  },
                })
              }
            />
          </label>
        </div>
      )}
    </div>
  )
}
