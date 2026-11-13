import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { ShieldAlert, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { cn } from "@/lib/utils"

export interface SandboxedEmailFrameProps {
  html: string
  plainText?: string
  hasRemoteImages?: boolean
  attachments?: Attachment[]
  className?: string
}

/**
 * SandboxedEmailFrame securely isolates email HTML inside an iframe without script execution.
 * It enforces strict sandbox attributes, prevents remote tracker leaks by default,
 * dynamically resizes to content height to eliminate inner scrollbars,
 * and renders rich HTML natively on a clean document canvas without destructive CSS overrides.
 */
export function SandboxedEmailFrame({
  html,
  plainText,
  hasRemoteImages = false,
  attachments = [],
  className = "",
}: SandboxedEmailFrameProps) {
  const [autoLoadImages, setAutoLoadImages] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem("saturn_mail_auto_load_images") === "true"
  })
  const [loadImages, setLoadImages] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(60)
  const [isAppDark, setIsAppDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false
    return document.documentElement.classList.contains("dark")
  })
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const shouldLoadImages = loadImages || autoLoadImages

  // Track root .dark class changes without requiring ThemeProvider in standalone renders
  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const updateTheme = () => {
      setIsAppDark(root.classList.contains("dark"))
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  // Listen to cross-component auto-load images preference changes
  useEffect(() => {
    const handleSync = () => {
      setAutoLoadImages(
        localStorage.getItem("saturn_mail_auto_load_images") === "true"
      )
    }
    window.addEventListener("storage", handleSync)
    window.addEventListener("saturn-mail-auto-load-changed", handleSync)
    return () => {
      window.removeEventListener("storage", handleSync)
      window.removeEventListener("saturn-mail-auto-load-changed", handleSync)
    }
  }, [])

  // Detect whether HTML actually contains remote images (external tracking pixels or remote URLs)
  const containsRemoteImages = useMemo(() => {
    return Boolean(
      hasRemoteImages || (html && html.includes("data-saturn-remote-src"))
    )
  }, [hasRemoteImages, html])

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
      source = `<div style="white-space: pre-wrap; font-family: inherit; font-size: inherit; line-height: inherit;">${escaped}</div>`
    }
    if (!source) return "<div></div>"

    // Strip any <script> tags or inline event handlers to guarantee clean sandbox execution
    source = source.replace(/<script\b[\s\S]*?<\/script>/gi, "")
    source = source.replace(/<script\b[^>]*>/gi, "")
    source = source.replace(
      /\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
      ""
    )

    // 1. Resolve and rewrite cid: inline attachments to authenticated download URLs
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.contentId && att.downloadUrl) {
          const cleanCid = att.contentId.replace(/^<|>$/g, "").trim()
          source = source.replaceAll(`cid:${cleanCid}`, att.downloadUrl)
          source = source.replaceAll(`CID:${cleanCid}`, att.downloadUrl)
          source = source.replaceAll(`cid:<${cleanCid}>`, att.downloadUrl)
          source = source.replaceAll(`CID:<${cleanCid}>`, att.downloadUrl)
        }
        if (att.filename && att.isInline && att.downloadUrl) {
          source = source.replaceAll(`cid:${att.filename}`, att.downloadUrl)
          source = source.replaceAll(`CID:${att.filename}`, att.downloadUrl)
        }
      }
    }

    // 2. Swap remote tracker images when opted-in or auto-load enabled
    if (shouldLoadImages) {
      source = source.replace(
        /data-saturn-remote-src=(["'])(.*?)\1/gi,
        'src="$2"'
      )
    }

    return source
  }, [html, plainText, attachments, shouldLoadImages])

  // Construct complete srcDoc document on clean light paper matching Gmail Web
  const srcDoc = useMemo(() => {
    const bodyPaddingCss = isAppDark
      ? "padding: 12px 16px; box-sizing: border-box;"
      : "padding: 0;"

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
      overflow-x: hidden;
    }
    html, body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      background-color: #ffffff;
      color: #18181b;
      overflow-y: hidden !important;
      word-break: break-word;
    }
    body {
      overflow-x: auto;
      ${bodyPaddingCss}
    }
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      max-width: 100% !important;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="saturn-email-root" style="display: flow-root; width: 100%; height: auto !important; min-height: 0 !important;">${processedHtml}</div>
  <style>html, body { height: auto !important; min-height: 0 !important; }</style>
