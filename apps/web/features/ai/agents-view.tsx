import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useDeleteAgentMutation,
  useListAgentsQuery,
  useResetAgentMutation,
  type Agent,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { AgentSheet } from "./components/agent-sheet"
import {
  BotIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"

export function AgentsView() {
  const queryClient = useQueryClient()
  const { spaceRole } = useActiveSpaceContext()
  const canManageSettings = spaceRole === "owner" || spaceRole === "admin"
  const { data, isLoading } = useListAgentsQuery({})
  const agents = data?.agents ?? []

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  const deleteAgent = useDeleteAgentMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/agents"],
      })
    },
  })

  const resetAgent = useResetAgentMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/agents"],
      })
    },
  })

  return (
    <PageLayout
      title="Agents"
      description="Autonomous workspace assistants with MCP server tool bindings and approval policies."
      actions={
        canManageSettings ? (
          <Button
            onClick={() => {
              setEditingAgent(null)
              setSheetOpen(true)
            }}
            className="cursor-pointer gap-1.5"
          >
            <PlusIcon className="size-4" />
            New Agent
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-border/50 bg-muted/30"
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Empty className="border border-border/50">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon />
            </EmptyMedia>
            <EmptyTitle>No agents found</EmptyTitle>
            <EmptyDescription>
              Create a custom agent with MCP bindings for chat, workflows, and
              external MCP clients.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((ag) => (
            <div
              key={ag.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <BotIcon className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{ag.name}</h3>
                        {ag.isSystem && (
                          <Badge variant="secondary" className="text-[10px]">
                            System
                          </Badge>
                        )}
                        {!ag.isEnabled && (
                          <Badge variant="outline" className="text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        agent__{ag.slug}
                      </p>
                    </div>
                  </div>
                </div>

                {ag.description && (
                  <p className="text-xs text-muted-foreground">
                    {ag.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-[11px]">
                    {ag.modelDisplayName || "Workspace Default Model"}
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {ag.config?.execution?.approvalPolicy || "confirm_writes"}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px]">
                    {(ag.config?.mcpBindings ?? []).length} MCP binding(s)
                  </Badge>
                  {ag.stats && (ag.stats.totalRuns7d ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      {ag.stats.totalRuns7d} runs (7d)
                    </Badge>
                  )}
                </div>
              </div>

              {canManageSettings && (
                <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
                  {ag.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        resetAgent.mutate({
                          id: ag.id ?? "",
                          req: { id: ag.id ?? "" },
                        })
                      }
                      disabled={resetAgent.isPending}
                      className="cursor-pointer gap-1.5 text-xs"
                    >
                      <RotateCcwIcon className="size-3.5" />
                      Reset
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingAgent(ag)
                      setSheetOpen(true)
                    }}
                    className="cursor-pointer gap-1.5 text-xs"
                  >
                    <PencilIcon className="size-3.5" />
                    Edit
                  </Button>
                  {!ag.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteAgent.mutate({
                          id: ag.id ?? "",
                          req: { id: ag.id ?? "" },
                        })
                      }
                      disabled={deleteAgent.isPending}
                      className="cursor-pointer gap-1.5 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AgentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        agent={editingAgent}
      />
    </PageLayout>
  )
}
