import type { MouseEvent } from "react"
import { buildCopilotEntityKey, type CopilotEntityRef } from "@saturn/core"
import { useCopilotAttachment } from "@saturn/hooks/ai"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AtSignIcon, CheckIcon } from "lucide-react"

export interface CopilotAttachButtonProps {
  item: CopilotEntityRef
  className?: string
  size?: "xs" | "sm"
}

export function CopilotAttachButton({
  item,
  className,
  size = "xs",
}: CopilotAttachButtonProps) {
  const { isCopilotOpen, toggleItem, isPinned } = useCopilotAttachment()

  if (!isCopilotOpen) {
    return null
  }

  const key = item.key || buildCopilotEntityKey(item.kind, item.id)
  const pinned = isPinned(key)

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    toggleItem(item)
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Add ${item.label} to Copilot`}
              aria-pressed={pinned}
              onClick={handleClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation()
                }
              }}
              className={cn(
                "shrink-0 cursor-pointer rounded-lg transition-colors",
                size === "sm" ? "size-7" : "size-6",
                pinned
                  ? "bg-primary/12 text-primary hover:bg-primary/20"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                className
              )}
            >
              {pinned ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <AtSignIcon className="size-3.5" />
              )}
            </Button>
          }
        />
        <TooltipContent side="top">
          {pinned ? "Pinned to Copilot" : "Add to Copilot"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