</body>
</html>`
  }, [processedHtml, isAppDark])

  // Height measurement function
  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument
      if (!doc) return
      const body = doc.body
      if (!body) return

      const root = doc.getElementById("saturn-email-root")
      const contentHeight = root
        ? Math.ceil(
            Math.max(root.scrollHeight, root.getBoundingClientRect().height)
          )
        : Math.ceil(body.scrollHeight)
      const verticalPadding = root && isAppDark ? 24 : 0
      const nextHeight = contentHeight + verticalPadding

      if (nextHeight > 0) {
        setIframeHeight((prev) => (prev === nextHeight ? prev : nextHeight))
      }
    } catch {
      // Fallback
    }
  }, [isAppDark])

  // Dynamically update iframe height to eliminate inner scrollbars
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let resizeObserver: ResizeObserver | null = null

    const handleLoad = () => {
      updateHeight()

      try {
        const doc = iframe.contentDocument
        if (doc?.body) {
          const target = doc.getElementById("saturn-email-root") || doc.body
          if (typeof window !== "undefined" && window.ResizeObserver) {
            resizeObserver = new ResizeObserver(() => {
              updateHeight()
            })
            resizeObserver.observe(target)
          }

          // Attach listeners to images for height recalculation when images finish downloading
          const images = doc.images || []
          for (let i = 0; i < images.length; i++) {
            images[i].addEventListener("load", updateHeight)
          }
        }
      } catch {
        // Fallback
      }
    }

    iframe.addEventListener("load", handleLoad)

    if (iframe.contentDocument?.readyState === "complete") {
      handleLoad()
    }

    return () => {
      iframe.removeEventListener("load", handleLoad)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [srcDoc, updateHeight])

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Top Banner: Remote Images Blocker */}
      {containsRemoteImages && !shouldLoadImages ? (
        <div
          data-testid="remote-images-banner"
          className="mb-3 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400"
        >
          <div className="flex items-center gap-1.5 truncate">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate">
              Remote images are blocked to protect your privacy.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="load-remote-images-btn"
              onClick={() => setLoadImages(true)}
              className="h-6 gap-1 px-2 text-[11px] font-medium"
            >
              <ImageIcon className="h-3 w-3" />
              <span>Load images</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="always-load-images-btn"
              onClick={() => {
                setAutoLoadImages(true)
                setLoadImages(true)
                try {
                  localStorage.setItem("saturn_mail_auto_load_images", "true")
                  window.dispatchEvent(
                    new Event("saturn-mail-auto-load-changed")
                  )
                } catch {
                  // ignore
                }
              }}
              className="h-6 px-1.5 text-[11px] text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
              title="Automatically load remote images for all messages"
            >
              <span>Always load</span>
            </Button>
          </div>
        </div>
      ) : autoLoadImages && containsRemoteImages ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <span>Images auto-loaded</span>
          <button
            type="button"
            onClick={() => {
              setAutoLoadImages(false)
              setLoadImages(false)
              try {
                localStorage.removeItem("saturn_mail_auto_load_images")
                window.dispatchEvent(new Event("saturn-mail-auto-load-changed"))
              } catch {
                // ignore
              }
            }}
            className="text-primary hover:underline"
          >
            (block by default)
          </button>
        </div>
      ) : null}

      {/* Email Canvas Container */}
      <div
        data-testid="sandboxed-email-container"
        className={cn(
          "relative w-full min-w-0 overflow-hidden rounded-lg transition-colors",
          isAppDark ? "bg-white" : "bg-transparent"
        )}
      >
        <iframe
          ref={iframeRef}
          data-testid="sandboxed-email-frame"
          title="Email content"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          scrolling="no"
          srcDoc={srcDoc}
          style={{
            height: `${iframeHeight}px`,
            width: "100%",
            border: "none",
            overflow: "hidden",
          }}
          className="w-full"
        />
      </div>
    </div>
  )
}
