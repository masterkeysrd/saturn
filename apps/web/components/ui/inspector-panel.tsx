import type { KeyboardEvent, ReactNode } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface WorkspaceInspectorPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  headerActions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function WorkspaceInspectorPanel({
  open,
  onOpenChange,
  title,
  description,
  icon,
  headerActions,
  footer,
  children,
  className,
}: WorkspaceInspectorPanelProps) {
  if (!open) {
    return null
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      onOpenChange(false)
    }
  }

  return (
    <aside
      data-slot="workspace-inspector-panel"
      role="complementary"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex w-full flex-col overflow-hidden bg-card outline-none max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:h-dvh lg:sticky lg:top-0 lg:h-[calc(100svh-3rem)] lg:w-96 lg:shrink-0 lg:border-l lg:border-border/60 xl:w-[420px]",
        className
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 lg:py-3.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            {icon && <span className="shrink-0 text-primary">{icon}</span>}
            <span className="min-w-0 truncate">{title}</span>
          </div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {headerActions}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onOpenChange(false)}
            aria-label="Close inspector"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <footer className="shrink-0 border-t border-border/60 bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] lg:py-3.5">
          {footer}
        </footer>
      )}
    </aside>
  )
}
