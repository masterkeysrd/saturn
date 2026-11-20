import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useDeleteMCPServerMutation,
  useListMCPServersQuery,
  useSyncMCPServerMutation,
  useTestMCPServerMutation,
  type MCPServer,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { MCPServerSheet } from "./components/mcp-server-sheet"
import { MCPConnectDialog } from "./components/mcp-connect-dialog"
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react"

export function MCPServersView() {
  const { t, language } = useI18n()
  const queryClient = useQueryClient()
  const { spaceRole } = useActiveSpaceContext()
  const canManageSettings = spaceRole === "owner" || spaceRole === "admin"
  const { data, isLoading } = useListMCPServersQuery({})
  const servers = data?.mcpServers ?? []

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/mcp-servers"],
    })
  }

  const testServer = useTestMCPServerMutation({ onSuccess: invalidate })
  const syncServer = useSyncMCPServerMutation({ onSuccess: invalidate })
  const deleteServer = useDeleteMCPServerMutation({ onSuccess: invalidate })

  return (
    <PageLayout
      title={t("ai.mcp.title")}
      description={t("ai.mcp.description")}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setConnectOpen(true)}
            className="cursor-pointer gap-1.5"
          >
            <ExternalLinkIcon className="size-4" />
            {t("ai.mcp.connectExternal")}
          </Button>
          {canManageSettings && (
            <Button
              onClick={() => {
                setEditingServer(null)
                setSheetOpen(true)
              }}
              className="cursor-pointer gap-1.5"
            >
              <PlusIcon className="size-4" />
              {t("ai.mcp.addHttp")}
            </Button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-border/50 bg-muted/30"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((srv) => {
            const tools = srv.discovery?.tools ?? []
            return (
              <div
                key={srv.id}
                className="space-y-3 rounded-2xl border border-border/60 bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <PlugIcon className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{srv.name}</h3>
                        {srv.isSystem && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("ai.mcp.builtIn")}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            srv.discovery?.healthStatus === "healthy"
                              ? "secondary"
                              : srv.discovery?.healthStatus === "unhealthy"
                                ? "destructive"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {getLocalizedEnumLabel(
                            "ai",
                            "mcpHealth",
                            srv.discovery?.healthStatus || "unknown",
                            language
                          )}
                        </Badge>
                        {!srv.isEnabled && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("ai.shared.disabled")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {srv.description || srv.config?.url}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">
                          {t("ai.mcp.slug", { slug: srv.slug ?? "" })}
                        </span>
                        <span>· {srv.transport}</span>
                        <span>
                          {t("ai.mcp.toolCount", { n: tools.length })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canManageSettings && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!srv.isSystem && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              testServer.mutate({
                                id: srv.id ?? "",
                                req: { id: srv.id ?? "" },
                              })
                            }
                            disabled={testServer.isPending}
                            className="cursor-pointer gap-1 text-xs"
                          >
                            <ZapIcon className="size-3.5" />
                            {t("ai.mcp.test")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              syncServer.mutate({
                                id: srv.id ?? "",
                                req: { id: srv.id ?? "" },
                              })
                            }
                            disabled={syncServer.isPending}
                            className="cursor-pointer gap-1 text-xs"
                          >
                            <RefreshCwIcon className="size-3.5" />
                            {t("ai.mcp.sync")}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingServer(srv)
                          setSheetOpen(true)
                        }}
                        className="cursor-pointer gap-1 text-xs"
                      >
                        <PencilIcon className="size-3.5" />
                        {t("common.edit")}
                      </Button>
                      {!srv.isSystem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            deleteServer.mutate({
                              id: srv.id ?? "",
                              req: { id: srv.id ?? "" },
                            })
                          }
                          disabled={deleteServer.isPending}
                          className="cursor-pointer gap-1 text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {srv.discovery?.error?.message && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {srv.discovery.error.message}
                  </p>
                )}

                {tools.length > 0 && (
                  <Collapsible className="border-t border-border/40 pt-3">
                    <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <span>
                        {t("ai.mcp.inspectTools", { n: tools.length })}
                      </span>
                      <ChevronDownIcon className="size-3.5" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="grid gap-2 pt-3 md:grid-cols-2">
                      {tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">
                              {tool.name}
                            </span>
                            {tool.readOnlyHint && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {t("ai.mcp.readOnly")}
                              </Badge>
                            )}
                          </div>
                          {tool.description && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )
          })}
        </div>
      )}

      <MCPServerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        server={editingServer}
      />
      <MCPConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </PageLayout>
  )
}
