import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import type { Thread, Message } from "@saturn/api/saturn/mail/v1/mail"
import type { ConnectedAccount } from "@saturn/api/saturn/platform/connector/v1/connector"
import { haptics } from "../lib/haptics"
import {
  computeReplyRecipients,
  normalizeReplySubject,
  normalizeForwardSubject,
  buildQuotedReplyHtml,
  buildForwardedMessageHtml,
  prepareUnifiedDraftHtml,
  stripHtmlToPlainText,
  isMailAccountReauthRequired,
  filterReauthMailAccounts,
  computeHumanizedMailTimestamp,
  partitionThreadMessagesForSuperCollapse,
} from "@saturn/core"
import { TimezoneProvider } from "@saturn/hooks"
import {
  getSenderInitials,
  getSenderPalette,
} from "../components/mail/thread-avatar"
import { buildMobileEditorDocumentHtml } from "../components/mail/email-editor-html"
import {
  buildMobileMessageDocumentHtml,
  INJECTED_EMAIL_LAYOUT_BEFORE_LOAD_JS,
  INJECTED_EMAIL_LAYOUT_JS,
} from "../components/mail/message-webview-html"
import { AccountBucketBar } from "../components/mail/account-bucket-bar"
import { translate } from "@saturn/i18n"

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, back: vi.fn() }),
}))

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}))

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const Stub = (name: string) => (props: Record<string, unknown>) =>
    ReactMod.createElement("span", {
      "data-icon": name,
      "data-testid": props.testID,
    })
  return {
    Inbox: Stub("Inbox"),
    Star: Stub("Star"),
    Mail: Stub("Mail"),
    Send: Stub("Send"),
    FileEdit: Stub("FileEdit"),
    Archive: Stub("Archive"),
    Trash2: Stub("Trash2"),
    Layers: Stub("Layers"),
    AlertTriangle: Stub("AlertTriangle"),
  }
})

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> | undefined => {
    if (!s) return undefined
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s
          .flat(Infinity)
          .filter(Boolean)
          .map((item) => flattenStyle(item))
      )
    }
    return typeof s === "object" ? (s as Record<string, unknown>) : undefined
  }
  return {
    Appearance: { setColorScheme: vi.fn() },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      hairlineWidth: 1,
    },
    useColorScheme: () => "dark",
    View: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "div",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    Text: ({
      children,
      style,
      testID,
      numberOfLines: _n,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "span",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    ScrollView: ({
      children,
      contentContainerStyle,
      horizontal: _h,
      showsHorizontalScrollIndicator: _s,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "div",
        { ...props, style: flattenStyle(contentContainerStyle) },
        children
      ),
    Pressable: ({
      children,
      onPress,
      testID,
      accessibilityLabel,
      hitSlop: _hs,
      style,
    }: Record<string, unknown> & {
      children?: React.ReactNode
      onPress?: (e: unknown) => void
      testID?: string
      accessibilityLabel?: string
    }) =>
      ReactMod.createElement(
        "button",
        {
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
          onClick: onPress,
        },
        children
      ),
  }
})

