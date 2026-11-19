import React, { useState, useMemo, useCallback } from "react"
import {
  View,
  Text,
  Pressable,
  Linking,
  type LayoutChangeEvent,
} from "react-native"
import { WebView, type WebViewNavigation } from "react-native-webview"
import { ShieldAlert, Image as ImageIcon } from "lucide-react-native"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { getApiBaseUrl } from "@/lib/config"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  buildMobileMessageDocumentHtml,
  INJECTED_EMAIL_LAYOUT_JS,
} from "./message-webview-html"

export interface MessageWebViewProps {
  html: string
  plainText?: string
  hasRemoteImages?: boolean
  attachments?: Attachment[]
  onLinkPress?: (url: string) => void
}

export function MessageWebView({
  html,
  plainText,
  hasRemoteImages = false,
  attachments = [],
  onLinkPress,
}: MessageWebViewProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [loadImages, setLoadImages] = useState(false)
  const [webViewHeight, setWebViewHeight] = useState(48)
  const [containerWidth, setContainerWidth] = useState(300)

  const containsRemoteImages = useMemo(() => {
    return Boolean(
      hasRemoteImages ||
      (html &&
        (/data-saturn-remote-(?:src|srcset|background)/i.test(html) ||
          /<(?:img|image|source)\b[^>]*\b(?:src|srcset)\s*=\s*["']?(?:https?:|\/\/)/i.test(
            html
          )))
    )
  }, [hasRemoteImages, html])

  const fullHtmlDocument = useMemo(
    () =>
      buildMobileMessageDocumentHtml({
        html,
        plainText,
        attachments,
        loadImages,
        apiBaseUrl: getApiBaseUrl(),
      }),
    [html, plainText, attachments, loadImages]
  )

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (
          data.type === "RESIZE" &&
          typeof data.height === "number" &&
          data.height > 0
        ) {
          const nextHeight = Math.max(36, Math.ceil(data.height))
          setWebViewHeight((prev) => (prev === nextHeight ? prev : nextHeight))
        }
      } catch {
        // Ignore malformed messages
      }
    },
    []
  )

  const handleShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      if (
        request.url === "about:blank" ||
        request.url.startsWith("about:blank") ||
        request.url.startsWith("data:")
      ) {
        return true
      }

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
      {containsRemoteImages && !loadImages && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextRow}>
            <ShieldAlert size={14} color={colors.warning} />
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
            <ImageIcon size={12} color={colors.warning} />
            <Text style={styles.loadImagesBtnText}>Load images</Text>
          </Pressable>
        </View>
      )}

      <View
        style={[
          styles.webViewWrapper,
          { height: webViewHeight, width: containerWidth },
        ]}
      >
        <WebView
          testID="mobile-message-webview"
          originWhitelist={["about:blank", "https://*", "http://*"]}
          source={{ html: fullHtmlDocument, baseUrl: "about:blank" }}
          injectedJavaScript={INJECTED_EMAIL_LAYOUT_JS}
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

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    width: "100%" as const,
  },
  bannerContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: `${t.colors.warning}4D`,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  bannerTextRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
  },
  bannerText: {
    fontSize: 12,
    color: t.colors.warning,
    fontWeight: "500" as const,
  },
  loadImagesBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: `${t.colors.warning}26`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.xs,
  },
  loadImagesBtnText: {
    fontSize: 11,
    color: t.colors.warning,
    fontWeight: "600" as const,
  },
  webViewWrapper: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.sm,
    overflow: "hidden" as const,
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
})
