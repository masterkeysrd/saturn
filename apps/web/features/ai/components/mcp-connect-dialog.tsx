import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ai-elements/code-block"
import { useActiveSpaceContext } from "@/features/space/use-space"

interface MCPConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MCPConnectDialog({
  open,
  onOpenChange,
}: MCPConnectDialogProps) {
  const { spaceId } = useActiveSpaceContext()
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-saturn-host"
  const endpointUrl = spaceId
    ? `${origin}/spaces/${spaceId}/mcp`
    : `${origin}/mcp`

  const configSnippet = JSON.stringify(
    {
      mcpServers: {
        saturn: {
          type: "http",
          url: endpointUrl,
          headers: {
            Authorization: "Bearer sat_YOUR_API_KEY",
          },
        },
      },
    },
    null,
    2
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect External AI Client (/mcp)</DialogTitle>
          <DialogDescription>
            Connect Claude Desktop, Cursor, or VS Code to your Saturn workspace
            using an API key with the required scopes (e.g.{" "}
            <code>finance:read</code>, <code>ai:execute</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <CodeBlock code={configSnippet} language="json">
            <CodeBlockHeader>
              <span>mcp.json</span>
              <CodeBlockCopyButton />
            </CodeBlockHeader>
          </CodeBlock>
          <p className="text-xs text-muted-foreground">
            Endpoint: <code className="font-mono">{endpointUrl}</code>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