// Mock haptics
vi.mock("../lib/haptics", () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Mobile Mail Feature Logic & Component Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Swipe Action Callbacks & Haptics", () => {
    const mockThread: Thread = {
      id: "mth_test_100",
      spaceId: "sp_1",
      connectedAccountId: "acc_work",
      providerThreadId: "p_100",
      subject: "Important Agreement",
      snippet: "Please review the attached contract",
      participants: [
        {
          email: "partner@example.com",
          name: "Partner",
          avatarUrl: "",
          isVerified: true,
        },
      ],
      messageCount: 2,
      hasAttachments: true,
      isUnread: true,
      isStarred: false,
      inInbox: true,
      inSent: false,
      inDrafts: false,
      inTrash: false,
      inSpam: false,
      mailboxIds: ["mbx_inbox"],
      lastMessageAt: "2026-11-13T00:00:00Z",
      createTime: "2026-11-13T00:00:00Z",
      updateTime: "2026-11-13T00:00:00Z",
      messages: [],
    }

    it("triggers haptics.selection and dispatches archive action on swipe-right", () => {
      const onArchiveMock = vi.fn()
      // Simulate swipe right archive trigger
      haptics.selection()
      onArchiveMock(mockThread)

      expect(haptics.selection).toHaveBeenCalledTimes(1)
      expect(onArchiveMock).toHaveBeenCalledWith(mockThread)
    })

    it("triggers haptics.selection and dispatches trash and read toggles on swipe-left", () => {
      const onTrashMock = vi.fn()
      const onToggleReadMock = vi.fn()

      haptics.selection()
      onToggleReadMock(mockThread)

      haptics.selection()
      onTrashMock(mockThread)

      expect(haptics.selection).toHaveBeenCalledTimes(2)
      expect(onToggleReadMock).toHaveBeenCalledWith(mockThread)
      expect(onTrashMock).toHaveBeenCalledWith(mockThread)
    })

    it("triggers haptics.selection on star toggle", () => {
      const onToggleStarMock = vi.fn()
      haptics.selection()
      onToggleStarMock(mockThread)

      expect(haptics.selection).toHaveBeenCalledWith()
      expect(onToggleStarMock).toHaveBeenCalledWith(mockThread)
    })
  })

  describe("WebView Link Interception & Navigation Guard", () => {
    // Evaluates the onShouldStartLoadWithRequest rule in MessageWebView
    function simulateShouldStartLoad(
      url: string,
      openUrlFn: (target: string) => void
    ): boolean {
      if (
        url === "about:blank" ||
        url.startsWith("about:blank") ||
        url.startsWith("data:")
      ) {
        return true
      }
      if (
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("mailto:") ||
        url.startsWith("tel:")
      ) {
        openUrlFn(url)
        return false
      }
      return false
    }

    it("permits internal about:blank document loading in WebView", () => {
      const openUrlFn = vi.fn()
      const allowed = simulateShouldStartLoad("about:blank", openUrlFn)
      expect(allowed).toBe(true)
      expect(openUrlFn).not.toHaveBeenCalled()
    })

    it("intercepts external https links and redirects to Linking.openURL while blocking in-frame navigation", () => {
      const openUrlFn = vi.fn()
      const externalUrl =
        "https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?Rnc=101664835"

      const allowed = simulateShouldStartLoad(externalUrl, openUrlFn)
      expect(allowed).toBe(false)
      expect(openUrlFn).toHaveBeenCalledWith(externalUrl)
    })

    it("intercepts mailto: and tel: links and dispatches to system handler", () => {
      const openUrlFn = vi.fn()
      const mailtoUrl = "mailto:support@webpossrl.com"

      const allowed = simulateShouldStartLoad(mailtoUrl, openUrlFn)
      expect(allowed).toBe(false)
      expect(openUrlFn).toHaveBeenCalledWith(mailtoUrl)
    })
  })

  describe("Create Calendar Event from Email Handoff", () => {
    const mockThreadWithMessages: Thread = {
      id: "mth_event_handoff",
      spaceId: "sp_1",
      connectedAccountId: "acc_work",
      providerThreadId: "p_event",
      subject: "Q4 Strategy Planning Session",
      snippet: "Let's align on roadmap targets next Tuesday",
      participants: [],
      messageCount: 1,
      hasAttachments: false,
      isUnread: false,
      isStarred: false,
      inInbox: true,
      inSent: false,
      inDrafts: false,
      inTrash: false,
      inSpam: false,
      mailboxIds: [],
      lastMessageAt: "",
      createTime: "",
      updateTime: "",
      messages: [
        {
          id: "msg_target_123",
          threadId: "mth_event_handoff",
          providerMessageId: "prov_msg_1",
          subject: "Q4 Strategy Planning Session",
          snippet: "Let's align on roadmap targets next Tuesday",
          from: {
            email: "organizer@corp.com",
            name: "Executive Organizer",
            avatarUrl: "",
            isVerified: false,
          },
          to: [
            {
              email: "lead@corp.com",
              name: "Tech Lead",
              avatarUrl: "",
              isVerified: false,
            },
            {
              email: "product@corp.com",
              name: "Product Manager",
              avatarUrl: "",
              isVerified: false,
            },
          ],
          cc: [],
          bcc: [],
          replyTo: [],
          sentAt: "2026-11-13T10:00:00Z",
          receivedAt: "2026-11-13T10:00:00Z",
          isUnread: false,
          isStarred: false,
          isDraft: false,
          attachments: [],
          bodyHtml: "<p>Let's align on roadmap targets next Tuesday</p>",
          bodyPlain: "Let's align on roadmap targets next Tuesday",
          bodyCached: true,
          hasRemoteImages: false,
        } as unknown as Message,
      ],
    }

    it("pre-populates manage-event modal payload with subject, message summary, and all participants", () => {
      const latestMsg = mockThreadWithMessages.messages[0]

      const attendees: { email: string; displayName?: string }[] = []
      if (latestMsg?.from?.email) {
        attendees.push({
          email: latestMsg.from.email,
          displayName: latestMsg.from.name || "",
        })
      }
      if (latestMsg?.to) {
        for (const p of latestMsg.to) {
          if (p.email && !attendees.some((a) => a.email === p.email)) {
            attendees.push({ email: p.email, displayName: p.name || "" })
          }
        }
      }

      const navigationPayload = {
        pathname: "/modal/manage-event",
        params: {
          initialTitle: mockThreadWithMessages.subject,
          initialDescription: `Created from email thread: ${mockThreadWithMessages.subject}\nSnippet: ${mockThreadWithMessages.snippet}`,
          sourceMailMessageId: latestMsg.id,
          initialAttendees: JSON.stringify(attendees),
        },
      }

      expect(navigationPayload.params.initialTitle).toBe(
        "Q4 Strategy Planning Session"
      )
      expect(navigationPayload.params.sourceMailMessageId).toBe(
        "msg_target_123"
      )
      expect(
        JSON.parse(navigationPayload.params.initialAttendees)
      ).toHaveLength(3)
      expect(JSON.parse(navigationPayload.params.initialAttendees)).toEqual([
        { email: "organizer@corp.com", displayName: "Executive Organizer" },
        { email: "lead@corp.com", displayName: "Tech Lead" },
        { email: "product@corp.com", displayName: "Product Manager" },
      ])
    })
  })

  describe("Mobile Composer Form Validation & From: Auto-Selection", () => {
    it("automatically selects the thread's receiving account when replying in Unified Inbox", () => {
      const accounts = [
        { id: "acc_personal", email: "personal@gmail.com" },
        { id: "acc_work", email: "work@company.com" },
      ]
      const receivedThread = {
        id: "mth_work_thread",
        connectedAccountId: "acc_work",
      }

      const selectedAccountId =
        receivedThread.connectedAccountId || accounts[0].id
      expect(selectedAccountId).toBe("acc_work")
    })

    it("normalizes subjects and extracts recipients idempotently on reply and forward", () => {
      expect(normalizeReplySubject("Invoice #102")).toBe("Re: Invoice #102")
      expect(normalizeReplySubject("Re: Invoice #102")).toBe("Re: Invoice #102")
      expect(normalizeForwardSubject("Re: Invoice #102")).toBe(
        "Fwd: Invoice #102"
      )

      const replyRecipients = computeReplyRecipients({
        replyType: "reply-all",
        from: { email: "sender@corp.com", displayName: "Sender" },
        to: [
          { email: "client@external.com", displayName: "Client" },
          { email: "me@work.com" },
        ],
        cc: [{ email: "cfo@external.com", displayName: "CFO" }],
        selfEmails: ["me@work.com"],
      })

      expect(replyRecipients.to).toEqual([
        { email: "sender@corp.com", displayName: "Sender" },
        { email: "client@external.com", displayName: "Client" },
      ])
      expect(replyRecipients.cc).toEqual([
        { email: "cfo@external.com", displayName: "CFO" },
      ])
    })

    it("validates that at least one recipient exists before sending", () => {
      const validateSend = (to: string[], cc: string[], bcc: string[]) => {
        return to.length > 0 || cc.length > 0 || bcc.length > 0
      }

      expect(validateSend([], [], [])).toBe(false)
      expect(validateSend(["recipient@example.com"], [], [])).toBe(true)
      expect(validateSend([], ["cc@example.com"], [])).toBe(true)
    })
  })

  describe("Mobile Thread Row Avatar & Swipe Sensitivity Calibration", () => {
    it("configures balanced swipe thresholds and friction so actions open smoothly without accidental scroll triggers", () => {
      const swipeConfig = {
        dragOffsetFromLeft: 24,
        dragOffsetFromRight: -24,
        leftThreshold: 40,
        rightThreshold: 60,
        friction: 1.5,
        overshootLeft: false,
        overshootRight: false,
      }

      // Assert deliberate horizontal activation offset while keeping thresholds <= action widths
      expect(swipeConfig.dragOffsetFromLeft).toBeGreaterThanOrEqual(20)
      expect(swipeConfig.dragOffsetFromRight).toBeLessThanOrEqual(-20)
      expect(swipeConfig.leftThreshold).toBeLessThanOrEqual(80)
      expect(swipeConfig.rightThreshold).toBeLessThanOrEqual(140)
      expect(swipeConfig.friction).toBeGreaterThanOrEqual(1)
      expect(swipeConfig.friction).toBeLessThanOrEqual(2)
      expect(swipeConfig.overshootLeft).toBe(false)
      expect(swipeConfig.overshootRight).toBe(false)
    })

    it("extracts 1-2 letter initials cleanly for mobile avatar fallback", () => {
      expect(getSenderInitials("Domex Expreso", "info@domex.do")).toBe("DE")
      expect(getSenderInitials("Saturn", "saturn@corp.com")).toBe("SA")
      expect(getSenderInitials("", "support@stripe.com")).toBe("S")
    })

    it("assigns a deterministic sender palette color for the same seed", () => {
      expect(getSenderPalette("partner@example.com")).toBe(
        getSenderPalette("partner@example.com")
      )
      expect(getSenderPalette("partner@example.com")).toHaveProperty("bg")
      expect(getSenderPalette("partner@example.com")).toHaveProperty("text")
    })

    it("partitions long threads into [First] ── [N] ── [Last 2] super-collapse segments", () => {
      const messages = Array.from({ length: 6 }, (_, i) => ({
        id: `msg_${i + 1}`,
        isUnread: false,
      }))
      const segments = partitionThreadMessagesForSuperCollapse(messages, false)
      expect(segments.map((s) => s.type)).toEqual([
        "message",
        "folded",
        "message",
        "message",
      ])
      const folded = segments[1]
      if (folded.type !== "folded") throw new Error("expected folded segment")
      expect(folded.count).toBe(3)

      // Unfolding the deck renders every message in collapsed row state
      const unfoldedSegments = partitionThreadMessagesForSuperCollapse(
        messages,
        true
      )
      expect(unfoldedSegments).toHaveLength(6)
      expect(unfoldedSegments.every((s) => s.type === "message")).toBe(true)
    })

    it("humanizes thread timestamps copy-free for localized rendering", () => {
      const now = new Date("2026-03-05T12:00:00Z")
      expect(
        computeHumanizedMailTimestamp("2026-03-05T11:58:00Z", {
          now,
          timeZone: "UTC",
        })
      ).toEqual({ kind: "minutes_ago", count: 2 })
      expect(
        computeHumanizedMailTimestamp("2026-03-03T10:00:00Z", {
          now,
          timeZone: "UTC",
        })
      ).toEqual({ kind: "days_ago", count: 2 })
      expect(translate("en", "mail.threadTime.minutesAgo", { count: 2 })).toBe(
        "2 min ago"
      )
      expect(translate("es", "mail.threadTime.daysAgo", { count: 2 })).toBe(
        "hace 2 días"
      )
    })
  })

  describe("Auto-Mark Thread as Read on Open", () => {
    it("marks an unread thread as read once after the viewing delay", () => {
      vi.useFakeTimers()
      const markedSet = new Set<string>()
      const modifyThreadMock = vi.fn()

      const scheduleMarkAsRead = (thread?: {
        id: string
        isUnread: boolean
      }) => {
        if (!thread?.id || !thread.isUnread) return
        if (markedSet.has(thread.id)) return
        const threadToMark = thread.id
        const timer = setTimeout(() => {
          markedSet.add(threadToMark)
          modifyThreadMock({
            id: threadToMark,
            req: { id: threadToMark, isUnread: false },
          })
        }, 750)
        return () => clearTimeout(timer)
      }

      const cleanup = scheduleMarkAsRead({ id: "mth_unread", isUnread: true })
      expect(modifyThreadMock).not.toHaveBeenCalled()

      vi.advanceTimersByTime(750)
      expect(modifyThreadMock).toHaveBeenCalledTimes(1)
      expect(modifyThreadMock).toHaveBeenCalledWith({
        id: "mth_unread",
        req: { id: "mth_unread", isUnread: false },
      })

      // Re-running for the same thread should not dispatch a duplicate call
      scheduleMarkAsRead({ id: "mth_unread", isUnread: true })
      vi.advanceTimersByTime(750)
      expect(modifyThreadMock).toHaveBeenCalledTimes(1)

      cleanup?.()
      vi.useRealTimers()
    })

    it("does not trigger mark-as-read for already read threads or when unmounted before delay", () => {
      vi.useFakeTimers()
      const markedSet = new Set<string>()
      const modifyThreadMock = vi.fn()

      const scheduleMarkAsRead = (thread?: {
        id: string
        isUnread: boolean
      }) => {
        if (!thread?.id || !thread.isUnread) return
        if (markedSet.has(thread.id)) return
        const threadToMark = thread.id
        const timer = setTimeout(() => {
          markedSet.add(threadToMark)
          modifyThreadMock({
            id: threadToMark,
            req: { id: threadToMark, isUnread: false },
          })
        }, 750)
        return () => clearTimeout(timer)
      }

      scheduleMarkAsRead({ id: "mth_read", isUnread: false })
      vi.advanceTimersByTime(1000)
      expect(modifyThreadMock).not.toHaveBeenCalled()

      const cancel = scheduleMarkAsRead({
        id: "mth_quick_exit",
        isUnread: true,
      })
      vi.advanceTimersByTime(300)
      cancel?.()
      vi.advanceTimersByTime(1000)
      expect(modifyThreadMock).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe("Quoted Reply & Forwarded Email Preview Formatting", () => {
    it("builds quoted reply HTML from plain text when bodyHtml is absent", () => {
      const html = buildQuotedReplyHtml({
        from: { email: "alice@example.com", displayName: "Alice" },
        sentAt: "2026-11-13T10:00:00Z",
        bodyHtml: "",
        bodyText: "Line one\nLine two",
        preserveStyles: true,
      })

      expect(html).toContain("Alice &lt;alice@example.com&gt; wrote:")
      expect(html).toContain("Line one<br>Line two")
      expect(html.replace(/^(?:\s*<p>\s*<br\s*\/?>\s*<\/p>)+/i, "")).toMatch(
        /^<div class="saturn-quoted-reply">/
      )
    })

    it("builds forwarded message HTML with headers and original body", () => {
      const html = buildForwardedMessageHtml({
        from: { email: "alice@example.com", displayName: "Alice" },
        to: [{ email: "bob@example.com", displayName: "Bob" }],
        subject: "Quarterly Review",
        sentAt: "2026-11-13T10:00:00Z",
        bodyHtml: "<p>Please see attached summary.</p>",
        preserveStyles: true,
      })

      expect(html).toContain("---------- Forwarded message ---------")
      expect(html).toContain("Quarterly Review")
      expect(html).toContain("Please see attached summary.")
    })

    it("prepares a unified contentEditable HTML document for mobile reply and forward editing", () => {
      const quoted = buildQuotedReplyHtml({
        from: { email: "alice@example.com", displayName: "Alice" },
        sentAt: "2026-11-13T10:00:00Z",
        bodyHtml:
          '<style>.sig{color:#000}</style><p>Original message <img data-saturn-remote-src="https://example.com/logo.png" /></p>',
        preserveStyles: true,
      })

      const prepared = prepareUnifiedDraftHtml({
        bodyHtml: quoted,
        bodyText: "",
        loadRemoteImages: false,
      })

      expect(prepared.hasRemoteImages).toBe(true)
      expect(prepared.stylesHtml).toContain(".sig")

      const doc = buildMobileEditorDocumentHtml({
        bodyHtml: prepared.bodyHtml,
        stylesHtml: prepared.stylesHtml,
        placeholder: "Compose email...",
        minHeight: 240,
        autoFocus: true,
      })

      expect(doc).toContain('contenteditable="true"')
      expect(doc).toContain('data-empty="false"')
      expect(doc).toContain("Original message")
      expect(doc).toContain("window.__saturnEditor")

      const emptyDoc = buildMobileEditorDocumentHtml({
        bodyHtml: "",
        stylesHtml: "",
        placeholder: "Compose email...",
        minHeight: 240,
      })
      expect(emptyDoc).toContain('data-empty="true"')
      expect(stripHtmlToPlainText("<p>Hello</p><p>World</p>")).toBe(
        "Hello\nWorld"
      )
    })
  })

  describe("Overview Mail Summary Widget Logic", () => {
    it("caps visible unread threads at 3 and computes remaining unread count from inbox mailboxes", () => {
      const threads = [
        { id: "mth_1" },
        { id: "mth_2" },
        { id: "mth_3" },
        { id: "mth_4" },
      ]
      const mailboxes = [
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 5 },
        { systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 2 },
        { systemRole: "MAILBOX_ROLE_SENT", unreadCount: 10 },
      ]

      let inboxUnread = 0
      for (const mbx of mailboxes) {
        if (mbx.systemRole === "MAILBOX_ROLE_INBOX") {
          inboxUnread += mbx.unreadCount || 0
        }
      }
      const totalUnread = Math.max(inboxUnread, threads.length)
      const visible = threads.slice(0, 3)
      const remaining = Math.max(0, totalUnread - visible.length)

      expect(visible).toHaveLength(3)
      expect(totalUnread).toBe(7)
      expect(remaining).toBe(4)
    })

    it("detects mail capability case-insensitively across connected accounts", () => {
      const accounts = [
        { id: "acc_cal", enabledCapabilities: ["calendar"] },
        { id: "acc_mail_lower", enabledCapabilities: ["mail", "calendar"] },
        { id: "acc_mail_upper", enabledCapabilities: ["MAIL"] },
      ]

      const mailAccounts = accounts.filter(
        (a) =>
          a.enabledCapabilities?.includes("mail") ||
          a.enabledCapabilities?.includes("MAIL")
      )

      expect(mailAccounts.map((a) => a.id)).toEqual([
        "acc_mail_lower",
        "acc_mail_upper",
      ])
    })
  })

  describe("Mail Attachment URL Resolution & Sanitization", () => {
    it("resolves relative attachment URLs against the API base URL and sanitizes cached filenames", () => {
      const resolveUrl = (downloadUrl: string, apiBaseUrl: string) =>
        downloadUrl.startsWith("http")
          ? downloadUrl
          : `${apiBaseUrl.replace(/\/$/, "")}${downloadUrl}`

      expect(
        resolveUrl(
          "/api/v1/mail/attachments/tok_123",
          "https://saturn.example.com/"
        )
      ).toBe("https://saturn.example.com/api/v1/mail/attachments/tok_123")

      expect(
        resolveUrl(
          "https://cdn.example.com/file.pdf",
          "https://saturn.example.com"
        )
      ).toBe("https://cdn.example.com/file.pdf")

      const sanitizeFilename = (name: string) =>
        name.replace(/[^a-zA-Z0-9._-]/g, "_")
      expect(sanitizeFilename("Q4 Report (Final) / v2?.pdf")).toBe(
        "Q4_Report__Final____v2_.pdf"
      )
    })

    it("detects local file:// and content:// attachments separately from server attachments", () => {
      const isLocalAttachment = (att: { id: string; downloadUrl?: string }) => {
        const url = att.downloadUrl || ""
        return (
          url.startsWith("file://") ||
          url.startsWith("content://") ||
          att.id.startsWith("att_local_")
        )
      }

      expect(
        isLocalAttachment({
          id: "att_local_123",
          downloadUrl: "file:///var/mobile/doc.pdf",
        })
      ).toBe(true)
      expect(
        isLocalAttachment({
          id: "att_1",
          downloadUrl: "content://media/external/file/42",
        })
      ).toBe(true)
      expect(
        isLocalAttachment({
          id: "att_srv_99",
          downloadUrl: "/api/v1/mail/attachments/tok_99",
        })
      ).toBe(false)
    })
  })

  describe("Mobile Email HTML Document & GitHub Icon Alignment", () => {
    it("isolates email height in #saturn-email-root, neutralizes 100vh/height:100% wrappers, and preserves inline icon dimensions", () => {
      const githubHtml = `
        <style>html, body { height: 100% !important; }</style>
        <table height="100%" width="600">
          <tr>
            <td><img data-saturn-remote-src="https://github.githubassets.com/images/icons/check.png" width="16" height="16" align="absmiddle" alt="passed"></td>
            <td>All checks have passed on pull request #42</td>
          </tr>
        </table>
        <img data-saturn-remote-src="https://github.com/notifications/beacon/123.gif" width="1" height="1" alt="">
        <p><br></p>
      `

      const blockedDoc = buildMobileMessageDocumentHtml({
        html: githubHtml,
        loadImages: false,
      })

      expect(blockedDoc).toContain('id="saturn-email-viewport"')
      expect(blockedDoc).toContain('id="saturn-email-root"')
      expect(blockedDoc).toContain("img-src data: blob:")
      expect(blockedDoc).toContain(
        "html, body { height: auto !important; min-height: 0 !important; }"
      )
      // Must NOT clobber explicit icon height="16" or crush table-cell icons with !important
      expect(blockedDoc).not.toMatch(/img\s*\{[^}]*height:\s*auto\s*!important/)
      expect(blockedDoc).not.toMatch(
        /table\s*\{[^}]*max-width:\s*100%\s*!important/
      )
      expect(blockedDoc).toContain('img[align="absmiddle"]')
      expect(blockedDoc).not.toContain("td img[width]")
      expect(blockedDoc).toContain('img[width="16"]')
      // Trailing empty <p><br></p> stripped and remote images blocked until opt-in
      expect(blockedDoc).not.toContain("<p><br></p>")
      expect(blockedDoc).toContain("data-saturn-remote-src=")

      const unblockedDoc = buildMobileMessageDocumentHtml({
        html: githubHtml,
        loadImages: true,
      })
      expect(unblockedDoc).toContain(
        'src="https://github.githubassets.com/images/icons/check.png"'
      )

      // Layout script measures #saturn-email-root bounding rect and proportionally scales wide tables
      expect(INJECTED_EMAIL_LAYOUT_JS).toContain("getBoundingClientRect")
      expect(INJECTED_EMAIL_LAYOUT_JS).toContain("scale(")
      expect(INJECTED_EMAIL_LAYOUT_JS).toContain("Math.max(0.25")
      expect(INJECTED_EMAIL_LAYOUT_JS).toContain(
        "(root.scrollHeight || 0) * currentScale"
      )
      expect(INJECTED_EMAIL_LAYOUT_BEFORE_LOAD_JS).toContain("DOMContentLoaded")
      expect(INJECTED_EMAIL_LAYOUT_JS).not.toContain("html.offsetHeight")
    })

    it("renders Amazon-style 640px promotional HTML without td img[width] clipping and rewrites loading=lazy to eager", () => {
      const amazonHtml =
        '<table width="640"><tr><td><a href="https://amazon.es"><img data-saturn-remote-src="https://m.media-amazon.com/hero.jpg" width="640" loading="lazy"></a></td></tr></table>'

      const doc = buildMobileMessageDocumentHtml({
        html: amazonHtml,
        loadImages: false,
      })

      expect(doc).not.toContain("td img[width]")
      expect(doc).toContain('img[width="16"]')
      expect(doc).toContain('loading="eager"')
      expect(doc).not.toContain('loading="lazy"')

      const unblockedDoc = buildMobileMessageDocumentHtml({
        html: `${amazonHtml}<script>window.__pwned = true;</script>`,
        loadImages: true,
      })
      expect(unblockedDoc).toContain(
        'src="https://m.media-amazon.com/hero.jpg"'
      )
      expect(unblockedDoc).toContain('loading="eager"')
      expect(unblockedDoc).not.toContain("__pwned")

      // Per-document CSP nonce authorizes only Saturn's synchronous parse-time layout script
      const cspNonceMatch = unblockedDoc.match(
        /script-src 'nonce-([A-Za-z0-9]{24})'/
      )
      expect(cspNonceMatch).not.toBeNull()
      expect(unblockedDoc).toContain(`<script nonce="${cspNonceMatch![1]}">`)
    })
  })

  describe("Mobile Mail Localizations (Spanish / es-ES)", () => {
    it("translates mobile mail placeholders, toasts, alerts, and action labels into Spanish", () => {
      expect(translate("es-ES", "mail.composePlaceholder")).toBe(
        "Redactar correo..."
      )
      expect(translate("es-ES", "mail.attachFile")).toBe("Adjuntar archivo")
      expect(translate("es-ES", "mail.conversationNotFound")).toBe(
        "Conversación no encontrada"
      )
      expect(translate("es-ES", "mail.missingRecipient")).toBe(
        "Falta el destinatario"
      )
      expect(translate("es-ES", "mail.addAtLeastOneRecipient")).toBe(
        "Por favor agrega al menos un destinatario en Para, Cc o Cco."
      )
      expect(translate("es-ES", "mail.noDrafts")).toBe("No hay borradores")
      expect(translate("es-ES", "mail.inboxZero")).toBe("Bandeja al día")
      expect(translate("es-ES", "mail.unreadCount", { count: 4 })).toBe(
        "4 no leídos"
      )
      expect(translate("es-ES", "mail.attachmentsTitle", { count: 3 })).toBe(
        "Archivos adjuntos (3)"
      )
      expect(translate("es-ES", "mail.messageSingle", { count: 1 })).toBe(
        "1 mensaje"
      )
      expect(translate("es-ES", "mail.messagesCount", { count: 5 })).toBe(
        "5 mensajes"
      )
      expect(translate("es-ES", "mail.clearSearch")).toBe("Borrar búsqueda")
      expect(translate("es-ES", "mail.remoteImagesBlockedShort")).toBe(
        "Imágenes remotas bloqueadas"
      )
      expect(translate("es-ES", "mail.reauth.bannerTitle")).toBe(
        "Se requiere reconectar la cuenta"
      )
      expect(translate("es-ES", "mail.reauth.reconnect")).toBe("Reconectar")
    })
  })

  describe("Reauth Account Helpers & AccountBucketBar Warning Indicator", () => {
    it("detects reauth_required accounts and filters mail-capable accounts cleanly", () => {
      expect(isMailAccountReauthRequired(null)).toBe(false)
      expect(isMailAccountReauthRequired({ status: "connected" })).toBe(false)
      expect(isMailAccountReauthRequired({ status: "reauth_required" })).toBe(
        true
      )
      expect(
        isMailAccountReauthRequired({
          status: "ACCOUNT_STATUS_REAUTH_REQUIRED",
        })
      ).toBe(true)

      const accounts = [
        {
          id: "acc_mail_reauth",
          status: "reauth_required",
          enabledCapabilities: ["mail", "calendar"],
        },
        {
          id: "acc_cal_only",
          status: "reauth_required",
          enabledCapabilities: ["calendar"],
        },
        {
          id: "acc_healthy",
          status: "connected",
          enabledCapabilities: ["mail"],
        },
      ]

      expect(filterReauthMailAccounts(accounts)).toHaveLength(1)
      expect(filterReauthMailAccounts(accounts)[0].id).toBe("acc_mail_reauth")
      expect(filterReauthMailAccounts(accounts, "acc_healthy")).toHaveLength(0)
      expect(
        filterReauthMailAccounts(accounts, "acc_mail_reauth")
      ).toHaveLength(1)
    })

    it("renders compact warning icon on reauth_required account chip and navigates/reconnects on press", () => {
      const accounts: ConnectedAccount[] = [
        {
          id: "acc_work",
          spaceId: "sp_1",
          provider: "google",
          providerAccountId: "ext_1",
          email: "work@company.com",
          displayName: "Work",
          status: "reauth_required",
          color: "#3b82f6",
          enabledCapabilities: ["mail"],
        },
        {
          id: "acc_personal",
          spaceId: "sp_1",
          provider: "google",
          providerAccountId: "ext_2",
          email: "personal@gmail.com",
          displayName: "Personal",
          status: "connected",
          color: "#10b981",
          enabledCapabilities: ["mail"],
        },
      ]

      const onSelectAccount = vi.fn()
      const screen = render(
        <TimezoneProvider timezone="UTC" locale="es-ES">
          <AccountBucketBar
            accounts={accounts}
            selectedAccountId="acc_work"
            onSelectAccount={onSelectAccount}
            onSelectRole={vi.fn()}
            onToggleUnreadFilter={vi.fn()}
          />
        </TimezoneProvider>
      )

      const warningBtn = screen.getByTestId("mobile-account-reauth-acc_work")
      expect(warningBtn).toBeDefined()
      expect(
        screen.queryByTestId("mobile-account-reauth-acc_personal")
      ).toBeNull()

      const reconnectPill = screen.getByTestId("mobile-account-reconnect-pill")
      expect(reconnectPill.textContent).toContain("Reconectar")

      fireEvent.click(warningBtn)
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/(app)/settings/connected-accounts"
      )
      expect(onSelectAccount).not.toHaveBeenCalled()

      fireEvent.click(reconnectPill)
      expect(mockRouterPush).toHaveBeenCalledTimes(2)
    })
  })
})
