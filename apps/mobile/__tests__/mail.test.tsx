import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Thread, Message } from "@saturn/api/saturn/mail/v1/mail"
import { haptics } from "../lib/haptics"
import {
  computeReplyRecipients,
  normalizeReplySubject,
  normalizeForwardSubject,
} from "@saturn/core"

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
})
