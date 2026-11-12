import { useState, useMemo, useRef, useEffect } from "react"
import { ShieldAlert, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SandboxedEmailFrameProps {
  html: string
  plainText?: string
  hasRemoteImages?: boolean
  className?: string
}

/**
 * SandboxedEmailFrame securely isolates email HTML inside an iframe without script or same-origin execution.
 * It enforces strict sandbox attributes, prevents remote tracker leaks by default,
 * and eliminates dangerouslySetInnerHTML in the host DOM.
 */
export function SandboxedEmailFrame({
  html,
  plainText,
  hasRemoteImages = false,
  className = "",
}: SandboxedEmailFrameProps) {
  const [loadImages, setLoadImages] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(150)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Replace data-saturn-remote-src with src when user explicitly opts in to loading remote images
  const processedHtml = useMemo(() => {
    let source = html?.trim()
    if (!source && plainText) {
      const escaped = plainText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br>")
      source = `<div>${escaped}</div>`
    }
    if (!source) return "<div></div>"

    if (loadImages) {
      // Swap data-saturn-remote-src to src
      source = source.replace(
        /data-saturn-remote-src=(["'])(.*?)\1/gi,
        'src="$2"'
      )
    }

    return source
  }, [html, plainText, loadImages])

  // Construct complete srcDoc document with base styling
  const srcDoc = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>
    :root {
      color-scheme: light dark;
    }
    html, body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
      overflow-wrap: break-word;
      background-color: transparent;
      color: inherit;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      max-width: 100% !important;
    }
    blockquote {
      margin: 0 0 0 0.8ex;
      border-left: 2px solid #94a3b8;
      padding-left: 1ex;
      color: #64748b;
    }
    pre, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  ${processedHtml}
</body>
</html>`
  }, [processedHtml])

  // Dynamically update iframe height to fit contents
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      try {
        const body = iframe.contentDocument?.body
        const htmlEl = iframe.contentDocument?.documentElement
        if (body && htmlEl) {
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            htmlEl.clientHeight,
            htmlEl.scrollHeight,
            htmlEl.offsetHeight
          )
          if (height > 0) {
            setIframeHeight(height + 24)
          }
        }
      } catch {
        // Cross-origin access prevented (expected for sandboxed iframes in some browsers)
      }
    }

    iframe.addEventListener("load", handleLoad)
    return () => {
      iframe.removeEventListener("load", handleLoad)
    }
  }, [srcDoc])

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      {/* Remote Images Blocker Warning Banner */}
      {hasRemoteImages && !loadImages && (
        <div
          data-testid="remote-images-banner"
          className="mb-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
            <span>Remote images are blocked to protect your privacy.</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="load-remote-images-btn"
            onClick={() => setLoadImages(true)}
            className="h-7 gap-1 px-2.5 text-xs font-medium"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Load images</span>
          </Button>
        </div>
      )}

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        data-testid="sandboxed-email-frame"
        title="Email content"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{
          height: `${iframeHeight}px`,
          width: "100%",
          border: "none",
        }}
        className="w-full transition-all"
      />
    </div>
  )
}
