import {
  useListAgentsQuery,
  useListProvidersQuery,
} from "@saturn/api/gen/saturn/platform/agent/v1/agent"
import type { ModelConfig } from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

type ModelMode = "default" | "agent" | "custom"

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
  const { data: agentsData } = useListAgentsQuery({})
  const { data: providersData } = useListProvidersQuery({})

  const agents = agentsData?.agents ?? []
  const providers = providersData?.providers ?? []

  const mode: ModelMode = value?.agentId
    ? "agent"
    : value?.providerId || value?.modelName
      ? "custom"
      : "default"

  const handleModeChange = (nextMode: ModelMode) => {
    if (nextMode === "default") {
      onChange(undefined)
      return
    }
    if (nextMode === "agent") {
      onChange({ agentId: agents[0]?.id ?? "" })
      return
    }
    onChange({
      providerId: providers[0]?.id ?? "",
      modelName: "",
      temperature: 0,
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
              { id: "agent", label: "Named Agent" },
              { id: "custom", label: "Custom" },
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

      {mode === "agent" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">
            Select Agent
          </Label>
          <Select
            value={value?.agentId ?? ""}
            onValueChange={(agentId) =>
              onChange({ agentId: agentId ?? undefined })
            }
          >
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue placeholder="Choose an agent">
                {agents.find((a) => a.id === value?.agentId)?.name ||
                  value?.agentId ||
                  "Choose an agent"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id ?? ""} className="text-xs">
                  {a.name} ({a.modelName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Provider Connection
            </Label>
            <Select
              value={value?.providerId ?? ""}
              onValueChange={(providerId) =>
                onChange({
                  ...value,
                  agentId: undefined,
                  providerId: providerId || undefined,
                })
              }
            >
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Select provider">
                  {providers.find((p) => p.id === value?.providerId)?.name ||
                    "Default Space Provider"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="" className="text-xs">
                  Default Space Provider
                </SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id ?? ""} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Model Name *
            </Label>
            <Input
              value={value?.modelName ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  agentId: undefined,
                  modelName: e.target.value || undefined,
                })
              }
              required
              placeholder="e.g. gpt-4o, claude-sonnet-4, llama3"
              className="h-9 rounded-xl font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Temperature (0 – 2)
            </Label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={value?.temperature ?? 0}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value)
                onChange({
                  ...value,
                  agentId: undefined,
                  temperature: Number.isNaN(parsed) ? 0 : parsed,
                })
              }}
              className="h-9 rounded-xl font-mono text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}
