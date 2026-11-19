import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { ShieldAlert, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@saturn/hooks"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { restoreRemoteImageSrc, sanitizeEmailHtml } from "@saturn/core"
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
  const { t } = useI18n()
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
      hasRemoteImages ||
      (html &&
        (/data-saturn-remote-(?:src|srcset|background|style)/i.test(html) ||
          /<(?:img|image|source)\b[^>]*\b(?:src|srcset)\s*=\s*["']?(?:https?:|\/\/)/i.test(
            html
          ) ||
          /poster\s*=\s*["']https?:/i.test(html) ||
          /url\(\s*["']?https?:/i.test(html)))
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

    // Strip any <script> tags, dangerous embeds/URIs, or remote CSS/poster URLs when blocked
    source = sanitizeEmailHtml(source, {
      allowRemoteImages: shouldLoadImages,
    }).html

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
      source = restoreRemoteImageSrc(source)
    }

    return source
  }, [html, plainText, attachments, shouldLoadImages])

  const srcDocSig = useMemo(
    () =>
      `${processedHtml.length}:${shouldLoadImages ? 1 : 0}:${isAppDark ? 1 : 0}`,
    [processedHtml, shouldLoadImages, isAppDark]
  )

  // Construct complete srcDoc document on clean light paper matching Gmail Web
  const srcDoc = useMemo(() => {
    const bodyPaddingCss = isAppDark
      ? "padding: 12px 16px; box-sizing: border-box;"
      : "padding: 0;"
    const appOrigin =
      typeof window !== "undefined" &&
      window.location?.origin &&
      window.location.origin !== "null"
        ? window.location.origin
        : ""
    const originSource = appOrigin ? ` ${appOrigin}` : ""
    const baseHref = appOrigin ? `${appOrigin}/` : ""
    const cspContent = shouldLoadImages
      ? `default-src 'none'; img-src https: http: data: blob: 'self'${originSource}; media-src https: http: data: blob: 'self'${originSource}; style-src 'unsafe-inline'; font-src https: http: data: 'self'${originSource}; script-src 'none'; object-src 'none'; frame-src 'none';`
      : `default-src 'none'; img-src data: blob: 'self'${originSource}; style-src 'unsafe-inline'; font-src data: 'self'${originSource}; script-src 'none'; object-src 'none'; frame-src 'none';`
    const baseTag = baseHref
      ? `<base href="${baseHref}" target="_blank">`
      : `<base target="_blank">`

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${cspContent}">
  ${baseTag}
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
      overflow-wrap: break-word;
    }
    body {
      overflow-x: auto;
      ${bodyPaddingCss}
    }
    /* Preserve explicit icon heights & small icon intrinsic widths (e.g. GitHub octicons/checks) while allowing large banners to shrink */
    img {
      max-width: 100%;
    }
    img:not([height]):not([style*="height"]) {
      height: auto;
    }
    img[width="12"],
    img[width="14"],
    img[width="16"],
    img[width="18"],
    img[width="20"],
    img[width="24"],
    img[width="28"],
    img[width="32"] {
      max-width: none;
    }
    img[align="absmiddle"],
    img[align="middle"] {
      vertical-align: middle;
    }
    img[align="absbottom"] {
      vertical-align: bottom;
    }
    img[align="texttop"] {
      vertical-align: text-top;
    }
    table {
      line-height: normal;
    }
    img[data-saturn-remote-src]:not([src])[alt=""],
    img[data-saturn-remote-src]:not([src])[width="1"],
    img[data-saturn-remote-src]:not([src])[height="1"] {
      display: none !important;
    }
    #saturn-email-root [style*="100vh"],
    #saturn-email-root table[height="100%"],
    #saturn-email-root td[height="100%"] {
      height: auto !important;
      min-height: 0 !important;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="saturn-email-viewport" style="width: 100%; overflow-x: auto; overflow-y: hidden;">
    <div id="saturn-email-root" data-srcdoc-sig="${srcDocSig}" style="display: flow-root; width: 100%; height: auto !important; min-height: 0 !important;">${processedHtml}</div>
  </div>
  <style>html, body { height: auto !important; min-height: 0 !important; }</style>
</body>
</html>`
  }, [processedHtml, isAppDark, shouldLoadImages, srcDocSig])

  // Height measurement function
  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument
      if (!doc) return
      const body = doc.body
      if (!body) return

      const viewport =
        typeof doc.getElementById === "function"
          ? doc.getElementById("saturn-email-viewport")
          : null
      const root =
        typeof doc.getElementById === "function"
          ? doc.getElementById("saturn-email-root")
          : null

      let contentHeight = 0
      if (root) {
        if (root.style) {
          root.style.transform = "none"
          root.style.width = "100%"
        }
        if (viewport?.style) {
          viewport.style.height = "auto"
        }

        const availWidth =
          viewport?.clientWidth || doc.documentElement?.clientWidth || 0
        const naturalWidth = root.scrollWidth || 0
        let scale = 1

        if (availWidth > 0 && naturalWidth > availWidth + 2) {
          scale = Math.max(0.55, availWidth / naturalWidth)
          if (root.style) {
            root.style.width = `${naturalWidth}px`
            root.style.transformOrigin = "top left"
            root.style.transform = `scale(${scale})`
          }
        }

        contentHeight = Math.ceil(
          Math.max(
            root.getBoundingClientRect().height,
            (root.scrollHeight || 0) * scale
          )
        )

        if (viewport?.style && scale < 1 && contentHeight > 0) {
          viewport.style.height = `${contentHeight}px`
        }
      } else {
        contentHeight = Math.ceil(body.scrollHeight)
      }

      const verticalPadding = root && isAppDark ? 24 : 0
      const nextHeight = contentHeight + verticalPadding

      if (nextHeight > 0) {
        setIframeHeight((prev) => (prev === nextHeight ? prev : nextHeight))
      }
    } catch {
      // Fallback
    }
  }, [isAppDark])

  // Dynamically update iframe height to eliminate inner scrollbars without waiting
  // for slow external images to finish/timeout before `iframe.onload` fires.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let observedDoc: Document | null = null
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let rafId: number | null = null
    let reflowRafId: number | null = null
    let reflowTimerId: ReturnType<typeof setTimeout> | null = null
    let docCleanups: Array<() => void> = []
    const boundImages = new WeakSet<HTMLImageElement>()

    const clearPendingReflows = () => {
      if (reflowRafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(reflowRafId)
        reflowRafId = null
      }
      if (reflowTimerId !== null) {
        clearTimeout(reflowTimerId)
        reflowTimerId = null
      }
    }

    const scheduleUpdateHeight = () => {
      updateHeight()
      if (typeof requestAnimationFrame === "function") {
        if (
          reflowRafId !== null &&
          typeof cancelAnimationFrame === "function"
        ) {
          cancelAnimationFrame(reflowRafId)
        }
        reflowRafId = requestAnimationFrame(() => {
          reflowRafId = null
          updateHeight()
        })
      }
      if (reflowTimerId !== null) {
        clearTimeout(reflowTimerId)
      }
      reflowTimerId = setTimeout(() => {
        reflowTimerId = null
        updateHeight()
      }, 80)
    }

    const teardownDocObservers = () => {
      clearPendingReflows()
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (mutationObserver) {
        mutationObserver.disconnect()
        mutationObserver = null
      }
      for (const fn of docCleanups) {
        fn()
      }
      docCleanups = []
    }

    const bindImages = (doc: Document) => {
      const images = doc.images || []
      let hasComplete = false
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        if (!img || boundImages.has(img)) continue
        boundImages.add(img)

        const widthAttr = Number.parseInt(
          typeof img.getAttribute === "function"
            ? img.getAttribute("width") || ""
            : "",
          10
        )
        if (widthAttr > 0 && widthAttr <= 48 && img.style) {
          img.style.maxWidth = "none"
        }

        if (img.complete) {
          hasComplete = true
        }
        img.addEventListener("load", scheduleUpdateHeight)
        img.addEventListener("error", scheduleUpdateHeight)
        docCleanups.push(() => {
          img.removeEventListener("load", scheduleUpdateHeight)
          img.removeEventListener("error", scheduleUpdateHeight)
        })
      }
      if (hasComplete) {
        scheduleUpdateHeight()
      }
    }

    const attachToSrcDoc = (): boolean => {
      try {
        const doc = iframe.contentDocument
        const root = doc?.getElementById("saturn-email-root")
        // Initial `about:blank` or outgoing `srcDoc` document has readyState === "complete"
        // before the new `srcDoc` replaces `contentDocument`; verify `#saturn-email-root` matches.
        if (!doc || !root) {
          return false
        }
        if (typeof root.getAttribute === "function") {
          const domSig = root.getAttribute("data-srcdoc-sig")
          if (domSig && domSig !== srcDocSig) {
            return false
          }
        }

        updateHeight()

        if (doc !== observedDoc) {
          teardownDocObservers()
          observedDoc = doc

          if (typeof window !== "undefined" && window.ResizeObserver) {
            try {
              resizeObserver = new ResizeObserver(() => {
                updateHeight()
              })
              resizeObserver.observe(root)
            } catch {
              // Ignore non-Element test mocks
            }
          }

          if (typeof MutationObserver !== "undefined") {
            try {
              mutationObserver = new MutationObserver(() => {
                bindImages(doc)
                updateHeight()
              })
              mutationObserver.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
              })
            } catch {
              // Ignore non-Node test mocks
            }
          }

          if (typeof doc.addEventListener === "function") {
            doc.addEventListener("DOMContentLoaded", updateHeight)
            docCleanups.push(() =>
              doc.removeEventListener("DOMContentLoaded", updateHeight)
            )
          }

          if (doc.fonts?.ready) {
            void doc.fonts.ready.then(updateHeight).catch(() => undefined)
          }
        }

        bindImages(doc)
        return doc.readyState !== "loading"
      } catch {
        return false
      }
    }

    const handleLoad = () => {
      attachToSrcDoc()
      updateHeight()
    }

    iframe.addEventListener("load", handleLoad)
    window.addEventListener("resize", updateHeight)

    if (!attachToSrcDoc() && typeof requestAnimationFrame === "function") {
      let attempts = 0
      const poll = () => {
        attempts += 1
        if (!attachToSrcDoc() && attempts < 120) {
          rafId = requestAnimationFrame(poll)
        }
      }
      rafId = requestAnimationFrame(poll)
    }

    return () => {
      iframe.removeEventListener("load", handleLoad)
      window.removeEventListener("resize", updateHeight)
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId)
      }
      teardownDocObservers()
    }
  }, [srcDoc, srcDocSig, updateHeight])

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
            <span className="truncate">{t("mail.remoteImagesBlocked")}</span>
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
              <span>{t("mail.loadImages")}</span>
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
              title={t("mail.alwaysLoadTitle")}
            >
              <span>{t("mail.alwaysLoad")}</span>
            </Button>
          </div>
        </div>
      ) : autoLoadImages && containsRemoteImages ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <span>{t("mail.imagesAutoLoaded")}</span>
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
            {t("mail.blockByDefault")}
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
          title={t("mail.emailContent")}
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
