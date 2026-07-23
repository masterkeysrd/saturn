import { useState } from "react"
import { Link } from "react-router-dom"
import {
  useListProvidersQuery,
  useListAgentsQuery,
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useGetAgentCatalogQuery,
  type Agent,
} from "@/gen/saturn/platform/agent/v1/agent"
import { PageLayout } from "@/components/ui/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  Cpu,
  History,
  HelpCircle,
  ArrowRight,
  Bot,
  RotateCcw,
} from "lucide-react"

export function AgentsListView() {
  const { data: providersData } = useListProvidersQuery({})
  const { data: agentsData, refetch: refetchAgents } = useListAgentsQuery({})
  const { data: agentCatalog } = useGetAgentCatalogQuery({})

  const createAgent = useCreateAgentMutation({
    onSuccess: () => refetchAgents(),
  })
  const updateAgent = useUpdateAgentMutation({
    onSuccess: () => refetchAgents(),
  })
  const deleteAgent = useDeleteAgentMutation({
    onSuccess: () => refetchAgents(),
  })

  const [activeSheet, setActiveSheet] = useState<"none" | "agent">("none")
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [targetPurpose, setTargetPurpose] = useState<string>("")

  const [agentForm, setAgentForm] = useState({
    id: "",
    name: "",
    description: "",
    llmProviderId: "",
    modelName: "gemini-2.5-flash",
    systemInstruction: "",
    temperature: 0.0,
    isEnabled: true,
  })

  const openAgentSheet = (purpose: string, existingAgent: Agent | null) => {
    setTargetPurpose(purpose)
    if (existingAgent) {
      setSelectedAgent(existingAgent)
      setAgentForm({
        id: existingAgent.id,
        name: existingAgent.name,
        description: existingAgent.description || "",
        llmProviderId: existingAgent.llmProviderId || "",
        modelName: existingAgent.modelName,
        systemInstruction: existingAgent.systemInstruction || "",
        temperature: existingAgent.temperature,
        isEnabled: existingAgent.isEnabled,
      })
    } else {
      const blueprint = agentCatalog?.blueprints.find(
        (b) => b.purpose === purpose
      )
      setSelectedAgent(null)
      setAgentForm({
        id: "",
        name: blueprint ? `${blueprint.displayName} Agent` : `${purpose} Agent`,
        description: blueprint ? blueprint.description : "",
        llmProviderId: "",
        modelName: "gemini-2.5-flash",
        systemInstruction: blueprint ? blueprint.defaultSystemInstruction : "",
        temperature: 0.0,
        isEnabled: true,
      })
    }
    setActiveSheet("agent")
  }

  const handleSaveAgent = async () => {
    if (!agentForm.name || !agentForm.modelName) return

    if (selectedAgent) {
      await updateAgent.mutateAsync({
        id: agentForm.id,
        req: {
          id: agentForm.id,
          llmProviderId: agentForm.llmProviderId,
          name: agentForm.name,
          description: agentForm.description,
          tags: [],
          modelName: agentForm.modelName,
          systemInstruction: agentForm.systemInstruction,
          temperature: agentForm.temperature,
          isEnabled: agentForm.isEnabled,
        },
      })
    } else {
      await createAgent.mutateAsync({
        llmProviderId: agentForm.llmProviderId,
        name: agentForm.name,
        description: agentForm.description,
        purpose: targetPurpose,
        tags: [],
        modelName: agentForm.modelName,
        systemInstruction: agentForm.systemInstruction,
        temperature: agentForm.temperature,
      })
    }
    setActiveSheet("none")
  }

  const handleResetAgent = async (id: string) => {
    if (
      confirm(
        "Reset this agent? Custom configuration will be removed and revert to system defaults."
      )
    ) {
      await deleteAgent.mutateAsync({ id, req: { id } })
    }
  }

  const currentProvider = providersData?.providers.find(
    (p) => p.id === agentForm.llmProviderId
  )

  return (
    <PageLayout
      title="AI Worker Agents"
      description="Configure pipeline extraction agents and prompt directives for inbound documents."
      icon={Cpu}
    >
      <div className="space-y-6">
        <div className="border-b border-border/20 pb-4">
          <p className="font-sans text-xs text-muted-foreground">
            Saturn deploys specialized singleton workers to classify and extract
            ledger records automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {agentCatalog?.blueprints.map((b) => {
            const purpose = b.purpose || ""
            const customAgent = agentsData?.agents.find(
              (a) => a.purpose === purpose
            )

            return (
              <Card
                key={purpose}
                className="border border-border/40 bg-card/45 backdrop-blur-xl transition-all duration-300 hover:border-primary/25 hover:shadow-xl"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                      <Bot className="h-5 w-5" />
                    </div>
                    <span
                      className={`rounded-xl border px-2.5 py-1 text-[10px] font-extrabold select-none ${
                        customAgent
                          ? customAgent.isEnabled
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                            : "border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground"
                          : "border-primary/20 bg-primary/5 text-primary"
                      }`}
                    >
                      {customAgent
                        ? customAgent.isEnabled
                          ? "ACTIVE INSTANCE"
                          : "DISABLED"
                        : "SYSTEM DEFAULT"}
                    </span>
                  </div>

                  <CardTitle className="mt-2 text-sm font-extrabold text-foreground transition-colors group-hover/card:text-primary">
                    {customAgent ? customAgent.name : b.displayName}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {customAgent ? customAgent.description : b.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-1 pt-0 font-mono text-xs text-muted-foreground">
                  <div className="border-t border-border/10 pt-3">
                    <div>
                      Model:{" "}
                      {customAgent
                        ? customAgent.modelName
                        : "gemini-2.5-flash (default)"}
                    </div>
                    <div>
                      Config:{" "}
                      {customAgent ? "Custom Parameters" : "System Blueprint"}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2 border-t border-border/10 pt-4">
                  <Button
                    variant="default"
                    className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
                    onClick={() => openAgentSheet(purpose, customAgent || null)}
                  >
                    Configure Agent
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/card:translate-x-1" />
                  </Button>
                  {customAgent && (
                    <>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        render={
                          <Link
                            to={`/space/agents/runs?agentId=${customAgent.id}`}
                          />
                        }
                        title="View execution run logs"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => handleResetAgent(customAgent.id)}
                        title="Reset to default settings"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            )
          })}
          {agentCatalog?.blueprints.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-border/30 bg-card/10 px-4 py-14 text-center text-muted-foreground select-none">
              No agent templates registered in the backend system database.
            </div>
          )}
        </div>
      </div>

      {/* Agent Setup Sheet */}
      <Sheet
        open={activeSheet === "agent"}
        onOpenChange={() => setActiveSheet("none")}
      >
        <SheetContent className="no-scrollbar w-full overflow-y-auto rounded-none border-none bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[700px] sm:rounded-l-3xl sm:border-l sm:border-border/30">
          <SheetHeader className="border-b border-border/20 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Cpu className="h-5 w-5" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-lg font-bold text-foreground">
                  {selectedAgent
                    ? "Configure Agent Parameters"
                    : "Customize Default Agent"}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Set custom LLM keys, prompts, and options for this specific
                  document pipeline.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6 px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor="a-name">Agent Name</Label>
              <Input
                id="a-name"
                placeholder="e.g. Transaction Extractor"
                className="h-11 rounded-xl border-border/60 bg-background/50"
                value={agentForm.name}
                onChange={(e) =>
                  setAgentForm({ ...agentForm, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="a-desc">Description</Label>
              <Textarea
                id="a-desc"
                placeholder="What files or streams does this agent process?"
                className="h-24 rounded-xl border-border/60 bg-background/50 p-3 text-xs"
                value={agentForm.description}
                onChange={(e) =>
                  setAgentForm({ ...agentForm, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
                Blueprint Template
              </Label>
              <div className="flex h-11 w-full items-center rounded-xl border border-border/60 bg-muted/30 px-3.5 text-sm font-semibold">
                {agentCatalog?.blueprints.find(
                  (b) => b.purpose === targetPurpose
                )?.displayName || targetPurpose}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Linked LLM Connection Provider</Label>
              <Select
                value={agentForm.llmProviderId || "none"}
                onValueChange={(val) =>
                  setAgentForm({
                    ...agentForm,
                    llmProviderId: val && val !== "none" ? val : "",
                  })
                }
              >
                <SelectTrigger className="!h-11 w-full rounded-xl border-border/60 bg-background/50">
                  <SelectValue placeholder="Select LLM Connection...">
                    {currentProvider
                      ? `${currentProvider.name} (${currentProvider.compatibilityMode.replace("_", " ")})`
                      : "Default Saturn Gateway (None)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                  <SelectItem value="none">
                    Default Saturn Gateway (None)
                  </SelectItem>
                  {providersData?.providers.map((p) => (
                    <SelectItem key={p.id || ""} value={p.id || ""}>
                      {p.name} ({p.compatibilityMode.replace("_", " ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="a-model">Model Name</Label>
              <Input
                id="a-model"
                placeholder="e.g. gemini-2.5-flash, llama3"
                className="h-11 rounded-xl border-border/60 bg-background/50"
                value={agentForm.modelName}
                onChange={(e) =>
                  setAgentForm({ ...agentForm, modelName: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="a-temp">
                Temperature ({agentForm.temperature})
              </Label>
              <input
                id="a-temp"
                type="range"
                min="0"
                max="1"
                step="0.1"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted"
                value={agentForm.temperature}
                onChange={(e) =>
                  setAgentForm({
                    ...agentForm,
                    temperature: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="a-prompt">
                  System Instruction Prompt (Override)
                </Label>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <HelpCircle className="h-3 w-3" />
                  Leave empty to dynamically inherit catalog defaults
                </span>
              </div>
              <Textarea
                id="a-prompt"
                placeholder="Override guidelines, mapping conventions, or translation schemas..."
                className="h-40 rounded-xl border-border/60 bg-background/50 p-3 font-mono text-xs"
                value={agentForm.systemInstruction}
                onChange={(e) =>
                  setAgentForm({
                    ...agentForm,
                    systemInstruction: e.target.value,
                  })
                }
              />
            </div>

            {selectedAgent && (
              <div className="flex items-center gap-2.5 pt-2 select-none">
                <input
                  id="a-enabled"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded-md border border-input bg-transparent"
                  checked={agentForm.isEnabled}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, isEnabled: e.target.checked })
                  }
                />
                <Label
                  htmlFor="a-enabled"
                  className="cursor-pointer text-xs font-semibold"
                >
                  Enable Agent execution
                </Label>
              </div>
            )}

            <div className="border-t border-border/10 pt-6">
              <Button
                onClick={handleSaveAgent}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
              >
                Save Configuration
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PageLayout>
  )
}
