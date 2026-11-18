import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { BrainIcon, ChevronDownIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { SaturnMarkdown } from "./markdown-components"

interface ReasoningContextValue {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration: number | undefined
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null)

const useReasoning = () => {
  const ctx = useContext(ReasoningContext)
  if (!ctx) {
    throw new Error("Reasoning components must be used within Reasoning")
  }
  return ctx
}

export type ReasoningProps = Omit<
  ComponentProps<typeof Collapsible>,
  "onOpenChange"
> & {
  isStreaming?: boolean
  duration?: number
  onOpenChange?: (open: boolean) => void
}

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open: controlledOpen,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(
      defaultOpen ?? isStreaming
    )
    const [userToggled, setUserToggled] = useState(false)
    const isOpen =
      controlledOpen ?? (isStreaming && !userToggled ? true : uncontrolledOpen)

    const setIsOpen = useCallback(
      (next: boolean) => {
        setUserToggled(true)
        if (controlledOpen === undefined) {
          setUncontrolledOpen(next)
        }
        onOpenChange?.(next)
      },
      [controlledOpen, onOpenChange]
    )

    const [duration, setDuration] = useState<number | undefined>(durationProp)
    const startRef = useRef<number | null>(null)

    useEffect(() => {
      if (isStreaming) {
        if (startRef.current === null) {
          startRef.current = Date.now()
        }
      } else if (startRef.current !== null) {
        const elapsedSec = Math.max(
          1,
          Math.ceil((Date.now() - startRef.current) / 1000)
        )
        startRef.current = null
        setDuration(elapsedSec)
        if (controlledOpen === undefined && !userToggled) {
          setUncontrolledOpen(false)
        }
      }
    }, [controlledOpen, isStreaming, userToggled])

    const ctxValue = useMemo(
      () => ({
        isStreaming,
        isOpen,
        setIsOpen,
        duration: durationProp ?? duration,
      }),
      [isStreaming, isOpen, setIsOpen, durationProp, duration]
    )

    return (
      <ReasoningContext.Provider value={ctxValue}>
        <Collapsible
          className={cn(
            "not-prose mb-2 rounded-xl border transition-colors",
            isStreaming
              ? "border-primary/35 bg-primary/[0.03]"
              : "border-border/50 bg-muted/20",
            className
          )}
          open={isOpen}
          onOpenChange={setIsOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    )
  }
)

Reasoning.displayName = "Reasoning"

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  preview?: string
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

const defaultThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming) return "Thinking…"
  if (duration !== undefined) return `Thought for ${duration}s`
  return "Thought process"
}

export const ReasoningTrigger = ({
  className,
  children,
  preview,
  getThinkingMessage = defaultThinkingMessage,
  ...props
}: ReasoningTriggerProps) => {
  const { isStreaming, isOpen, duration } = useReasoning()
  const singleLinePreview = useMemo(() => {
    if (!preview) return ""
    return preview.replace(/\s+/g, " ").trim()
  }, [preview])

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BrainIcon
              className={cn(
                "size-3.5 shrink-0 text-violet-500",
                isStreaming && "animate-pulse text-primary"
              )}
            />
            <span
              className={cn(
                "shrink-0",
                isStreaming && "animate-pulse text-foreground"
              )}
            >
              {getThinkingMessage(isStreaming, duration)}
            </span>
            {!isOpen && singleLinePreview && (
              <span className="hidden truncate font-normal text-muted-foreground/80 sm:inline">
                · {singleLinePreview}
              </span>
            )}
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  )
}

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string
}

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        "border-t border-border/40 px-3 py-2.5 text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      <SaturnMarkdown>{children}</SaturnMarkdown>
    </CollapsibleContent>
  )
)

ReasoningContent.displayName = "ReasoningContent"
