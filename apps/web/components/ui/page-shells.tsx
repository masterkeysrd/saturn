import { useEffect, useState, type ElementType, type ReactNode } from "react"
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

export type StudioMobilePane = "canvas" | "inspector"

export interface StudioCanvasPageProps {
  title?: string
  leading?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  banner?: ReactNode
  inspector?: ReactNode
  inspectorClassName?: string
  mobilePane?: StudioMobilePane
  onMobilePaneChange?: (pane: StudioMobilePane) => void
  className?: string
  children: ReactNode
}

export function StudioCanvasPage({
  title,
  leading,
  status,
  actions,
  banner,
  inspector,
  inspectorClassName,
  mobilePane: controlledMobilePane,
  onMobilePaneChange,
  className,
  children,
}: StudioCanvasPageProps) {
  const [internalMobilePane, setInternalMobilePane] =
    useState<StudioMobilePane>("canvas")
  const activeMobilePane = controlledMobilePane ?? internalMobilePane

  const setMobilePane = (next: StudioMobilePane) => {
    if (controlledMobilePane === undefined) {
      setInternalMobilePane(next)
    }
    onMobilePaneChange?.(next)
  }

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
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card/70 px-3 sm:gap-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {leading}
            {status}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {actions}
            </div>
          )}
        </header>
      )}
      {banner}
      {inspector && (
        <div
          role="tablist"
          aria-label="Studio workspace view"
          className="flex h-10 shrink-0 items-center border-b border-border/60 bg-card/50 px-3 lg:hidden"
        >
          <div className="inline-flex h-7 w-full max-w-xs items-center rounded-lg bg-muted p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeMobilePane === "canvas"}
              onClick={() => setMobilePane("canvas")}
              className={cn(
                "flex h-full flex-1 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors",
                activeMobilePane === "canvas"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Canvas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMobilePane === "inspector"}
              onClick={() => setMobilePane("inspector")}
              className={cn(
                "flex h-full flex-1 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors",
                activeMobilePane === "inspector"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Inspector
            </button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden",
            inspector && activeMobilePane !== "canvas" && "max-lg:hidden"
          )}
        >
          {children}
        </div>
        {inspector && (
          <aside
            className={cn(
              "flex h-full w-80 shrink-0 flex-col overflow-y-auto bg-card max-lg:w-full lg:border-l lg:border-border/60 xl:w-96",
              activeMobilePane !== "inspector" && "max-lg:hidden",
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
