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
import { useI18n } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"

interface MCPConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MCPConnectDialog({
  open,
  onOpenChange,
}: MCPConnectDialogProps) {
  const { t } = useI18n()
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
          <DialogTitle>{t("ai.connect.title")}</DialogTitle>
          <DialogDescription>
            {t("ai.connect.descBefore")} <code>finance:read</code>,{" "}
            <code>ai:execute</code>
            {t("ai.connect.descAfter")}
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
            {t("ai.connect.endpoint")}{" "}
            <code className="font-mono">{endpointUrl}</code>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
