import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateMCPServerMutation,
  useUpdateMCPServerMutation,
  type MCPServer,
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

interface MCPServerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: MCPServer | null
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

function MCPServerSheetForm({
  server,
  onClose,
}: {
  server?: MCPServer | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(server?.id)

  const [name, setName] = useState(server?.name ?? "")
  const [slug, setSlug] = useState(server?.slug ?? "")
  const [description, setDescription] = useState(server?.description ?? "")
  const [url, setUrl] = useState(server?.config?.url ?? "")
  const [authType, setAuthType] = useState(server?.config?.authType || "none")
  const [bearerToken, setBearerToken] = useState("")
  const [trustReadHints, setTrustReadHints] = useState(
    server?.config?.trustReadHints ?? true
  )
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(server?.config?.timeoutSeconds ?? 30)
  )
  const [isEnabled, setIsEnabled] = useState(server ? server.isEnabled : true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createServer = useCreateMCPServerMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/mcp-servers"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const updateServer = useUpdateMCPServerMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/mcp-servers"],
      })
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const payload: MCPServer = {
      id: server?.id ?? "",
      spaceId: server?.spaceId ?? "",
      isSystem: server?.isSystem ?? false,
      slug: slug || slugify(name),
      name: name.trim(),
      description: description.trim(),
      transport: server?.transport ?? "http",
      hasAuthSecret: server?.hasAuthSecret ?? false,
      isEnabled,
      config: {
        url: url.trim(),
        authType,
        trustReadHints,
        timeoutSeconds: parseInt(timeoutSeconds, 10) || 30,
      },
      ...(authType === "bearer" &&
        bearerToken.trim() && {
          authSecret: {
            bearerToken: bearerToken.trim(),
            headers: {},
          },
        }),
    }

    if (isEditing && server?.id) {
      const paths = [
        "name",
        "description",
        "is_enabled",
        "config.trust_read_hints",
        "config.timeout_seconds",
      ]
      if (!server.isSystem) {
        paths.push("slug", "config.url", "config.auth_type")
      }
      if (bearerToken.trim()) {
        paths.push("auth_secret.bearer_token")
      }
      updateServer.mutate({
        id: server.id,
        req: {
          id: server.id,
          mcpServer: payload,
          updateMask: { paths },
        },
      })
    } else {
      createServer.mutate({ mcpServer: payload })
    }
  }

  const isPending = createServer.isPending || updateServer.isPending

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
          <Label htmlFor="mcp-name">Name *</Label>
          <Input
            id="mcp-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!isEditing) {
                setSlug(slugify(e.target.value))
              }
            }}
            required
            placeholder="e.g. GitHub MCP"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mcp-slug">Slug *</Label>
          <Input
            id="mcp-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={Boolean(server?.isSystem)}
            required
            placeholder="github"
            className="font-mono text-xs"
          />
        </div>

        {!server?.isSystem && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">Endpoint URL *</Label>
              <Input
                id="mcp-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://mcp.example.com/mcp"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Authentication</Label>
              <Select
                value={authType}
                onValueChange={(v) => setAuthType(v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="custom_headers">Custom Headers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {authType === "bearer" && (
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token">
                  Bearer Token {!isEditing || !server?.hasAuthSecret ? "*" : ""}
                </Label>
                <Input
                  id="mcp-token"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  required={!isEditing}
                  placeholder={
                    server?.hasAuthSecret
                      ? "Leave blank to keep stored token"
                      : "Bearer token"
                  }
                />
              </div>
            )}
          </>
        )}

        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="mcp-enabled">Enabled</Label>
              <p className="text-[11px] text-muted-foreground">
                Make this server&apos;s tools available to bound agents
              </p>
            </div>
            <Switch
              id="mcp-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="mcp-trust">Trust Read-Only Hints</Label>
              <p className="text-[11px] text-muted-foreground">
                Auto-run tools annotated ReadOnlyHint without approval
              </p>
            </div>
            <Switch
              id="mcp-trust"
              checked={trustReadHints}
              onCheckedChange={setTrustReadHints}
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
              <Label htmlFor="mcp-desc">Description</Label>
              <Input
                id="mcp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-timeout">Timeout Seconds (1–300)</Label>
              <Input
                id="mcp-timeout"
                type="number"
                min={1}
                max={300}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(e.target.value)}
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
          {isPending ? "Saving..." : isEditing ? "Save Changes" : "Add Server"}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function MCPServerSheet({
  open,
  onOpenChange,
  server,
}: MCPServerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-[460px] flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b border-border/40 px-5 py-4">
          <SheetTitle className="text-base font-semibold">
            {server?.id ? `Edit ${server.name}` : "Add Remote HTTP MCP Server"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Connect external Streamable HTTP MCP tool servers to bind into your
            workspace agents.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <MCPServerSheetForm
            key={server?.id ?? "new"}
            server={server}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
