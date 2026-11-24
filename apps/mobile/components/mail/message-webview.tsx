import React, { useState, useMemo, useCallback, useRef } from "react"
import { View, Text, Pressable, Linking } from "react-native"
import {
  WebView,
  type WebViewNavigation,
  type WebViewProps,
} from "react-native-webview"
import { ShieldAlert, Image as ImageIcon } from "lucide-react-native"
import { useI18n } from "@saturn/hooks"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { getApiBaseUrl } from "@/lib/config"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  buildMobileMessageDocumentHtml,
  INJECTED_EMAIL_LAYOUT_JS,
} from "./message-webview-html"

function estimateInitialWebViewHeight(
  html?: string,
  plainText?: string
): number {
  const len = (html?.length || 0) + (plainText?.length || 0)
  if (len > 8000) return 360
  if (len > 2000) return 220
  if (len > 400) return 140
  return 72
}

type WebViewHandle = {
  injectJavaScript: (script: string) => void
}

const WebViewWithRef = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>

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
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const webViewRef = useRef<WebViewHandle>(null)
  const [loadImages, setLoadImages] = useState(false)
  const [webViewHeight, setWebViewHeight] = useState(() =>
    estimateInitialWebViewHeight(html, plainText)
  )

  const containsRemoteImages = useMemo(() => {
    return Boolean(
      hasRemoteImages ||
      (html &&
        (/data-saturn-remote-(?:src|srcset|background|style)/i.test(html) ||
          /<(?:img|image|source)\b[^>]*\b(?:src|srcset)\s*=\s*["']?(?:https?:|\/\/)/i.test(
            html
          ) ||
          /url\(\s*["']?https?:/i.test(html)))
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

  return (
    <View style={styles.container}>
      {containsRemoteImages && !loadImages && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextRow}>
            <ShieldAlert size={14} color={colors.warning} />
            <Text style={styles.bannerText}>
              {t("mail.remoteImagesBlockedShort")}
            </Text>
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
            <Text style={styles.loadImagesBtnText}>{t("mail.loadImages")}</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.webViewWrapper, { height: webViewHeight }]}>
        <WebViewWithRef
          ref={webViewRef}
          testID="mobile-message-webview"
          originWhitelist={["about:blank", "https://*", "http://*"]}
          source={{ html: fullHtmlDocument, baseUrl: "about:blank" }}
          injectedJavaScript={INJECTED_EMAIL_LAYOUT_JS}
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress >= 0.1) {
              webViewRef.current?.injectJavaScript(
                "if(window.__saturnEmailLayoutMeasure)window.__saturnEmailLayoutMeasure();true;"
              )
            }
          }}
          onLoadEnd={() => {
            webViewRef.current?.injectJavaScript(INJECTED_EMAIL_LAYOUT_JS)
          }}
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
    width: "100%" as const,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    width: "100%" as const,
    backgroundColor: "transparent",
  },
})
