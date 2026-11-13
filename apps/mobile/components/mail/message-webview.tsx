import React, { useState, useMemo, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  type LayoutChangeEvent,
} from "react-native"
import { WebView, type WebViewNavigation } from "react-native-webview"
import { ShieldAlert, Image as ImageIcon } from "lucide-react-native"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface MessageWebViewProps {
  html: string
  plainText?: string
  hasRemoteImages?: boolean
  attachments?: Attachment[]
  onLinkPress?: (url: string) => void
}

const INJECTED_HEIGHT_MEASURE_JS = `
(function() {
  function postHeight() {
    var body = document.body;
    var html = document.documentElement;
    var height = Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0
    );
    if (window.ReactNativeWebView && height > 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESIZE', height: height }));
    }
  }

  window.addEventListener('load', postHeight);
  setTimeout(postHeight, 100);
  setTimeout(postHeight, 500);
  setTimeout(postHeight, 1500);

  // Measure when images load
  var images = document.images || [];
  for (var i = 0; i < images.length; i++) {
    images[i].addEventListener('load', postHeight);
  }
})();
true;
`

export function MessageWebView({
  html,
  plainText,
  hasRemoteImages = false,
  attachments = [],
  onLinkPress,
}: MessageWebViewProps) {
  const [loadImages, setLoadImages] = useState(false)
  const [webViewHeight, setWebViewHeight] = useState(100)
  const [containerWidth, setContainerWidth] = useState(300)

  const containsRemoteImages = useMemo(() => {
    return Boolean(
      hasRemoteImages || (html && html.includes("data-saturn-remote-src"))
    )
  }, [hasRemoteImages, html])

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
      source = `<div style="white-space: pre-wrap; font-family: -apple-system, system-ui; font-size: 14px; line-height: 1.5; color: #18181b;">${escaped}</div>`
    }
    if (!source)
      return "<div style='color: #71717a; font-family: -apple-system, system-ui; font-size: 13px;'>(Empty message)</div>"

    // 1. Resolve and rewrite cid: inline attachments
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

    // 2. Unblock remote images when user opts in
    if (loadImages) {
      source = source.replace(
        /data-saturn-remote-src=(["'])(.*?)\1/gi,
        'src="$2"'
      )
    }

    return source
  }, [html, plainText, attachments, loadImages])

  // Construct complete clean HTML document for native mobile viewing
  const fullHtmlDocument = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    :root {
      color-scheme: light;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.55;
      background-color: #ffffff;
      color: #18181b;
      word-break: break-word;
      overflow-x: hidden;
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
  ${processedHtml}
</body>
</html>`
  }, [processedHtml])

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (
          data.type === "RESIZE" &&
          typeof data.height === "number" &&
          data.height > 0
        ) {
          setWebViewHeight(Math.ceil(data.height) + 12)
        }
      } catch {
        // Ignore malformed messages
      }
    },
    []
  )

  const handleShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      // Allow the initial internal blank load
      if (
        request.url === "about:blank" ||
        request.url.startsWith("about:blank") ||
        request.url.startsWith("data:")
      ) {
        return true
      }

      // External links must never navigate inside the email WebView
      if (
        request.url.startsWith("http://") ||
        request.url.startsWith("https://") ||
        request.url.startsWith("mailto:") ||
        request.url.startsWith("tel:")
      ) {
        if (onLinkPress) {
          onLinkPress(request.url)
        } else {
          Linking.openURL(request.url).catch(() => {})
        }
        return false
      }

      return false
    },
    [onLinkPress]
  )

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout
    if (width > 0) {
      setContainerWidth(width)
    }
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Remote images privacy banner */}
      {containsRemoteImages && !loadImages && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextRow}>
            <ShieldAlert size={14} color={theme.colors.warning} />
            <Text style={styles.bannerText}>Remote images blocked</Text>
          </View>
          <Pressable
            testID="mobile-load-remote-images-btn"
            onPress={() => {
              haptics.selection()
              setLoadImages(true)
            }}
            style={styles.loadImagesBtn}
          >
            <ImageIcon size={12} color={theme.colors.warning} />
            <Text style={styles.loadImagesBtnText}>Load images</Text>
          </Pressable>
        </View>
      )}

      {/* Sandboxed WebView Body */}
      <View
        style={[
          styles.webViewWrapper,
          { height: webViewHeight, width: containerWidth },
        ]}
      >
        <WebView
          testID="mobile-message-webview"
          originWhitelist={["about:blank"]}
          source={{ html: fullHtmlDocument, baseUrl: "about:blank" }}
          injectedJavaScript={INJECTED_HEIGHT_MEASURE_JS}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled={true}
          domStorageEnabled={false}
          scalesPageToFit={false}
          style={styles.webView}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  bannerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  bannerTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  bannerText: {
    fontSize: 12,
    color: theme.colors.warning,
    fontWeight: "500",
  },
  loadImagesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.xs,
  },
  loadImagesBtnText: {
    fontSize: 11,
    color: theme.colors.warning,
    fontWeight: "600",
  },
  webViewWrapper: {
    backgroundColor: "#ffffff",
    borderRadius: theme.radius.sm,
    overflow: "hidden",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
})
