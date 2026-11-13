import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { stripHtmlToPlainText } from "@saturn/core"

export type EmailEditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "heading2"
  | "bulletList"
  | "orderedList"
  | "blockquote"

export interface EmailEditorActiveFormats {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  heading2: boolean
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
}

const EMPTY_ACTIVE_FORMATS: EmailEditorActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  heading2: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
}

export interface EmailRichEditorHandle {
  getHTML: () => string
  getText: () => string
  execFormat: (command: EmailEditorCommand) => void
  revealRemoteImages: () => void
  focus: () => void
}

export interface EmailRichEditorProps {
  bodyHtml: string
  stylesHtml?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  autoFocus?: boolean
  testId?: string
  onContentChange?: () => void
  onSubmitShortcut?: () => void
  onActiveFormatsChange?: (formats: EmailEditorActiveFormats) => void
}

function buildEditorDocumentHtml(params: {
  bodyHtml: string
  stylesHtml: string
  placeholder: string
  minHeight: number
}): string {
  const { bodyHtml, stylesHtml, placeholder, minHeight } = params

  const isEmpty = !bodyHtml.trim()

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>
    :root {
      color-scheme: light;
    }
    html {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    body {
      margin: 0;
      padding: 12px 16px;
      box-sizing: border-box;
      min-height: ${minHeight}px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      background-color: #ffffff;
      color: #18181b;
      outline: none;
      word-break: break-word;
    }
    body[data-empty="true"]::before {
      content: attr(data-placeholder);
      color: #a1a1aa;
      pointer-events: none;
      display: block;
      height: 0;
    }
    p {
      margin: 0 0 0.5rem 0;
    }
    p:last-child {
      margin-bottom: 0;
    }
    h2 {
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.35;
      margin: 0.75rem 0 0.375rem 0;
    }
    ul {
      list-style-type: disc;
      padding-left: 1.375rem;
      margin: 0.375rem 0 0.5rem 0;
    }
    ol {
      list-style-type: decimal;
      padding-left: 1.375rem;
      margin: 0.375rem 0 0.5rem 0;
    }
    blockquote {
      border-left: 2px solid #d4d4d8;
      padding-left: 0.75rem;
      margin: 0.5rem 0;
      color: #52525b;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      max-width: 100%;
    }
    table[align="center"] {
      margin-left: auto;
      margin-right: auto;
    }
    center > table,
    td[align="center"] > table {
      margin-left: auto;
      margin-right: auto;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
  ${stylesHtml}
  <style>
    html, body {
      height: auto !important;
    }
    body {
      padding: 14px 18px !important;
      box-sizing: border-box !important;
    }
  </style>
</head>
<body contenteditable="true" spellcheck="true" data-empty="${isEmpty ? "true" : "false"}" data-placeholder="${placeholder.replace(/"/g, "&quot;")}">${bodyHtml}</body>
</html>`
}

function readActiveFormats(doc: Document): EmailEditorActiveFormats {
  try {
    const block = (doc.queryCommandValue("formatBlock") || "").toLowerCase()
    return {
      bold: Boolean(doc.queryCommandState("bold")),
      italic: Boolean(doc.queryCommandState("italic")),
      underline: Boolean(doc.queryCommandState("underline")),
      strike: Boolean(doc.queryCommandState("strikeThrough")),
      bulletList: Boolean(doc.queryCommandState("insertUnorderedList")),
      orderedList: Boolean(doc.queryCommandState("insertOrderedList")),
      heading2: block === "h2" || block === "<h2>",
      blockquote: block === "blockquote" || block === "<blockquote>",
    }
  } catch {
    return EMPTY_ACTIVE_FORMATS
  }
}

function isBodyEmpty(body: HTMLElement): boolean {
  const text = (body.textContent || "").trim()
  if (text.length > 0) return false
  return !body.querySelector("img, table, hr")
}

function focusEditorAtStart(iframe: HTMLIFrameElement | null) {
  const doc = iframe?.contentDocument
  const body = doc?.body
  if (!doc || !body) return

  iframe.focus()
  body.focus()

  try {
    const sel = doc.getSelection()
    if (!sel) return
    const range = doc.createRange()
    const target = body.firstElementChild || body
    range.setStart(target, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    // Ignore selection errors in headless environments
  }
}

export const EmailRichEditor = forwardRef<
  EmailRichEditorHandle,
  EmailRichEditorProps
>(function EmailRichEditor(
  {
    bodyHtml,
    stylesHtml = "",
    placeholder = "Write your email here...",
    minHeight = 160,
    maxHeight,
    autoFocus = false,
    testId = "composer-editor-content",
    onContentChange,
    onSubmitShortcut,
    onActiveFormatsChange,
  },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isDirtyRef = useRef(false)
  const hasAutoFocusedRef = useRef(false)
  const lastWrittenPropHtmlRef = useRef<string | null>(null)
  const [iframeHeight, setIframeHeight] = useState(minHeight)

  const onContentChangeRef = useRef(onContentChange)
  const onSubmitShortcutRef = useRef(onSubmitShortcut)
  const onActiveFormatsChangeRef = useRef(onActiveFormatsChange)
  useEffect(() => {
    onContentChangeRef.current = onContentChange
    onSubmitShortcutRef.current = onSubmitShortcut
    onActiveFormatsChangeRef.current = onActiveFormatsChange
  })

  const measureHeight = useCallback(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc?.body) return

    const measured = Math.ceil(doc.body.scrollHeight)
    if (measured > 0) {
      const nextHeight = Math.max(minHeight, measured)
      setIframeHeight((prev) => (prev === nextHeight ? prev : nextHeight))
    }
  }, [minHeight])

  const writeDocument = useCallback(
    (htmlContent: string, activeStyles: string) => {
      const iframe = iframeRef.current
      const doc = iframe?.contentDocument
      if (!doc) return () => {}

      const fullDoc = buildEditorDocumentHtml({
        bodyHtml: htmlContent,
        stylesHtml: activeStyles,
        placeholder,
        minHeight,
      })

      doc.open()
      doc.write(fullDoc)
      doc.close()

      const body = doc.body
      if (!body) return () => {}

      body.setAttribute("contenteditable", "true")
      body.dataset.empty = isBodyEmpty(body) ? "true" : "false"

      const handleInput = () => {
        isDirtyRef.current = true
        body.dataset.empty = isBodyEmpty(body) ? "true" : "false"
        measureHeight()
        onContentChangeRef.current?.()
        onActiveFormatsChangeRef.current?.(readActiveFormats(doc))
      }

      const handleSelectionOrKey = () => {
        onActiveFormatsChangeRef.current?.(readActiveFormats(doc))
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          onSubmitShortcutRef.current?.()
        }
      }

      body.addEventListener("input", handleInput)
      body.addEventListener("keyup", handleSelectionOrKey)
      body.addEventListener("mouseup", handleSelectionOrKey)
      body.addEventListener("keydown", handleKeyDown)
      doc.addEventListener("selectionchange", handleSelectionOrKey)

      let resizeObserver: ResizeObserver | null = null
      if (typeof window !== "undefined" && window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          measureHeight()
        })
        resizeObserver.observe(body)
      }

      const images = doc.images || []
      for (let i = 0; i < images.length; i++) {
        images[i].addEventListener("load", measureHeight)
      }

      measureHeight()

      if (autoFocus && !hasAutoFocusedRef.current) {
        hasAutoFocusedRef.current = true
        requestAnimationFrame(() => {
          focusEditorAtStart(iframeRef.current)
        })
      }

      return () => {
        body.removeEventListener("input", handleInput)
        body.removeEventListener("keyup", handleSelectionOrKey)
        body.removeEventListener("mouseup", handleSelectionOrKey)
        body.removeEventListener("keydown", handleKeyDown)
        doc.removeEventListener("selectionchange", handleSelectionOrKey)
        resizeObserver?.disconnect()
      }
    },
    [autoFocus, placeholder, minHeight, measureHeight]
  )

  const propKey = useMemo(
    () => `${stylesHtml}\0${bodyHtml}`,
    [stylesHtml, bodyHtml]
  )

  useEffect(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return

    if (!isDirtyRef.current || lastWrittenPropHtmlRef.current === null) {
      lastWrittenPropHtmlRef.current = propKey
      return writeDocument(bodyHtml, stylesHtml)
    }

    return undefined
  }, [propKey, bodyHtml, stylesHtml, writeDocument])

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => {
        const liveBody = iframeRef.current?.contentDocument?.body
        const inner = liveBody ? liveBody.innerHTML : bodyHtml
        if (!inner && !stylesHtml) return ""
        return stylesHtml ? `${stylesHtml}${inner}` : inner
      },
      getText: () => {
        const liveBody = iframeRef.current?.contentDocument?.body
        if (liveBody) {
          return (liveBody.innerText ?? liveBody.textContent ?? "").trim()
        }
        return stripHtmlToPlainText(bodyHtml)
      },
      execFormat: (command: EmailEditorCommand) => {
        const doc = iframeRef.current?.contentDocument
        const body = doc?.body
        if (!doc || !body) return

        body.focus()
        const currentFormats = readActiveFormats(doc)

        switch (command) {
          case "bold":
            doc.execCommand("bold")
            break
          case "italic":
            doc.execCommand("italic")
            break
          case "underline":
            doc.execCommand("underline")
            break
          case "strike":
            doc.execCommand("strikeThrough")
            break
          case "bulletList":
            doc.execCommand("insertUnorderedList")
            break
          case "orderedList":
            doc.execCommand("insertOrderedList")
            break
          case "heading2":
            doc.execCommand(
              "formatBlock",
              false,
              currentFormats.heading2 ? "p" : "h2"
            )
            break
          case "blockquote":
            doc.execCommand(
              "formatBlock",
              false,
              currentFormats.blockquote ? "p" : "blockquote"
            )
            break
        }

        isDirtyRef.current = true
        body.dataset.empty = isBodyEmpty(body) ? "true" : "false"
        measureHeight()
        onContentChangeRef.current?.()
        onActiveFormatsChangeRef.current?.(readActiveFormats(doc))
      },
      revealRemoteImages: () => {
        const doc = iframeRef.current?.contentDocument
        if (!doc?.body) return
        const imgs = doc.body.querySelectorAll("img[data-saturn-remote-src]")
        imgs.forEach((img) => {
          const remoteSrc = img.getAttribute("data-saturn-remote-src")
          if (remoteSrc) {
            img.setAttribute("src", remoteSrc)
            img.removeAttribute("data-saturn-remote-src")
          }
        })
        measureHeight()
      },
      focus: () => {
        focusEditorAtStart(iframeRef.current)
      },
    }),
    [bodyHtml, stylesHtml, measureHeight]
  )

  return (
    <div
      className="relative w-full overflow-hidden bg-white"
      style={
        maxHeight
          ? { maxHeight: `${maxHeight}px`, overflowY: "auto" }
          : undefined
      }
    >
      <iframe
        ref={iframeRef}
        data-testid={testId}
        title="Email composer editor"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{
          height: `${iframeHeight}px`,
          width: "100%",
          border: "none",
          display: "block",
        }}
        className="w-full"
      />
    </div>
  )
})
