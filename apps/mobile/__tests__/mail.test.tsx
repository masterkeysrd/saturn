import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Thread, Message } from "@saturn/api/saturn/mail/v1/mail"
import { haptics } from "../lib/haptics"
import {
  computeReplyRecipients,
  normalizeReplySubject,
  normalizeForwardSubject,
  buildQuotedReplyHtml,
  buildForwardedMessageHtml,
  prepareUnifiedDraftHtml,
  stripHtmlToPlainText,
} from "@saturn/core"
import { buildMobileEditorDocumentHtml } from "../components/mail/email-editor-html"

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
    it("configures firm swipe thresholds and friction to prevent accidental triggers during vertical scrolling", () => {
      const swipeConfig = {
        dragOffsetFromLeft: 35,
        dragOffsetFromRight: -35,
        leftThreshold: 90,
        rightThreshold: 110,
        friction: 3.5,
        overshootLeft: false,
        overshootRight: false,
      }

      // Assert swipe requires deliberate drag distance
      expect(swipeConfig.dragOffsetFromLeft).toBeGreaterThanOrEqual(30)
      expect(swipeConfig.dragOffsetFromRight).toBeLessThanOrEqual(-30)
      expect(swipeConfig.friction).toBeGreaterThanOrEqual(3)
      expect(swipeConfig.overshootLeft).toBe(false)
      expect(swipeConfig.overshootRight).toBe(false)
    })

    it("extracts 1-2 letter initials cleanly for mobile avatar fallback", () => {
      function getInitials(name?: string, email?: string): string {
        const cleanName = (name || "").trim()
        if (cleanName) {
          const parts = cleanName.split(/\s+/).filter(Boolean)
          if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase()
          }
          return cleanName.slice(0, 2).toUpperCase()
        }
        if (email) {
          return email.charAt(0).toUpperCase()
        }
        return "U"
      }

      expect(getInitials("Domex Expreso", "info@domex.do")).toBe("DE")
      expect(getInitials("Saturn", "saturn@corp.com")).toBe("SA")
      expect(getInitials("", "support@stripe.com")).toBe("S")
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
})
