import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  prettifyJsonValue,
  tokenizeJson,
  type JsonSyntaxToken,
  type JsonSyntaxTokenType,
} from "@saturn/core"
import { CheckIcon, CopyIcon } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  Fragment,
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

const TOKEN_CLASS_MAP: Partial<Record<JsonSyntaxTokenType, string>> = {
  key: "text-syntax-key font-medium",
  string: "text-syntax-string",
  number: "text-syntax-number",
  boolean: "text-syntax-boolean font-medium",
  null: "text-syntax-null italic",
  punctuation: "text-syntax-punctuation",
}

function isParsableJsonBlock(raw: string): boolean {
  const trimmed = raw.trim()
  if (!(
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  )) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return (
      Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null)
    )
  } catch {
    return false
  }
}

function isJsonCode(code: string, language?: string): boolean {
  const normalized = language?.trim().toLowerCase()
  if (normalized === "json" || normalized === "jsonc") {
    return true
  }
  if (!normalized) {
    return isParsableJsonBlock(code)
  }
  return false
}

function splitTokensByLine(tokens: JsonSyntaxToken[]): JsonSyntaxToken[][] {
  const lines: JsonSyntaxToken[][] = [[]]
  for (const token of tokens) {
    if (!token.value.includes("\n")) {
      lines[lines.length - 1].push(token)
      continue
    }
    const parts = token.value.split("\n")
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        lines[lines.length - 1].push({ type: token.type, value: parts[i] })
      }
      if (i < parts.length - 1) {
        lines.push([])
      }
    }
  }
  return lines
}

function renderToken(token: JsonSyntaxToken, idx: number) {
  const cls = TOKEN_CLASS_MAP[token.type]
  if (!cls) {
    return <Fragment key={idx}>{token.value}</Fragment>
  }
  return (
    <span key={idx} className={cls}>
      {token.value}
    </span>
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
  const shouldHighlightJson = useMemo(
    () => isJsonCode(code, language),
    [code, language]
  )
  const formattedCode = useMemo(
    () =>
      shouldHighlightJson
        ? prettifyJsonValue(code, { unwrapNestedJsonStrings: true })
        : code,
    [code, shouldHighlightJson]
  )
  const jsonTokens = useMemo(
    () => (shouldHighlightJson ? tokenizeJson(formattedCode) : null),
    [formattedCode, shouldHighlightJson]
  )
  const ctxValue = useMemo(() => ({ code: formattedCode }), [formattedCode])
  const lines = useMemo(() => formattedCode.split("\n"), [formattedCode])
  const tokenLines = useMemo(
    () =>
      jsonTokens && showLineNumbers ? splitTokensByLine(jsonTokens) : null,
    [jsonTokens, showLineNumbers]
  )

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
        {children ?? (
          <CodeBlockCopyButton className="absolute top-1.5 right-1.5 z-10 border border-border/50 bg-background/85 opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
        )}
        <div className="overflow-x-auto">
          <pre className="m-0 p-3 font-mono text-xs leading-relaxed">
            <code>
              {showLineNumbers
                ? tokenLines
                  ? tokenLines.map((lineTokens, i) => (
                      <span key={i} className="flex gap-3">
                        <span className="w-6 shrink-0 text-right text-muted-foreground/50 select-none">
                          {i + 1}
                        </span>
                        <span>
                          {lineTokens.length > 0
                            ? lineTokens.map(renderToken)
                            : " "}
                        </span>
                      </span>
                    ))
                  : lines.map((line, i) => (
                      <span key={i} className="flex gap-3">
                        <span className="w-6 shrink-0 text-right text-muted-foreground/50 select-none">
                          {i + 1}
                        </span>
                        <span>{line || " "}</span>
                      </span>
                    ))
                : jsonTokens
                  ? jsonTokens.map(renderToken)
                  : formattedCode}
            </code>
          </pre>
        </div>
      </div>
    </CodeBlockContext.Provider>
  )
}
