import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { View, StyleSheet, Linking, type LayoutChangeEvent } from "react-native"
import {
  WebView,
  type WebViewNavigation,
  type WebViewProps,
} from "react-native-webview"
import { stripHtmlToPlainText } from "@saturn/core"
import { theme } from "@/lib/theme"
import {
  buildMobileEditorDocumentHtml,
  EMPTY_ACTIVE_FORMATS,
  type EmailEditorActiveFormats,
  type EmailEditorCommand,
} from "./email-editor-html"

export {
  EMPTY_ACTIVE_FORMATS,
  buildMobileEditorDocumentHtml,
  type EmailEditorActiveFormats,
  type EmailEditorCommand,
}

type WebViewHandle = {
  injectJavaScript: (script: string) => void
}

const WebViewWithRef = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewHandle>
>

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
  autoFocus?: boolean
  testID?: string
  onContentChange?: () => void
  onActiveFormatsChange?: (formats: EmailEditorActiveFormats) => void
  onLinkPress?: (url: string) => void
}

export const EmailRichEditor = forwardRef<
  EmailRichEditorHandle,
  EmailRichEditorProps
>(function EmailRichEditor(
  {
    bodyHtml,
    stylesHtml = "",
    placeholder = "Compose email...",
    minHeight = 220,
    autoFocus = false,
    testID = "mobile-composer-editor",
    onContentChange,
    onActiveFormatsChange,
    onLinkPress,
  },
  ref
) {
  const webViewRef = useRef<WebViewHandle>(null)
  const isDirtyRef = useRef(false)
  const latestHtmlRef = useRef(bodyHtml)
  const latestTextRef = useRef(stripHtmlToPlainText(bodyHtml))
  const [webViewHeight, setWebViewHeight] = useState(minHeight)
  const [containerWidth, setContainerWidth] = useState(300)

  const onContentChangeRef = useRef(onContentChange)
  const onActiveFormatsChangeRef = useRef(onActiveFormatsChange)
  useEffect(() => {
    onContentChangeRef.current = onContentChange
    onActiveFormatsChangeRef.current = onActiveFormatsChange
  })

  const propKey = useMemo(
    () => `${stylesHtml}\0${bodyHtml}`,
    [stylesHtml, bodyHtml]
  )
  const lastWrittenPropKeyRef = useRef<string>(propKey)

  const [documentHtml, setDocumentHtml] = useState(() =>
    buildMobileEditorDocumentHtml({
      bodyHtml,
      stylesHtml,
      placeholder,
      minHeight,
      autoFocus,
    })
  )

  useEffect(() => {
    if (lastWrittenPropKeyRef.current === propKey) return
    if (!isDirtyRef.current) {
      lastWrittenPropKeyRef.current = propKey
      latestHtmlRef.current = bodyHtml
      latestTextRef.current = stripHtmlToPlainText(bodyHtml)
      setDocumentHtml(
        buildMobileEditorDocumentHtml({
          bodyHtml,
          stylesHtml,
          placeholder,
          minHeight,
          autoFocus,
        })
      )
    }
  }, [propKey, bodyHtml, stylesHtml, placeholder, minHeight, autoFocus])

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => {
        const inner = latestHtmlRef.current
        if (!inner && !stylesHtml) return ""
        return stylesHtml ? `${stylesHtml}${inner}` : inner
      },
      getText: () => latestTextRef.current.trim(),
      execFormat: (command: EmailEditorCommand) => {
        const escaped = JSON.stringify(command)
        webViewRef.current?.injectJavaScript(
          `window.__saturnEditor && window.__saturnEditor.execFormat(${escaped}); true;`
        )
      },
      revealRemoteImages: () => {
        webViewRef.current?.injectJavaScript(
          `window.__saturnEditor && window.__saturnEditor.revealRemoteImages(); true;`
        )
      },
      focus: () => {
        webViewRef.current?.injectJavaScript(
          `window.__saturnEditor && window.__saturnEditor.focus(); true;`
        )
      },
    }),
    [stylesHtml]
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
          const nextHeight = Math.max(minHeight, Math.ceil(data.height) + 12)
          setWebViewHeight((prev) => (prev === nextHeight ? prev : nextHeight))
        } else if (data.type === "CHANGE") {
          isDirtyRef.current = true
          if (typeof data.html === "string") {
            latestHtmlRef.current = data.html
          }
          if (typeof data.text === "string") {
            latestTextRef.current = data.text
          }
          onContentChangeRef.current?.()
        } else if (data.type === "FORMATS" && data.formats) {
          onActiveFormatsChangeRef.current?.(
            data.formats as EmailEditorActiveFormats
          )
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [minHeight]
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
      <View
        style={[
          styles.editorWrapper,
          { height: webViewHeight, width: containerWidth },
        ]}
      >
        <WebViewWithRef
          ref={webViewRef}
          testID={testID}
          originWhitelist={["about:blank"]}
          source={{ html: documentHtml, baseUrl: "about:blank" }}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled={true}
          domStorageEnabled={false}
          scalesPageToFit={false}
          keyboardDisplayRequiresUserAction={false}
          style={styles.webView}
        />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  editorWrapper: {
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
})
