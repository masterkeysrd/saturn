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
import { Streamdown } from "streamdown"

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
    const userToggledRef = useRef(false)
    const isOpen = controlledOpen ?? uncontrolledOpen

    const setIsOpen = useCallback(
      (next: boolean) => {
        userToggledRef.current = true
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
        setDuration(
          Math.max(1, Math.ceil((Date.now() - startRef.current) / 1000))
        )
        startRef.current = null
        if (controlledOpen === undefined && !userToggledRef.current) {
          setUncontrolledOpen(false)
        }
      }
    }, [controlledOpen, isStreaming])

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
          className={cn("not-prose mb-2", className)}
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
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode
}

const defaultThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming) return "Thinking..."
  if (duration !== undefined) return `Thought for ${duration}s`
  return "Thought process"
}

export const ReasoningTrigger = ({
  className,
  children,
  getThinkingMessage = defaultThinkingMessage,
  ...props
}: ReasoningTriggerProps) => {
  const { isStreaming, isOpen, duration } = useReasoning()

  return (
    <CollapsibleTrigger
      className={cn(
        "flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <BrainIcon
            className={cn(
              "size-3.5",
              isStreaming && "animate-pulse text-primary"
            )}
          />
          <span className={cn(isStreaming && "animate-pulse text-foreground")}>
            {getThinkingMessage(isStreaming, duration)}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform",
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
        "mt-2 border-l-2 border-border/60 pl-3 text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      <Streamdown className="prose prose-xs dark:prose-invert max-w-none">
        {children}
      </Streamdown>
    </CollapsibleContent>
  )
)

ReasoningContent.displayName = "ReasoningContent"
