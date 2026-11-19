import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateAgentMutation,
  useListMCPServersQuery,
  useListModelsQuery,
  useUpdateAgentMutation,
  type Agent,
  type MCPBinding,
  type MCPServer,
  type Model,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDownIcon, PlugIcon, SearchIcon, XIcon } from "lucide-react"

interface AgentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent | null
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

function initialBindings(
  agent: Agent | null | undefined,
  mcpServers: MCPServer[]
): Record<string, string[]> {
  if (agent) {
    const map: Record<string, string[]> = {}
    for (const b of agent.config?.mcpBindings ?? []) {
      map[b.mcpServerId] = b.allowedTools ?? []
    }
    return map
  }
  const saturnMcp = mcpServers.find((s) => s.isSystem)
  return saturnMcp?.id ? { [saturnMcp.id]: ["*"] } : {}
}

function AgentSheetForm({
  agent,
  models,
  mcpServers,
  onClose,
}: {
  agent?: Agent | null
  models: Model[]
  mcpServers: MCPServer[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(agent?.id)

  const [name, setName] = useState(agent?.name ?? "")
  const [slug, setSlug] = useState(agent?.slug ?? "")
  const [description, setDescription] = useState(agent?.description ?? "")
  const [modelId, setModelId] = useState<string>(agent?.modelId ?? "")
  const [systemInstruction, setSystemInstruction] = useState(
    agent?.config?.systemInstruction ?? ""
  )
  const [approvalPolicy, setApprovalPolicy] = useState(
    agent?.config?.execution?.approvalPolicy || "confirm_writes"
  )
  const [isEnabled, setIsEnabled] = useState(agent ? agent.isEnabled : true)
  const [bindings, setBindings] = useState<Record<string, string[]>>(() =>
    initialBindings(agent, mcpServers)
  )
  const [maxSteps, setMaxSteps] = useState(
    String(agent?.config?.execution?.maxSteps ?? 10)
  )
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(agent?.config?.execution?.timeoutSeconds ?? 300)
  )
  const [temperature, setTemperature] = useState(
    agent?.config?.generation?.temperature !== undefined
      ? String(agent.config.generation.temperature)
      : ""
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [expandedToolServers, setExpandedToolServers] = useState<
    Record<string, boolean>
  >({})
  const [toolSearchByServer, setToolSearchByServer] = useState<
    Record<string, string>
  >({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createAgent = useCreateAgentMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/agents"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const updateAgent = useUpdateAgentMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/agents"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const toggleServerBinding = (serverId: string, checked: boolean) => {
    setBindings((prev) => {
      const next = { ...prev }
      if (checked) {
        next[serverId] = ["*"]
      } else {
        delete next[serverId]
      }
      return next
    })
  }

  const toggleTool = (
    serverId: string,
    toolName: string,
    allTools: string[]
  ) => {
    setBindings((prev) => {
      const current = prev[serverId] ?? []
      let expanded = current.includes("*") ? [...allTools] : [...current]
      if (expanded.includes(toolName)) {
        expanded = expanded.filter((t) => t !== toolName)
      } else {
        expanded.push(toolName)
      }
      if (expanded.length === 0) {
        const next = { ...prev }
        delete next[serverId]
        return next
      }
      if (allTools.length > 0 && expanded.length === allTools.length) {
        return { ...prev, [serverId]: ["*"] }
      }
      return { ...prev, [serverId]: expanded }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const mcpBindings: MCPBinding[] = Object.entries(bindings).map(
      ([mcpServerId, allowedTools]) => ({
        mcpServerId,
        allowedTools,
      })
    )

    const parsedMaxSteps = parseInt(maxSteps, 10) || 10
    const parsedTimeout = parseInt(timeoutSeconds, 10) || 300
    const parsedTemp = parseFloat(temperature)

    const payload: Agent = {
      id: agent?.id ?? "",
      spaceId: agent?.spaceId ?? "",
      isSystem: agent?.isSystem ?? false,
      slug: slug || slugify(name),
      name: name.trim(),
      description: description.trim(),
      tags: agent?.tags ?? [],
      modelId: modelId || undefined,
      isEnabled,
      version: agent?.version ?? "1",
      config: {
        icon: agent?.config?.icon || "bot",
        systemInstruction: systemInstruction || undefined,
        generation: !Number.isNaN(parsedTemp)
          ? { temperature: parsedTemp }
          : undefined,
        execution: {
          approvalPolicy,
          maxSteps: parsedMaxSteps,
          timeoutSeconds: parsedTimeout,
        },
        mcpBindings,
      },
    }

    if (isEditing && agent?.id) {
      const paths = [
        "name",
        "description",
        "model_id",
        "is_enabled",
        "config.system_instruction",
        "config.execution",
        "config.mcp_bindings",
        "config.generation",
      ]
      if (!agent.isSystem) {
        paths.push("slug")
      }
      updateAgent.mutate({
        id: agent.id,
        req: {
          id: agent.id,
          agent: payload,
          updateMask: { paths },
        },
      })
    } else {
      createAgent.mutate({ agent: payload })
    }
  }

  const isPending = createAgent.isPending || updateAgent.isPending

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
          <Label htmlFor="agent-name">Name *</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!isEditing) {
                setSlug(slugify(e.target.value))
              }
            }}
            required
            placeholder="e.g. Budget Coach"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-slug">Slug *</Label>
          <Input
            id="agent-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={Boolean(agent?.isSystem)}
            required
            placeholder="budget-coach"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Exposed externally on /mcp as <code>agent__{slug || "slug"}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-description">Description</Label>
          <Input
            id="agent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent specializes in"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={modelId} onValueChange={(v) => setModelId(v ?? "")}>
            <SelectTrigger>
              <SelectValue>
                {models.find((m) => m.id === modelId)?.displayName ||
                  "Workspace Default Model"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Workspace Default Model</SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id ?? ""}>
                  {m.displayName} ({m.providerName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-instruction">System Instruction</Label>
          <Textarea
            id="agent-instruction"
            rows={4}
            value={systemInstruction}
            onChange={(e) => setSystemInstruction(e.target.value)}
            placeholder="You are a careful workspace assistant..."
            className="text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tool Approval Policy</Label>
          <Select
            value={approvalPolicy}
            onValueChange={(v) => setApprovalPolicy(v ?? "confirm_writes")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confirm_writes">
                Confirm mutating tools (Recommended)
              </SelectItem>
              <SelectItem value="auto">Auto-approve all tools</SelectItem>
              <SelectItem value="deny_writes">
                Deny mutating tools (Read-only)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-4">
          <div>
            <Label htmlFor="agent-enabled">Enabled</Label>
            <p className="text-[11px] text-muted-foreground">
              Allow chat, workflows, and /mcp clients to invoke this agent
            </p>
          </div>
          <Switch
            id="agent-enabled"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>

        <div className="space-y-3 border-t border-border/40 pt-4">
          <div>
            <Label>MCP Server & Tool Bindings</Label>
            <p className="text-xs text-muted-foreground">
              Grant access to built-in Saturn workspace tools or external HTTP
              MCP servers.
            </p>
          </div>

          {mcpServers.map((srv) => {
            const sid = srv.id ?? ""
            const allowed = bindings[sid]
            const isBound = allowed !== undefined
            const rawTools = (srv.discovery?.tools ?? []).filter((t) =>
              Boolean(t.name)
            )
            const discoveredTools = rawTools.map((t) => t.name ?? "")
            const isWildcard = Boolean(allowed?.includes("*"))
            const isExpanded =
              Boolean(expandedToolServers[sid]) || (isBound && !isWildcard)
            const toolQuery = (toolSearchByServer[sid] ?? "")
              .trim()
              .toLowerCase()
            const filteredTools = toolQuery
              ? rawTools.filter(
                  (t) =>
                    (t.name ?? "").toLowerCase().includes(toolQuery) ||
                    (t.description ?? "").toLowerCase().includes(toolQuery)
                )
              : rawTools
            const activeCount = !isBound
              ? 0
              : isWildcard
                ? discoveredTools.length
                : allowed.length

            return (
              <div
                key={sid}
                className="space-y-2.5 border-t border-border/40 pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={isBound}
                      onCheckedChange={(chk) =>
                        toggleServerBinding(sid, Boolean(chk))
                      }
                      id={`mcp-bind-${sid}`}
                    />
                    <label
                      htmlFor={`mcp-bind-${sid}`}
                      className="flex min-w-0 cursor-pointer items-center gap-1.5 text-xs font-medium"
                    >
                      <PlugIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{srv.name}</span>
                      {srv.isSystem && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          (Built-in)
                        </span>
                      )}
                    </label>
                  </div>

                  {isBound && (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {isWildcard
                          ? discoveredTools.length > 0
                            ? `All (${discoveredTools.length})`
                            : "All tools (*)"
                          : `${activeCount}/${discoveredTools.length} tools`}
                      </span>
                      {discoveredTools.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            setExpandedToolServers((prev) => ({
                              ...prev,
                              [sid]: !isExpanded,
                            }))
                          }
                          className="cursor-pointer gap-1"
                        >
                          <SearchIcon className="size-3" />
                          <span>
                            {isExpanded ? "Hide tools" : "Find tools"}
                          </span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isBound && discoveredTools.length > 0 && isExpanded && (
                  <div className="ml-6 space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={toolSearchByServer[sid] ?? ""}
                          onChange={(e) =>
                            setToolSearchByServer((prev) => ({
                              ...prev,
                              [sid]: e.target.value,
                            }))
                          }
                          placeholder={`Search ${discoveredTools.length} tools by name or description...`}
                          aria-label={`Search tools for ${srv.name}`}
                          className="h-8 pr-7 pl-8 text-xs"
                        />
                        {toolSearchByServer[sid] && (
                          <button
                            type="button"
                            onClick={() =>
                              setToolSearchByServer((prev) => ({
                                ...prev,
                                [sid]: "",
                              }))
                            }
                            aria-label="Clear tool search"
                            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          setBindings((prev) => ({ ...prev, [sid]: ["*"] }))
                        }
                        disabled={isWildcard}
                        className="shrink-0 cursor-pointer text-xs"
                      >
                        Select all
                      </Button>
                    </div>

                    <div className="max-h-48 divide-y divide-border/40 overflow-y-auto rounded-md border border-border/60 bg-control px-2.5">
                      {filteredTools.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          No tools matching &ldquo;{toolSearchByServer[sid]}
                          &rdquo;
                        </p>
                      ) : (
                        filteredTools.map((tool) => {
                          const tName = tool.name ?? ""
                          const checked = isWildcard || allowed.includes(tName)
                          return (
                            <label
                              key={tName}
                              className="flex cursor-pointer items-start gap-2.5 py-2 text-xs hover:text-foreground"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  toggleTool(sid, tName, discoveredTools)
                                }
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-[11px] font-medium text-foreground">
                                  {tName}
                                </div>
                                {tool.description && (
                                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                                    {tool.description}
                                  </p>
                                )}
                              </div>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
              <Label htmlFor="agent-max-steps">Max Steps (1–50)</Label>
              <Input
                id="agent-max-steps"
                type="number"
                min={1}
                max={50}
                value={maxSteps}
                onChange={(e) => setMaxSteps(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-timeout">Timeout Seconds (1–1800)</Label>
              <Input
                id="agent-timeout"
                type="number"
                min={1}
                max={1800}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-temp">Temperature Override (0–2)</Label>
              <Input
                id="agent-temp"
                type="number"
                step={0.1}
                min={0}
                max={2}
                placeholder="Inherit model default"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter className="shrink-0 border-t border-border/60 bg-card px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
              ? "Save Changes"
              : "Create Agent"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AgentSheet({ open, onOpenChange, agent }: AgentSheetProps) {
  const { data: modelsData } = useListModelsQuery({ isEnabled: true })
  const { data: mcpData } = useListMCPServersQuery({})
  const models = modelsData?.models ?? []
  const mcpServers = mcpData?.mcpServers ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="pr-8 text-base font-semibold">
            {agent?.id ? `Edit ${agent.name}` : "Create AI Agent"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure instructions, model selection, and unified MCP tool
            bindings.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <AgentSheetForm
            key={agent?.id ?? "new"}
            agent={agent}
            models={models}
            mcpServers={mcpServers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
