import { useEffect, type ElementType, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface DocumentPageProps {
  title: string
  description?: ReactNode
  icon?: ElementType
  badge?: ReactNode
  actions?: ReactNode
  maxWidth?: "md" | "lg" | "xl" | "full"
  emptyNode?: ReactNode
  isEmpty?: boolean
  hideHeader?: boolean
  className?: string
  children: ReactNode
}

const MAX_WIDTH_CLASSES: Record<
  NonNullable<DocumentPageProps["maxWidth"]>,
  string
> = {
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
}

export function DocumentPage({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  maxWidth = "lg",
  emptyNode,
  isEmpty = false,
  hideHeader = false,
  className,
  children,
}: DocumentPageProps) {
  useEffect(() => {
    if (title) {
      document.title = `${title} | Saturn`
    }
  }, [title])

  return (
    <div
      data-slot="document-page"
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 p-6",
        MAX_WIDTH_CLASSES[maxWidth],
        className
      )}
    >
      {!hideHeader && (
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              {Icon && <Icon className="size-5 shrink-0 text-primary" />}
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
              {actions}
            </div>
          )}
        </div>
      )}

      {isEmpty && emptyNode ? emptyNode : children}
    </div>
  )
}

export interface SplitWorkspacePageProps {
  title?: string
  toolbar?: ReactNode
  leftRail?: ReactNode
  listPane: ReactNode
  detailPane: ReactNode
  leftRailClassName?: string
  listPaneClassName?: string
  detailPaneClassName?: string
  className?: string
}

export function SplitWorkspacePage({
  title,
  toolbar,
  leftRail,
  listPane,
  detailPane,
  leftRailClassName,
  listPaneClassName,
  detailPaneClassName,
  className,
}: SplitWorkspacePageProps) {
  useEffect(() => {
    if (title) {
      document.title = `${title} | Saturn`
    }
  }, [title])

  return (
    <div
      data-slot="split-workspace-page"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      {toolbar && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-4 py-2.5">
          {toolbar}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {leftRail && (
          <aside
            className={cn(
              "hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-background lg:flex",
              leftRailClassName
            )}
          >
            {leftRail}
          </aside>
        )}
        <section
          className={cn(
            "flex w-full shrink-0 flex-col overflow-hidden border-r border-border/60 bg-card/40 md:w-80 lg:w-96",
            listPaneClassName
          )}
        >
          {listPane}
        </section>
        <section
          className={cn(
            "hidden min-w-0 flex-1 flex-col overflow-hidden bg-background md:flex",
            detailPaneClassName
          )}
        >
          {detailPane}
        </section>
      </div>
    </div>
  )
}

export interface StudioCanvasPageProps {
  title?: string
  leading?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  inspector?: ReactNode
  inspectorClassName?: string
  className?: string
  children: ReactNode
}

export function StudioCanvasPage({
  title,
  leading,
  status,
  actions,
  inspector,
  inspectorClassName,
  className,
  children,
}: StudioCanvasPageProps) {
  useEffect(() => {
    if (title) {
      document.title = `${title} | Saturn`
    }
  }, [title])

  return (
    <div
      data-slot="studio-canvas-page"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      {(leading || status || actions) && (
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/70 px-4">
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            {status}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {children}
        </div>
        {inspector && (
          <aside
            className={cn(
              "hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border/60 bg-card lg:flex xl:w-96",
              inspectorClassName
            )}
          >
            {inspector}
          </aside>
        )}
      </div>
    </div>
  )
}

export {
  WorkspaceInspectorPanel,
  type WorkspaceInspectorPanelProps,
} from "./inspector-panel"
