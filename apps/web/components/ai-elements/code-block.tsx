import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CheckIcon, CopyIcon } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

interface CodeBlockContextValue {
  code: string
}

const CodeBlockContext = createContext<CodeBlockContextValue>({ code: "" })

export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string
  language?: string
  showLineNumbers?: boolean
}

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-between border-b border-border/50 bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export const CodeBlockCopyButton = ({
  onCopy,
  timeout = 2000,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  onCopy?: () => void
  timeout?: number
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number>(0)
  const { code } = useContext(CodeBlockContext)

  const copyToClipboard = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setIsCopied(true)
      onCopy?.()
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout)
    } catch {
      // Ignore clipboard write errors in restricted contexts
    }
  }, [code, onCopy, timeout])

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    []
  )

  return (
    <Button
      className={cn("size-7 shrink-0 cursor-pointer", className)}
      onClick={copyToClipboard}
      size="icon-sm"
      type="button"
      variant="ghost"
      aria-label="Copy code"
      {...props}
    >
      {children ??
        (isCopied ? (
          <CheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3.5" />
        ))}
    </Button>
  )
}

export const CodeBlock = ({
  code,
  language = "json",
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const ctxValue = useMemo(() => ({ code }), [code])
  const lines = useMemo(() => code.split("\n"), [code])

  return (
    <CodeBlockContext.Provider value={ctxValue}>
      <div
        data-language={language}
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted/30 text-foreground",
          className
        )}
        {...props}
      >
        {children}
        <div className="overflow-x-auto">
          <pre className="m-0 p-3 font-mono text-xs leading-relaxed">
            <code>
              {showLineNumbers
                ? lines.map((line, i) => (
                    <span key={i} className="flex gap-3">
                      <span className="w-6 shrink-0 text-right text-muted-foreground/50 select-none">
                        {i + 1}
                      </span>
                      <span>{line || " "}</span>
                    </span>
                  ))
                : code}
            </code>
          </pre>
        </div>
      </div>
    </CodeBlockContext.Provider>
  )
}
