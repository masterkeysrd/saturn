import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ai-elements/code-block"
import { cn } from "@/lib/utils"
import { CheckIcon, CopyIcon } from "lucide-react"
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  useRef,
  useState,
} from "react"
import { Streamdown } from "streamdown"

function extractReactText(node: unknown): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractReactText).join("")
  if (
    isValidElement(node) &&
    node.props &&
    typeof node.props === "object" &&
    "children" in node.props
  ) {
    return extractReactText(node.props.children)
  }
  return ""
}

function isValidJsonBlock(raw: string): boolean {
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

function extractTableTsv(tableEl: HTMLTableElement): string {
  const lines: string[] = []
  const rows = Array.from(tableEl.querySelectorAll("tr"))
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim()
    )
    if (cells.length > 0) {
      lines.push(cells.join("\t"))
    }
  }
  return lines.join("\n")
}

function MarkdownTable({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  void _node
  const tableRef = useRef<HTMLTableElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const tableEl = tableRef.current
    if (!tableEl || typeof navigator === "undefined" || !navigator.clipboard) {
      return
    }
    const tsv = extractTableTsv(tableEl)
    void navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div
      data-testid="markdown-table-card"
      className="group/md-table relative my-3 w-full overflow-hidden rounded-xl border border-border/60 bg-card/40"
    >
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy table"
        title="Copy table"
        className="absolute top-1.5 right-1.5 z-10 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-border/60 bg-background/90 px-1.5 text-[10px] font-medium text-muted-foreground opacity-0 shadow-2xs backdrop-blur-xs transition-opacity group-hover/md-table:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        {copied ? (
          <>
            <CheckIcon className="size-3 text-emerald-500" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <CopyIcon className="size-3" />
            <span>Copy</span>
          </>
        )}
      </button>
      <div className="w-full overflow-x-auto">
        <table
          ref={tableRef}
          className={cn(
            "w-full border-collapse text-left text-[13px]",
            className
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    </div>
  )
}

function isLikelyNumericText(children: unknown): boolean {
  if (typeof children === "number") return true
  if (typeof children !== "string") return false
  const trimmed = children.trim()
  if (!trimmed) return false
  return /^[+-]?[$€£¥₹]?\s*\d[\d,.]*\s*(?:%|[A-Z]{3})?$/.test(trimmed)
}

const SATURN_MARKDOWN_COMPONENTS: ComponentProps<
  typeof Streamdown
>["components"] = {
  h1: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <h1
        className={cn(
          "mt-4 mb-2 text-base font-semibold tracking-tight text-foreground first:mt-0",
          className
        )}
        {...props}
      >
        {children}
      </h1>
    )
  },
  h2: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <h2
        className={cn(
          "mt-4 mb-1.5 text-sm font-semibold tracking-tight text-foreground first:mt-0",
          className
        )}
        {...props}
      >
        {children}
      </h2>
    )
  },
  h3: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <h3
        className={cn(
          "mt-3 mb-1 text-[13px] font-semibold text-foreground first:mt-0",
          className
        )}
        {...props}
      >
        {children}
      </h3>
    )
  },
  p: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <p
        className={cn("my-2 leading-relaxed first:mt-0 last:mb-0", className)}
        {...props}
      >
        {children}
      </p>
    )
  },
  pre: ({ children, className, node: _n, ...props }) => {
    void _n
    if (isValidElement(children)) {
      const childProps = children.props as {
        className?: string
        children?: unknown
      }
      const codeClassName =
        typeof childProps.className === "string" ? childProps.className : ""
      const rawText = extractReactText(childProps.children).replace(/\n$/, "")
      const isJsonLang = /\blanguage-jsonc?\b/i.test(codeClassName)
      const hasNoLang = !/\blanguage-[^\s]+/.test(codeClassName)
      if (isJsonLang || (hasNoLang && isValidJsonBlock(rawText))) {
        return (
          <CodeBlock code={rawText} language="json" className="my-3">
            <CodeBlockHeader>
              <span className="font-mono text-[10px] font-medium tracking-wider uppercase">
                json
              </span>
              <CodeBlockCopyButton />
            </CodeBlockHeader>
          </CodeBlock>
        )
      }
      return cloneElement(children as ReactElement<Record<string, unknown>>, {
        "data-block": "true",
      })
    }
    return (
      <pre className={className} {...props}>
        {children}
      </pre>
    )
  },
  table: MarkdownTable,
  thead: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <thead
        className={cn("border-b border-border/60 bg-muted/45", className)}
        {...props}
      >
        {children}
      </thead>
    )
  },
  tbody: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <tbody className={cn("divide-y divide-border/40", className)} {...props}>
        {children}
      </tbody>
    )
  },
  tr: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <tr
        className={cn("transition-colors hover:bg-muted/25", className)}
        {...props}
      >
        {children}
      </tr>
    )
  },
  th: ({ children, className, node: _n, ...props }) => {
    void _n
    return (
      <th
        className={cn(
          "px-3.5 py-2 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase [&[align=center]]:text-center [&[align=right]]:text-right",
          className
        )}
        {...props}
      >
        {children}
      </th>
    )
  },
  td: ({ children, className, node: _n, ...props }) => {
    void _n
    const numeric = !props.align && isLikelyNumericText(children)
    return (
      <td
        className={cn(
          "px-3.5 py-2.5 align-top leading-snug text-foreground tabular-nums [&[align=center]]:text-center [&[align=right]]:text-right",
          numeric && "text-right font-medium whitespace-nowrap",
          className
        )}
        {...props}
      >
        {children}
      </td>
    )
  },
}

export type SaturnMarkdownProps = ComponentProps<typeof Streamdown>

export function SaturnMarkdown({
  className,
  components,
  controls,
  ...props
}: SaturnMarkdownProps) {
  return (
    <Streamdown
      controls={controls ?? { table: false }}
      components={{ ...SATURN_MARKDOWN_COMPONENTS, ...components }}
      className={cn(
        "max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  )
}
