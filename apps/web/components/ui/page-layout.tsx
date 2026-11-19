import { useEffect } from "react"
import type { ElementType, ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PageLayoutProps {
  title: string
  description: string
  icon?: ElementType
  actions?: ReactNode
  children: ReactNode
  emptyNode?: ReactNode
  isEmpty?: boolean
  className?: string
  hideHeader?: boolean
}

export function PageLayout({
  title,
  description,
  icon: Icon,
  actions,
  children,
  emptyNode,
  isEmpty = false,
  className,
  hideHeader = false,
}: PageLayoutProps) {
  useEffect(() => {
    document.title = title ? `${title} | Saturn` : "Saturn"
  }, [title])

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-1 animate-in flex-col gap-6 p-6 duration-300 fade-in",
        className
      )}
    >
      {/* Header section */}
      {!hideHeader && (
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-1">
            <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {Icon && <Icon className="size-5 shrink-0 text-primary" />}
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {actions && (
            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {isEmpty && emptyNode ? (
        <div className="animate-in duration-300 fade-in-50">{emptyNode}</div>
      ) : (
        children
      )}
    </div>
  )
}
export default PageLayout
